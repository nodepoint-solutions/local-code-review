#!/usr/bin/env node
/**
 * Generates all app icon assets from a single vector definition.
 *
 * Outputs:
 *   resources/iconTemplate.png       22×22  tray icon (1×)
 *   resources/iconTemplate@2x.png    44×44  tray icon (2× Retina)
 *   resources/icon-512.png          512×512 dock + Linux icon
 *   resources/icon.icns                     macOS app bundle icon
 *   resources/icon.ico                      Windows app icon
 *
 * Icon design — "merge check":
 *   Circle outline  → the PR / review scope
 *   Checkmark       → approve / resolve
 *   Two short stubs at ~10 and 2 o'clock on the circle → branch lines merging
 *
 * No external dependencies — uses only Node.js built-ins (zlib).
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

// ─── pixel renderer ───────────────────────────────────────────────────────────

/**
 * Returns a Uint8Array of grayscale+alpha pixels (2 bytes per pixel, GA)
 * for the icon rendered at `size` × `size`.
 */
function renderIcon(size) {
  const pixels = new Float32Array(size * size) // alpha channel (0–1); colour is black

  function setAlpha(x, y, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = y * size + x
    pixels[i] = Math.max(pixels[i], Math.min(1, a))
  }

  /** Antialiased circle stroke */
  function drawCircle(cx, cy, r, w) {
    const r0 = r - w / 2
    const r1 = r + w / 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < r0 - 1 || d > r1 + 1) continue
        const inner = d - r0
        const outer = r1 - d
        const cov = Math.min(Math.max(inner + 0.5, 0), 1) * Math.min(Math.max(outer + 0.5, 0), 1)
        setAlpha(x, y, cov)
      }
    }
  }

  /** Antialiased capsule line */
  function drawLine(x0, y0, x1, y1, w) {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return
    const ux = dx / len
    const uy = dy / len
    const hw = w / 2

    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - hw) - 1)
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1) + hw) + 1)
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - hw) - 1)
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1) + hw) + 1)

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x0
        const py = y + 0.5 - y0
        const along = Math.max(0, Math.min(len, px * ux + py * uy))
        const nearX = x0 + ux * along - (x + 0.5)
        const nearY = y0 + uy * along - (y + 0.5)
        const sdf = Math.sqrt(nearX * nearX + nearY * nearY) - hw
        setAlpha(x, y, Math.min(Math.max(-sdf + 0.5, 0), 1))
      }
    }
  }

  const sc = size / 22 // scale factor relative to the 22px design grid
  const cx = size / 2
  const cy = size / 2
  const r = 7.5 * sc
  const sw = 1.8 * sc // stroke width

  drawCircle(cx, cy, r, sw)

  // Checkmark: designed on 22px grid as (5,12)→(9,16)→(17,7)
  const [ax, ay, bx, by, cx2, cy2] = [5, 12, 9, 16, 17, 7].map((v) => v * sc)
  drawLine(ax, ay, bx, by, sw * 0.9)
  drawLine(bx, by, cx2, cy2, sw * 0.9)

  // Branch stubs at 10 o'clock (−40°) and 2 o'clock (+40°) from top
  const notchLen = 2.5 * sc
  const notchW = sw * 0.85
  for (const deg of [-40, 40]) {
    const rad = (deg - 90) * (Math.PI / 180)
    const ex = cx + Math.cos(rad) * r
    const ey = cy + Math.sin(rad) * r
    const ox = cx + Math.cos(rad) * (r + notchLen)
    const oy = cy + Math.sin(rad) * (r + notchLen)
    drawLine(ex, ey, ox, oy, notchW)
  }

  return pixels
}

// ─── PNG encoder ──────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const c = Buffer.allocUnsafe(4)
  c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, c])
}

/**
 * Encode a Float32Array of alpha values (0–1, grayscale+alpha) as a PNG buffer.
 * colour_type = 4 (GA — grayscale + alpha), bit_depth = 8.
 */
function encodePNG(pixels, size) {
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 4 // colour type: grayscale + alpha
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Scanlines: filter byte (None = 0) + size*2 bytes (gray, alpha)
  const raw = Buffer.allocUnsafe(size * (1 + size * 2))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 2)] = 0
    for (let x = 0; x < size; x++) {
      const a = Math.round(pixels[y * size + x] * 255)
      const di = y * (1 + size * 2) + 1 + x * 2
      raw[di] = 0 // gray = black
      raw[di + 1] = a
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function makePNG(size) {
  return encodePNG(renderIcon(size), size)
}

// ─── ICNS encoder ─────────────────────────────────────────────────────────────
// macOS ICNS stores PNG data directly (supported since OS X 10.7).
// Format: magic(4) + totalLen(4) + [ostype(4) + entryLen(4) + pngData]*

const ICNS_TYPES = [
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10'],
]

function makeICNS(pngMap) {
  const entries = []
  for (const [sz, ostype] of ICNS_TYPES) {
    const png = pngMap[sz]
    const header = Buffer.allocUnsafe(8)
    Buffer.from(ostype, 'ascii').copy(header, 0)
    header.writeUInt32BE(png.length + 8, 4)
    entries.push(header, png)
  }
  const body = Buffer.concat(entries)
  const header = Buffer.allocUnsafe(8)
  Buffer.from('icns', 'ascii').copy(header, 0)
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

// ─── ICO encoder ──────────────────────────────────────────────────────────────
// ICO stores PNG data directly (supported on Vista+).
// Sizes: 16, 32, 48, 64, 128, 256

const ICO_SIZES = [16, 32, 48, 64, 128, 256]

function makeICO(pngMap) {
  const count = ICO_SIZES.length
  const headerSize = 6 + count * 16
  let offset = headerSize

  const dir = Buffer.allocUnsafe(6 + count * 16)
  dir.writeUInt16LE(0, 0) // reserved
  dir.writeUInt16LE(1, 2) // type: icon
  dir.writeUInt16LE(count, 4)

  const pngBuffers = []
  for (let i = 0; i < ICO_SIZES.length; i++) {
    const sz = ICO_SIZES[i]
    const png = pngMap[sz]
    const base = 6 + i * 16
    dir[base] = sz === 256 ? 0 : sz // 0 means 256
    dir[base + 1] = sz === 256 ? 0 : sz
    dir[base + 2] = 0 // colour count
    dir[base + 3] = 0 // reserved
    dir.writeUInt16LE(1, base + 4) // planes
    dir.writeUInt16LE(32, base + 6) // bit count
    dir.writeUInt32LE(png.length, base + 8)
    dir.writeUInt32LE(offset, base + 12)
    offset += png.length
    pngBuffers.push(png)
  }

  return Buffer.concat([dir, ...pngBuffers])
}

// ─── main ─────────────────────────────────────────────────────────────────────

const resourcesDir = path.join(__dirname, '..', 'resources')
fs.mkdirSync(resourcesDir, { recursive: true })

console.log('Rendering icon at all required sizes…')

// Generate all unique sizes needed
const allSizes = [...new Set([...ICNS_TYPES.map(([s]) => s), ...ICO_SIZES, 22, 44, 512])]
const pngMap = {}
for (const sz of allSizes) {
  process.stdout.write(`  ${sz}×${sz}… `)
  pngMap[sz] = makePNG(sz)
  console.log(`${pngMap[sz].length} bytes`)
}

// Tray icons (template — black + alpha, macOS inverts for dark mode)
fs.writeFileSync(path.join(resourcesDir, 'iconTemplate.png'), pngMap[22])
fs.writeFileSync(path.join(resourcesDir, 'iconTemplate@2x.png'), pngMap[44])

// Dock / Linux icon
fs.writeFileSync(path.join(resourcesDir, 'icon-512.png'), pngMap[512])

// macOS app bundle icon
const icns = makeICNS(pngMap)
fs.writeFileSync(path.join(resourcesDir, 'icon.icns'), icns)

// Windows app icon
const ico = makeICO(pngMap)
fs.writeFileSync(path.join(resourcesDir, 'icon.ico'), ico)

console.log()
console.log('✓ resources/iconTemplate.png       (22×22  tray 1×)')
console.log('✓ resources/iconTemplate@2x.png    (44×44  tray 2×)')
console.log('✓ resources/icon-512.png           (512×512 dock / Linux)')
console.log(`✓ resources/icon.icns              (macOS bundle, ${icns.length} bytes)`)
console.log(`✓ resources/icon.ico               (Windows, ${ico.length} bytes)`)

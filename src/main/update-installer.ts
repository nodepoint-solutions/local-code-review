import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

function findAppBundle(): string {
  // In production: /Applications/Local Code Review.app/Contents/MacOS/Local Code Review
  // Walk up from the executable until we hit the .app boundary.
  let p = app.getPath('exe')
  while (p !== path.dirname(p) && !p.endsWith('.app')) {
    p = path.dirname(p)
  }
  return p
}

function parseMountPoint(hdiutilOutput: string): string | null {
  // hdiutil output lines: /dev/disk4s1 \t Apple_HFS \t /Volumes/Name
  for (const line of hdiutilOutput.split('\n')) {
    const parts = line.split('\t')
    const mountPt = parts[parts.length - 1]?.trim()
    if (mountPt?.startsWith('/Volumes/')) return mountPt
  }
  return null
}

function downloadFile(
  url: string,
  dest: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    file.on('finish', resolve)
    file.on('error', (err) => { file.destroy(); reject(err) })

    function get(urlStr: string, redirects = 0): void {
      if (redirects > 8) { file.destroy(); reject(new Error('Too many redirects')); return }
      const protocol = urlStr.startsWith('https') ? https : http
      const req = protocol.get(urlStr, { headers: { 'User-Agent': 'local-code-review-app' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume()
          get(res.headers.location!, redirects + 1)
          return
        }
        if (res.statusCode !== 200) {
          file.destroy()
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          file.write(chunk)
          if (total > 0) onProgress(received / total)
        })
        res.on('end', () => file.end())
        res.on('error', (err) => { file.destroy(); reject(err) })
      })
      req.on('error', (err) => { file.destroy(); reject(err) })
    }
    get(url)
  })
}

export async function installUpdate(
  dmgUrl: string,
  onProgress: (stage: string, pct: number) => void
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcr-update-'))
  const dmgPath = path.join(tmpDir, 'update.dmg')
  const stagingApp = '/Applications/Local Code Review (update).app'

  // 1. Download
  onProgress('Downloading…', 0)
  await downloadFile(dmgUrl, dmgPath, (pct) => onProgress('Downloading…', Math.round(pct * 60)))

  // 2. Mount DMG
  onProgress('Installing…', 60)
  const { stdout: attachOutput } = await execFileAsync('hdiutil', [
    'attach', '-nobrowse', '-quiet', '-noverify', dmgPath,
  ])
  const mountPoint = parseMountPoint(attachOutput)
  if (!mountPoint) throw new Error('Could not mount update DMG')

  try {
    // 3. Find .app in mounted volume
    const appName = fs.readdirSync(mountPoint).find((f) => f.endsWith('.app'))
    if (!appName) throw new Error('No .app bundle found in DMG')
    const srcApp = path.join(mountPoint, appName)

    // 4. Copy to staging location (separate from the running app)
    onProgress('Installing…', 70)
    if (fs.existsSync(stagingApp)) await execFileAsync('rm', ['-rf', stagingApp])
    await execFileAsync('cp', ['-R', srcApp, stagingApp])

    // 5. Strip quarantine from staging copy
    onProgress('Installing…', 85)
    await execFileAsync('xattr', ['-cr', stagingApp])
  } finally {
    await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet']).catch(() => {})
  }

  // 6. Write relaunch script — runs after this process exits
  onProgress('Restarting…', 95)
  const currentApp = findAppBundle()
  const scriptPath = path.join(tmpDir, 'relaunch.sh')
  const script = [
    '#!/bin/bash',
    'sleep 2',
    // Atomic swap: rename current to .bak, move staging into place
    `mv "${currentApp}" "${currentApp}.bak" 2>/dev/null`,
    `mv "${stagingApp}" "${currentApp}"`,
    // Belt-and-suspenders quarantine strip on the final path
    `xattr -cr "${currentApp}" 2>/dev/null`,
    `open "${currentApp}"`,
    `rm -rf "${currentApp}.bak" 2>/dev/null`,
    `rm -f "$0"`,
  ].join('\n')
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })

  // 7. Detach script from this process and quit
  const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' })
  child.unref()

  onProgress('Restarting…', 100)
  // Brief delay so the progress event reaches the renderer before the window closes
  setTimeout(() => app.quit(), 300)
}

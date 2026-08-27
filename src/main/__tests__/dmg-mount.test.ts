// src/main/__tests__/dmg-mount.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { buildAttachArgs, parseMountPoint } from '../dmg-mount'

const execFileAsync = promisify(execFile)

// Captured from a real `hdiutil attach -nobrowse -noverify` run: the mount
// table is tab-separated and the volume path sits in the final column of the
// last line.
const REAL_ATTACH_OUTPUT = [
  '/dev/disk10         \tGUID_partition_scheme          \t',
  '/dev/disk10s1       \tApple_APFS                     \t',
  '/dev/disk11         \tEF57347C-0000-11AA-AA11-0030654\t',
  '/dev/disk11s1       \t41504653-0000-11AA-AA11-0030654\t/Volumes/TestVol',
].join('\n')

describe('parseMountPoint', () => {
  it('finds the volume path in real hdiutil attach output', () => {
    expect(parseMountPoint(REAL_ATTACH_OUTPUT)).toBe('/Volumes/TestVol')
  })

  it('returns null for empty output', () => {
    expect(parseMountPoint('')).toBeNull()
  })
})

describe('buildAttachArgs', () => {
  it('never passes -quiet, which suppresses the mount table the parser needs', () => {
    const args = buildAttachArgs('/tmp/update.dmg')
    expect(args).not.toContain('-quiet')
    expect(args).toEqual(['attach', '-nobrowse', '-noverify', '/tmp/update.dmg'])
  })
})

// hdiutil exists only on macOS; the pipeline itself is reachable only there
// too (the install button is darwin-gated), so skipping elsewhere loses nothing
describe.runIf(process.platform === 'darwin')('attach → parse pipeline against a real DMG', () => {
  it('mounts with the production args and finds the app bundle', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmg-mount-test-'))
    const srcDir = path.join(tmpDir, 'src')
    // A .app is just a directory — enough for the bundle-discovery step
    fs.mkdirSync(path.join(srcDir, 'Dummy.app'), { recursive: true })
    const dmgPath = path.join(tmpDir, 'update.dmg')
    await execFileAsync('hdiutil', [
      'create',
      '-volname',
      'DmgMountTest',
      '-srcfolder',
      srcDir,
      '-format',
      'UDZO',
      '-quiet',
      dmgPath,
    ])

    const { stdout } = await execFileAsync('hdiutil', buildAttachArgs(dmgPath))
    const mountPoint = parseMountPoint(stdout)
    try {
      expect(mountPoint).toBe('/Volumes/DmgMountTest')
      const appName = fs.readdirSync(mountPoint!).find((f) => f.endsWith('.app'))
      expect(appName).toBe('Dummy.app')
    } finally {
      if (mountPoint) await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet'])
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 30_000)
})

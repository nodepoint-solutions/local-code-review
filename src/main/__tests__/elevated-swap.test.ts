// src/main/__tests__/elevated-swap.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  buildSwapCommand,
  buildElevatedArgs,
  escapeAppleScriptString,
  isPermissionDenied,
  isUserCancelled,
} from '../elevated-swap'

const execFileAsync = promisify(execFile)

describe('escapeAppleScriptString', () => {
  it('escapes double quotes and backslashes', () => {
    expect(escapeAppleScriptString('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye')
  })

  it('leaves plain text untouched', () => {
    expect(escapeAppleScriptString('/Applications/Local Code Review.app')).toBe(
      '/Applications/Local Code Review.app'
    )
  })
})

describe('buildSwapCommand', () => {
  it('quotes both paths so spaces and parentheses survive the shell', () => {
    const cmd = buildSwapCommand(
      '/Applications/Local Code Review.app',
      '/tmp/staging/Local Code Review (update).app'
    )
    expect(cmd).toContain('"/Applications/Local Code Review.app"')
    expect(cmd).toContain('"/tmp/staging/Local Code Review (update).app"')
  })

  it('moves the current app aside before moving the new one in', () => {
    const cmd = buildSwapCommand('/Applications/A.app', '/tmp/B.app')
    const aside = cmd.indexOf('mv "/Applications/A.app" "/Applications/A.app.bak"')
    const moveIn = cmd.indexOf('mv "/tmp/B.app" "/Applications/A.app"')
    expect(aside).toBeGreaterThanOrEqual(0)
    expect(moveIn).toBeGreaterThan(aside)
  })
})

describe('buildElevatedArgs', () => {
  it('wraps the command in a do shell script with prompt and admin privileges', () => {
    const args = buildElevatedArgs('mv "a" "b"', 'Local Code Review wants to install an update.')
    expect(args).toEqual([
      '-e',
      'do shell script "mv \\"a\\" \\"b\\"" with prompt "Local Code Review wants to install an update." with administrator privileges',
    ])
  })
})

describe('isPermissionDenied', () => {
  it('recognises the cp/mv stderr text', () => {
    expect(
      isPermissionDenied(
        new Error(
          'Command failed: cp -R /Volumes/X/A.app /Applications/A.app\ncp: /Applications/A.app: Permission denied'
        )
      )
    ).toBe(true)
  })

  it('recognises node EACCES errors', () => {
    expect(
      isPermissionDenied(new Error("EACCES: permission denied, mkdir '/Applications/A.app'"))
    ).toBe(true)
  })

  it('rejects unrelated failures', () => {
    expect(isPermissionDenied(new Error('No such file or directory'))).toBe(false)
  })
})

describe('isUserCancelled', () => {
  it('recognises the osascript cancel error', () => {
    expect(
      isUserCancelled(
        new Error('Command failed: osascript\nexecution error: User canceled. (-128)')
      )
    ).toBe(true)
  })

  it('rejects unrelated failures', () => {
    expect(isUserCancelled(new Error('Permission denied'))).toBe(false)
  })
})

// The remaining tests execute the built commands for real, so they run only
// where the binaries they need (bash, xattr, osascript) exist.
describe.runIf(process.platform === 'darwin')('swap command against real directories', () => {
  it('swaps the app, strips quarantine, and removes the backup', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elevated-swap-test-'))
    const currentApp = path.join(tmpDir, 'Apps', 'Local Code Review.app')
    const stagingApp = path.join(tmpDir, 'Local Code Review (update).app')
    fs.mkdirSync(currentApp, { recursive: true })
    fs.writeFileSync(path.join(currentApp, 'version'), 'old')
    fs.mkdirSync(stagingApp, { recursive: true })
    const stagedFile = path.join(stagingApp, 'version')
    fs.writeFileSync(stagedFile, 'new')
    await execFileAsync('xattr', ['-w', 'com.apple.quarantine', '0083;;;', stagedFile])
    // A stale backup from an earlier failed run must not divert the mv
    fs.mkdirSync(`${currentApp}.bak`, { recursive: true })

    try {
      await execFileAsync('bash', ['-c', buildSwapCommand(currentApp, stagingApp)])

      expect(fs.readFileSync(path.join(currentApp, 'version'), 'utf8')).toBe('new')
      expect(fs.existsSync(stagingApp)).toBe(false)
      expect(fs.existsSync(`${currentApp}.bak`)).toBe(false)
      const { stdout } = await execFileAsync('xattr', [path.join(currentApp, 'version')])
      expect(stdout).not.toContain('com.apple.quarantine')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe.runIf(process.platform === 'darwin')('escaping through real osascript', () => {
  it('round-trips a command containing quotes', async () => {
    const inner = 'echo "hello (update)"'
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      `do shell script "${escapeAppleScriptString(inner)}"`,
    ])
    expect(stdout.trim()).toBe('hello (update)')
  })
})

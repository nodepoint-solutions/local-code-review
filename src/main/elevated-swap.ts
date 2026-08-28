// src/main/elevated-swap.ts
//
// Pure helpers for swapping the installed app bundle for a freshly staged
// one, with an osascript-based elevated retry when /Applications is not
// writable. Kept free of Electron imports so the command shapes and error
// classification are unit-testable.

/**
 * Escape a string for embedding inside an AppleScript double-quoted
 * literal: backslashes first, then double quotes.
 */
export function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * One shell command that atomically replaces the installed app: clear any
 * stale backup so the mv renames rather than nests, move the current app
 * aside, move the staged app in, strip quarantine, then drop the backup.
 * The && chain stops at the first failure, so a failed move-in leaves the
 * backup behind as a recovery path.
 */
export function buildSwapCommand(currentApp: string, stagingApp: string): string {
  const bak = `${currentApp}.bak`
  return [
    `rm -rf "${bak}"`,
    `mv "${currentApp}" "${bak}"`,
    `mv "${stagingApp}" "${currentApp}"`,
    `xattr -cr "${currentApp}"`,
    `rm -rf "${bak}"`,
  ].join(' && ')
}

/**
 * osascript argv that runs the command as root behind the native macOS
 * authorization dialog. The dialog shows a password field: macOS offers
 * its Touch ID variant only when the requesting binary is Apple-signed.
 */
export function buildElevatedArgs(shellCommand: string, prompt: string): string[] {
  return [
    '-e',
    `do shell script "${escapeAppleScriptString(shellCommand)}" with prompt "${escapeAppleScriptString(prompt)}" with administrator privileges`,
  ]
}

/** True when a failed cp/mv/mkdir was refused for lack of write access. */
export function isPermissionDenied(err: Error): boolean {
  return /permission denied|EACCES|EPERM/i.test(err.message)
}

/** True when the user dismissed the authorization dialog. */
export function isUserCancelled(err: Error): boolean {
  return /User canceled|\(-128\)/i.test(err.message)
}

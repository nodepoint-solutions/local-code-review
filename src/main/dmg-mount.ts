// src/main/dmg-mount.ts
//
// Pure helpers for mounting an update DMG, so the argv shape and the
// mount-table parsing are unit-testable without hdiutil.

/**
 * Attach without -quiet: hdiutil prints the mount table on stdout only in
 * its normal mode, and parseMountPoint needs that table to locate the
 * volume. -noverify skips the checksum pass so the mount is fast.
 */
export function buildAttachArgs(dmgPath: string): string[] {
  return ['attach', '-nobrowse', '-noverify', dmgPath]
}

export function parseMountPoint(hdiutilOutput: string): string | null {
  // hdiutil output lines: /dev/disk4s1 \t Apple_HFS \t /Volumes/Name
  for (const line of hdiutilOutput.split('\n')) {
    const parts = line.split('\t')
    const mountPt = parts[parts.length - 1]?.trim()
    if (mountPt?.startsWith('/Volumes/')) return mountPt
  }
  return null
}

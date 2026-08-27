// src/main/__tests__/dmg-mount.test.ts
import { describe, it, expect } from 'vitest'
import { buildAttachArgs, parseMountPoint } from '../dmg-mount'

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

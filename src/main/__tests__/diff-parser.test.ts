import { describe, it, expect } from 'vitest'
import { parseDiff } from '../git/diff-parser'

const SIMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,4 +1,5 @@
 line one
-line two
+line two modified
+line two point five
 line three
 line four
`

const NEW_FILE_DIFF = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const x = 1
+export const y = 2
`

const DELETED_FILE_DIFF = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const x = 1
-export const y = 2
`

describe('parseDiff', () => {
  it('parses a simple modification', () => {
    const files = parseDiff(SIMPLE_DIFF)
    expect(files).toHaveLength(1)
    expect(files[0].oldPath).toBe('src/foo.ts')
    expect(files[0].newPath).toBe('src/foo.ts')
    expect(files[0].isNew).toBe(false)
    expect(files[0].isDeleted).toBe(false)
  })

  it('produces sequential diffLineNumbers starting at 1', () => {
    const files = parseDiff(SIMPLE_DIFF)
    const lineNums = files[0].lines.map((l) => l.diffLineNumber)
    expect(lineNums[0]).toBe(1)
    expect(lineNums).toEqual([...lineNums.keys()].map((i) => i + 1))
  })

  it('assigns correct types to lines', () => {
    const files = parseDiff(SIMPLE_DIFF)
    const types = files[0].lines.map((l) => l.type)
    expect(types).toContain('context')
    expect(types).toContain('removed')
    expect(types).toContain('added')
  })

  it('tracks old and new line numbers correctly', () => {
    const files = parseDiff(SIMPLE_DIFF)
    const removed = files[0].lines.find((l) => l.type === 'removed')!
    expect(removed.oldLineNumber).toBe(2)
    expect(removed.newLineNumber).toBeNull()
    const added = files[0].lines.find((l) => l.type === 'added')!
    expect(added.oldLineNumber).toBeNull()
    expect(added.newLineNumber).not.toBeNull()
  })

  it('detects new files', () => {
    const files = parseDiff(NEW_FILE_DIFF)
    expect(files[0].isNew).toBe(true)
    expect(files[0].isDeleted).toBe(false)
    const codeLines = files[0].lines.filter((l) => l.type !== 'hunk-header')
    const allAdded = codeLines.every((l) => l.type === 'added')
    expect(allAdded).toBe(true)
  })

  it('detects deleted files', () => {
    const files = parseDiff(DELETED_FILE_DIFF)
    expect(files[0].isDeleted).toBe(true)
    expect(files[0].isNew).toBe(false)
    const codeLines = files[0].lines.filter((l) => l.type !== 'hunk-header')
    const allRemoved = codeLines.every((l) => l.type === 'removed')
    expect(allRemoved).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(parseDiff('')).toEqual([])
  })
})

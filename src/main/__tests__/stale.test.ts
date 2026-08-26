// src/main/__tests__/stale.test.ts
import { describe, it, expect } from 'vitest'
import { collectStaleRanges } from '../git/stale'
import type { ParsedFile } from '../../shared/types'
import type { ReviewComment } from '../../shared/review-store'

function makeFile(newPath: string, diffLineNumbers: number[]): ParsedFile {
  return {
    oldPath: newPath,
    newPath,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
    lines: diffLineNumbers.map((n) => ({
      diffLineNumber: n,
      type: 'context',
      content: `line ${n}`,
      oldLineNumber: n,
      newLineNumber: n,
    })),
  } as ParsedFile
}

function makeComment(overrides: Partial<ReviewComment>): ReviewComment {
  return {
    id: 'RVW-001',
    file: 'a.js',
    start_line: 1,
    end_line: 1,
    side: 'right',
    body: 'note',
    context: [],
    is_stale: false,
    status: 'open',
    resolution: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as ReviewComment
}

describe('collectStaleRanges', () => {
  it('reports a comment whose end line left the diff', () => {
    const diff = [makeFile('a.js', [1, 2, 3])]
    const comments = [makeComment({ start_line: 3, end_line: 5 })]
    const stale = collectStaleRanges(diff, comments)
    expect(stale.get('a.js')).toEqual([{ startLine: 3, endLine: 5 }])
  })

  it('keeps comments whose full range still exists', () => {
    const diff = [makeFile('a.js', [1, 2, 3, 4, 5])]
    const comments = [makeComment({ start_line: 2, end_line: 4 })]
    expect(collectStaleRanges(diff, comments).size).toBe(0)
  })

  it('skips comments already flagged stale', () => {
    const diff = [makeFile('a.js', [1])]
    const comments = [makeComment({ start_line: 9, end_line: 9, is_stale: true })]
    expect(collectStaleRanges(diff, comments).size).toBe(0)
  })

  it('groups ranges per file and ignores other files', () => {
    const diff = [makeFile('a.js', [1, 2]), makeFile('b.js', [1, 2])]
    const comments = [
      makeComment({ file: 'a.js', start_line: 8, end_line: 8 }),
      makeComment({ id: 'RVW-002', file: 'b.js', start_line: 1, end_line: 2 }),
    ]
    const stale = collectStaleRanges(diff, comments)
    expect(stale.get('a.js')).toEqual([{ startLine: 8, endLine: 8 }])
    expect(stale.has('b.js')).toBe(false)
  })
})

// src/main/git/stale.ts
import type { ParsedFile } from '../../shared/types'
import type { ReviewComment } from '../../shared/review-store'

export interface StaleRange {
  startLine: number
  endLine: number
}

/**
 * Finds, per file, the comment ranges whose anchor lines no longer exist in
 * the current diff. Comments already flagged stale are skipped so ranges are
 * only reported once.
 */
export function collectStaleRanges(
  diff: ParsedFile[],
  comments: ReviewComment[]
): Map<string, StaleRange[]> {
  const result = new Map<string, StaleRange[]>()
  for (const file of diff) {
    const validLineNums = new Set(file.lines.map((l) => l.diffLineNumber))
    const ranges = comments
      .filter(
        (c) =>
          c.file === file.newPath &&
          !c.is_stale &&
          (!validLineNums.has(c.start_line) || !validLineNums.has(c.end_line))
      )
      .map((c) => ({ startLine: c.start_line, endLine: c.end_line }))
    if (ranges.length > 0) result.set(file.newPath, ranges)
  }
  return result
}

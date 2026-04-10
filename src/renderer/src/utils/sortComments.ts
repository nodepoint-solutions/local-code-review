import type { ReviewComment } from '../../../shared/types'

/** Sort comments by directory → filename → end_line (visual top-to-bottom order). */
export function sortCommentsByPosition(comments: ReviewComment[]): ReviewComment[] {
  return [...comments].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    return a.end_line - b.end_line
  })
}

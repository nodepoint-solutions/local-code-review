import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

export function buildJson(
  pr: PullRequest,
  review: Review,
  comments: Comment[],
  contextMap: Record<string, ContextLine[]>
): string {
  const nonStale = comments.filter((c) => !c.is_stale)

  const output = {
    review_id: review.id,
    pr: {
      title: pr.title,
      base: pr.base_branch,
      compare: pr.compare_branch,
      base_sha: pr.base_sha,
      compare_sha: pr.compare_sha,
    },
    submitted_at: review.submitted_at,
    comments: nonStale.map((comment, index) => ({
      id: `RVW-${String(index + 1).padStart(3, '0')}`,
      file: comment.file_path,
      start_line: comment.start_line,
      end_line: comment.end_line,
      context: (contextMap[comment.id] ?? []).map((l) => ({
        line: l.line_number,
        type: l.type,
        content: l.content,
      })),
      body: comment.body,
    })),
  }

  return JSON.stringify(output, null, 2)
}

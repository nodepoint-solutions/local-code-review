import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

export function buildMarkdown(
  pr: PullRequest,
  review: Review,
  comments: Comment[],
  contextMap: Record<string, ContextLine[]>
): string {
  const date = review.submitted_at
    ? new Date(review.submitted_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    `# Review: ${pr.title}`,
    `**PR:** \`${pr.compare_branch}\` → \`${pr.base_branch}\``,
    `**Submitted:** ${date}`,
    `**Review ID:** \`${review.id}\``,
    '',
    '---',
    '',
  ]

  const nonStale = comments.filter((c) => !c.is_stale)

  nonStale.forEach((comment, index) => {
    const id = `RVW-${String(index + 1).padStart(3, '0')}`
    const ctx = contextMap[comment.id] ?? []
    const ext = comment.file_path.split('.').pop() ?? ''

    lines.push(`## Issue ${id}`)
    lines.push(`**File:** \`${comment.file_path}\``)
    lines.push(`**Lines:** ${comment.start_line}–${comment.end_line}`)
    lines.push('')
    lines.push('```' + ext)

    for (const ctxLine of ctx) {
      if (ctxLine.line_number === comment.start_line) {
        lines.push('// [selected lines start]')
      }
      lines.push(ctxLine.content)
      if (ctxLine.line_number === comment.end_line) {
        lines.push('// [selected lines end]')
      }
    }

    lines.push('```')
    lines.push('')
    lines.push(`**Comment:**`)
    lines.push(comment.body)
    lines.push('')
    lines.push('---')
    lines.push('')
  })

  return lines.join('\n')
}

export function prTitleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

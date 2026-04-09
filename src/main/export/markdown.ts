// src/main/export/markdown.ts
import type { PRFile, ReviewFile } from '../../shared/review-store'

export function prTitleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export function buildMarkdown(pr: PRFile, review: ReviewFile): string {
  const date = (review.submitted_at ?? review.created_at).slice(0, 10)
  const nonStale = review.comments.filter((c) => !c.is_stale)

  const lines: string[] = [
    `# Review: ${pr.title}`,
    `**PR:** \`${pr.compare_branch}\` → \`${pr.base_branch}\``,
    `**Submitted:** ${date}`,
    `**Review ID:** \`${review.id}\``,
    '',
    '---',
    '',
  ]

  for (const comment of nonStale) {
    lines.push(`## Issue ${comment.id}`)
    lines.push(`**File:** \`${comment.file}\``)
    lines.push(`**Lines:** ${comment.start_line}–${comment.end_line}`)
    lines.push('')

    if (comment.context.length > 0) {
      const ext = comment.file.split('.').pop() ?? ''
      lines.push('```' + ext)
      for (const l of comment.context) {
        const prefix = l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' '
        lines.push(`${prefix} ${l.content}`)
      }
      lines.push('```')
      lines.push('')
    }

    lines.push(`**Comment:**`)
    lines.push(comment.body)

    if (comment.resolution) {
      lines.push('')
      const statusLabel = comment.status === 'resolved' ? 'Resolved' : 'Won\'t Fix'
      lines.push(`**${statusLabel} by ${comment.resolution.resolved_by}:** ${comment.resolution.comment}`)
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

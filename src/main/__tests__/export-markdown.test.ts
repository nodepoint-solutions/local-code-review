import { describe, it, expect } from 'vitest'
import { buildMarkdown } from '../export/markdown'
import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

const pr: PullRequest = {
  id: 'pr1', repo_id: 'r1', title: 'Fix auth bug', description: null,
  base_branch: 'main', compare_branch: 'feat/auth',
  base_sha: 'abc', compare_sha: 'def',
  status: 'open', created_at: '2026-04-08T10:00:00Z', updated_at: '2026-04-08T10:00:00Z',
}

const review: Review = {
  id: 'rev1', pr_id: 'pr1', status: 'submitted',
  submitted_at: '2026-04-08T12:00:00Z', created_at: '2026-04-08T10:00:00Z',
}

const comments: Comment[] = [
  {
    id: 'c1', review_id: 'rev1', file_path: 'src/auth.ts',
    start_line: 5, end_line: 5, side: 'right', body: 'Use httpOnly cookie', is_stale: false,
    created_at: '2026-04-08T11:00:00Z',
  },
]

const contextMap: Record<string, ContextLine[]> = {
  c1: [
    { line_number: 4, type: 'context', content: 'const token = sign(payload)' },
    { line_number: 5, type: 'added', content: 'res.send(token)' },
    { line_number: 6, type: 'context', content: 'res.end()' },
  ],
}

describe('buildMarkdown', () => {
  it('includes PR title and branches', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('Fix auth bug')
    expect(md).toContain('feat/auth')
    expect(md).toContain('main')
  })

  it('assigns sequential RVW- IDs', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('RVW-001')
  })

  it('includes file path and body', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('src/auth.ts')
    expect(md).toContain('Use httpOnly cookie')
  })

  it('includes code context with markers', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('[selected lines start]')
    expect(md).toContain('[selected lines end]')
    expect(md).toContain('res.send(token)')
  })
})

import { describe, it, expect } from 'vitest'
import { buildJson } from '../export/json'
import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

const pr: PullRequest = {
  id: 'pr1', repo_id: 'r1', title: 'Fix auth bug', description: null,
  base_branch: 'main', compare_branch: 'feat/auth',
  base_sha: 'abc123', compare_sha: 'def456',
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
  c1: [{ line_number: 5, type: 'added', content: 'res.send(token)' }],
}

describe('buildJson', () => {
  it('is valid JSON', () => {
    const output = buildJson(pr, review, comments, contextMap)
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it('includes PR metadata', () => {
    const obj = JSON.parse(buildJson(pr, review, comments, contextMap))
    expect(obj.pr.title).toBe('Fix auth bug')
    expect(obj.pr.base_sha).toBe('abc123')
    expect(obj.pr.compare_sha).toBe('def456')
  })

  it('assigns sequential RVW- IDs to comments', () => {
    const obj = JSON.parse(buildJson(pr, review, comments, contextMap))
    expect(obj.comments[0].id).toBe('RVW-001')
  })

  it('includes context with line numbers', () => {
    const obj = JSON.parse(buildJson(pr, review, comments, contextMap))
    expect(obj.comments[0].context[0].content).toBe('res.send(token)')
    expect(obj.comments[0].context[0].type).toBe('added')
  })

  it('excludes stale comments', () => {
    const staleComments: Comment[] = [{ ...comments[0], is_stale: true }]
    const obj = JSON.parse(buildJson(pr, review, staleComments, contextMap))
    expect(obj.comments).toHaveLength(0)
  })
})

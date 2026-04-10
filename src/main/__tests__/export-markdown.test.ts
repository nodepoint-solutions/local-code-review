// src/main/__tests__/export-markdown.test.ts
import { describe, it, expect } from 'vitest'
import { buildMarkdown, prTitleSlug } from '../export/markdown'
import type { PRFile, ReviewFile } from '../../shared/review-store'

const pr: PRFile = {
  version: 1,
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Add user authentication',
  description: null,
  base_branch: 'main',
  compare_branch: 'feature/auth',
  status: 'open',
  assignee: null,
  assigned_at: null,
  merged_at: null,
  created_at: '2026-04-08T10:00:00Z',
  updated_at: '2026-04-08T10:00:00Z',
}

const review: ReviewFile = {
  version: 1,
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  status: 'submitted',
  base_sha: 'abc',
  compare_sha: 'def',
  created_at: '2026-04-08T10:00:00Z',
  submitted_at: '2026-04-08T11:00:00Z',
  comments: [
    {
      id: 'RVW-001',
      file: 'src/auth.ts',
      start_line: 10,
      end_line: 12,
      side: 'right',
      body: 'Use httpOnly cookie',
      context: [{ line: 10, type: 'added', content: 'res.send(token)' }],
      is_stale: false,
      status: 'open',
      resolution: null,
      created_at: '2026-04-08T10:01:00Z',
    },
  ],
}

describe('buildMarkdown', () => {
  it('includes PR title and branches', () => {
    const md = buildMarkdown(pr, review)
    expect(md).toContain('Add user authentication')
    expect(md).toContain('feature/auth')
    expect(md).toContain('main')
  })

  it('includes issue ID and file', () => {
    const md = buildMarkdown(pr, review)
    expect(md).toContain('RVW-001')
    expect(md).toContain('src/auth.ts')
  })

  it('includes comment body', () => {
    const md = buildMarkdown(pr, review)
    expect(md).toContain('Use httpOnly cookie')
  })

  it('excludes stale comments', () => {
    const staleReview: ReviewFile = {
      ...review,
      comments: [{ ...review.comments[0], is_stale: true }],
    }
    const md = buildMarkdown(pr, staleReview)
    expect(md).not.toContain('RVW-001')
  })

  it('includes resolution when present', () => {
    const resolvedReview: ReviewFile = {
      ...review,
      comments: [
        {
          ...review.comments[0],
          status: 'resolved',
          resolution: {
            comment: 'Fixed with httpOnly',
            resolved_by: 'claude',
            resolved_at: '2026-04-08T12:00:00Z',
          },
        },
      ],
    }
    const md = buildMarkdown(pr, resolvedReview)
    expect(md).toContain('Fixed with httpOnly')
    expect(md).toContain('claude')
  })
})

describe('prTitleSlug', () => {
  it('converts title to kebab-case slug', () => {
    expect(prTitleSlug('Add user authentication')).toBe('add-user-authentication')
  })

  it('strips special characters', () => {
    expect(prTitleSlug('Fix: bug #123!')).toBe('fix-bug-123')
  })

  it('truncates to 50 characters', () => {
    expect(prTitleSlug('a'.repeat(60))).toHaveLength(50)
  })
})

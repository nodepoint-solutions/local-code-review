import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReviewPanel from '../components/ReviewPanel'
import type { ReviewComment, ReviewFile, PRFile } from '../../../shared/types'

const pr: PRFile = {
  version: 1,
  id: 'pr1',
  title: 'Test PR',
  description: null,
  base_branch: 'main',
  compare_branch: 'feature/x',
  status: 'open',
  assignee: null,
  assigned_at: null,
  merged_at: null,
  created_at: '2026-04-08T09:00:00Z',
  updated_at: '2026-04-08T09:00:00Z',
}

const review: ReviewFile = {
  version: 1,
  id: 'rev1',
  status: 'in_progress',
  base_sha: 'abc123',
  compare_sha: 'def456',
  submitted_at: null,
  created_at: '2026-04-08T10:00:00Z',
  comments: [],
}

const comments: ReviewComment[] = [
  { id: 'c1', file: 'src/foo.ts', start_line: 3, end_line: 3, side: 'right', body: 'Fix null check', is_stale: false, status: 'open', resolution: null, context: [], created_at: '2026-04-08T11:00:00Z' },
  { id: 'c2', file: 'src/bar.ts', start_line: 10, end_line: 12, side: 'right', body: 'Rename this', is_stale: false, status: 'open', resolution: null, context: [], created_at: '2026-04-08T11:05:00Z' },
]

describe('ReviewPanel', () => {
  it('lists non-stale comments', () => {
    render(<ReviewPanel pr={pr} review={review} reviews={[review]} comments={comments} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.getByText('Fix null check')).toBeInTheDocument()
    expect(screen.getByText('Rename this')).toBeInTheDocument()
  })

  it('shows submit button when review is in_progress', () => {
    render(<ReviewPanel pr={pr} review={review} reviews={[review]} comments={comments} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument()
  })

  it('does not show submit button when review is null', () => {
    render(<ReviewPanel pr={pr} review={null} reviews={[]} comments={[]} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /submit review/i })).not.toBeInTheDocument()
  })
})

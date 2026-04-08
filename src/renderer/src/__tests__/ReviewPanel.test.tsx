import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReviewPanel from '../components/ReviewPanel'
import type { Comment, Review } from '../../../../shared/types'

const review: Review = {
  id: 'rev1', pr_id: 'pr1', status: 'in_progress', submitted_at: null, created_at: '2026-04-08T10:00:00Z',
}

const comments: Comment[] = [
  { id: 'c1', review_id: 'rev1', file_path: 'src/foo.ts', start_line: 3, end_line: 3, side: 'right', body: 'Fix null check', is_stale: false, created_at: '2026-04-08T11:00:00Z' },
  { id: 'c2', review_id: 'rev1', file_path: 'src/bar.ts', start_line: 10, end_line: 12, side: 'right', body: 'Rename this', is_stale: false, created_at: '2026-04-08T11:05:00Z' },
]

describe('ReviewPanel', () => {
  it('lists non-stale comments', () => {
    render(<ReviewPanel review={review} comments={comments} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.getByText('Fix null check')).toBeInTheDocument()
    expect(screen.getByText('Rename this')).toBeInTheDocument()
  })

  it('shows submit button when review is in_progress', () => {
    render(<ReviewPanel review={review} comments={comments} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument()
  })

  it('does not show submit button when review is null', () => {
    render(<ReviewPanel review={null} comments={[]} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /submit review/i })).not.toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReviewTimeline from '../components/ReviewTimeline'
import type { PRFile, ReviewFile, ReviewComment } from '../../../shared/types'

const pr: PRFile = {
  version: 1,
  id: 'pr-uuid',
  title: 'My PR',
  description: null,
  base_branch: 'main',
  compare_branch: 'feature/x',
  status: 'open',
  assignee: null,
  assigned_at: null,
  created_at: '2026-04-08T09:00:00Z',
  updated_at: '2026-04-08T09:00:00Z',
}

const submittedReview: ReviewFile = {
  version: 1,
  id: 'rev-uuid',
  status: 'submitted',
  base_sha: 'abc',
  compare_sha: 'def',
  created_at: '2026-04-08T10:00:00Z',
  submitted_at: '2026-04-08T11:00:00Z',
  comments: [],
}

const inProgressReview: ReviewFile = {
  ...submittedReview,
  status: 'in_progress',
  submitted_at: null,
}

const comments: ReviewComment[] = [
  {
    id: 'RVW-001', file: 'src/foo.ts',
    start_line: 3, end_line: 3, side: 'right',
    body: 'Add null check here', is_stale: false,
    context: [], status: 'resolved',
    resolution: {
      comment: 'Fixed with optional chaining.',
      resolved_by: 'Claude Code',
      resolved_at: '2026-04-08T12:00:00Z',
    },
    created_at: '2026-04-08T11:00:00Z',
  },
  {
    id: 'RVW-002', file: 'src/bar.ts',
    start_line: 10, end_line: 12, side: 'right',
    body: 'Rename this variable', is_stale: false,
    context: [], status: 'open',
    resolution: null,
    created_at: '2026-04-08T11:05:00Z',
  },
]

describe('ReviewTimeline', () => {
  it('always shows the PR opened entry', () => {
    render(<ReviewTimeline pr={pr} review={null} comments={[]} />)
    expect(screen.getByText(/opened this pr/i)).toBeInTheDocument()
  })

  it('does not show review entry when review is null', () => {
    render(<ReviewTimeline pr={pr} review={null} comments={[]} />)
    expect(screen.queryByText(/review submitted/i)).not.toBeInTheDocument()
  })

  it('does not show review entry when review is in_progress', () => {
    render(<ReviewTimeline pr={pr} review={inProgressReview} comments={[]} />)
    expect(screen.queryByText(/review submitted/i)).not.toBeInTheDocument()
  })

  it('shows review submitted entry with comment count when submitted', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={comments} />)
    expect(screen.getByText(/review submitted with 2 comments/i)).toBeInTheDocument()
  })

  it('shows singular "comment" for one comment', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={[comments[0]]} />)
    expect(screen.getByText(/review submitted with 1 comment/i)).toBeInTheDocument()
  })

  it('renders comment bodies under the review entry', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={comments} />)
    expect(screen.getByText('Add null check here')).toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('does not render stale comments in the timeline', () => {
    const staleComment = { ...comments[0], is_stale: true }
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={[staleComment, comments[1]]} />)
    expect(screen.queryByText('Add null check here')).not.toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('renders resolution reply for resolved comments', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={comments} />)
    expect(screen.getByText('Fixed with optional chaining.')).toBeInTheDocument()
  })
})

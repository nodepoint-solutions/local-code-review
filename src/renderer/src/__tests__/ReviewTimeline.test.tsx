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

const resolvedComment: ReviewComment = {
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
}

const openComment: ReviewComment = {
  id: 'RVW-002', file: 'src/bar.ts',
  start_line: 10, end_line: 12, side: 'right',
  body: 'Rename this variable', is_stale: false,
  context: [], status: 'open', resolution: null,
  created_at: '2026-04-08T11:05:00Z',
}

const staleComment: ReviewComment = {
  ...resolvedComment,
  id: 'RVW-003',
  is_stale: true,
  body: 'This is stale',
}

const submittedReview: ReviewFile = {
  version: 1, id: 'rev-1',
  status: 'submitted',
  base_sha: 'abc', compare_sha: 'def',
  created_at: '2026-04-08T10:00:00Z',
  submitted_at: '2026-04-08T11:00:00Z',
  comments: [resolvedComment, openComment],
}

const inProgressReview: ReviewFile = {
  ...submittedReview, id: 'rev-2',
  status: 'in_progress',
  submitted_at: null,
  comments: [],
}

const completeReview: ReviewFile = {
  ...submittedReview, id: 'rev-3',
  status: 'complete',
  submitted_at: '2026-04-08T13:00:00Z',
  comments: [resolvedComment],
}

describe('ReviewTimeline', () => {
  it('always shows the PR opened entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[]} reviewCommitCounts={{}} />)
    expect(screen.getByText(/opened this pr/i)).toBeInTheDocument()
  })

  it('shows nothing extra when reviews is empty', () => {
    render(<ReviewTimeline pr={pr} reviews={[]} reviewCommitCounts={{}} />)
    expect(screen.queryByText(/review/i)).not.toBeInTheDocument()
  })

  it('shows "Review in progress" for an in_progress review', () => {
    render(<ReviewTimeline pr={pr} reviews={[inProgressReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText(/review in progress/i)).toBeInTheDocument()
  })

  it('does not show comments under an in_progress entry', () => {
    const withComments = { ...inProgressReview, comments: [openComment] }
    render(<ReviewTimeline pr={pr} reviews={[withComments]} reviewCommitCounts={{}} />)
    expect(screen.queryByText('Rename this variable')).not.toBeInTheDocument()
  })

  it('shows "Review submitted" for a submitted review', () => {
    render(<ReviewTimeline pr={pr} reviews={[submittedReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText(/review submitted/i)).toBeInTheDocument()
  })

  it('shows non-stale comments under submitted entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[submittedReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText('Add null check here')).toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('does not show stale comments under submitted entry', () => {
    const withStale = { ...submittedReview, comments: [staleComment, openComment] }
    render(<ReviewTimeline pr={pr} reviews={[withStale]} reviewCommitCounts={{}} />)
    expect(screen.queryByText('This is stale')).not.toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('shows resolution replies under submitted entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[submittedReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText('Fixed with optional chaining.')).toBeInTheDocument()
  })

  it('shows both "Review submitted" and "Review feedback implemented" for a complete review', () => {
    render(<ReviewTimeline pr={pr} reviews={[completeReview]} reviewCommitCounts={{ 'rev-3': 3 }} />)
    expect(screen.getByText(/review submitted/i)).toBeInTheDocument()
    expect(screen.getByText(/review feedback implemented/i)).toBeInTheDocument()
  })

  it('shows commit count in "Review feedback implemented" entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[completeReview]} reviewCommitCounts={{ 'rev-3': 3 }} />)
    expect(screen.getByText(/3 commits created/i)).toBeInTheDocument()
  })

  it('shows "1 commit created" (singular) correctly', () => {
    render(<ReviewTimeline pr={pr} reviews={[completeReview]} reviewCommitCounts={{ 'rev-3': 1 }} />)
    expect(screen.getByText(/1 commit created/i)).toBeInTheDocument()
  })

  it('renders multiple review rounds in order', () => {
    const secondReview: ReviewFile = {
      ...submittedReview,
      id: 'rev-2',
      created_at: '2026-04-09T10:00:00Z',
      submitted_at: '2026-04-09T11:00:00Z',
      comments: [openComment],
    }
    render(<ReviewTimeline pr={pr} reviews={[completeReview, secondReview]} reviewCommitCounts={{ 'rev-3': 2 }} />)
    // First complete review shows both entries
    expect(screen.getByText(/review feedback implemented/i)).toBeInTheDocument()
    // Second submitted review also shows
    expect(screen.getAllByText(/review submitted/i)).toHaveLength(2)
  })
})

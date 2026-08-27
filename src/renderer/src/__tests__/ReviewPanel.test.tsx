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
  {
    id: 'c1',
    file: 'src/foo.ts',
    start_line: 3,
    end_line: 3,
    side: 'right',
    body: 'Fix null check',
    is_stale: false,
    status: 'open',
    resolution: null,
    context: [],
    created_at: '2026-04-08T11:00:00Z',
  },
  {
    id: 'c2',
    file: 'src/bar.ts',
    start_line: 10,
    end_line: 12,
    side: 'right',
    body: 'Rename this',
    is_stale: false,
    status: 'open',
    resolution: null,
    context: [],
    created_at: '2026-04-08T11:05:00Z',
  },
]

describe('ReviewPanel', () => {
  it('lists non-stale comments', () => {
    render(
      <ReviewPanel
        pr={pr}
        review={review}
        reviews={[review]}
        comments={comments}
        prId="pr1"
        repoPath="/repo"
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />
    )
    expect(screen.getByText('Fix null check')).toBeInTheDocument()
    expect(screen.getByText('Rename this')).toBeInTheDocument()
  })

  it('shows submit button when review is in_progress', () => {
    render(
      <ReviewPanel
        pr={pr}
        review={review}
        reviews={[review]}
        comments={comments}
        prId="pr1"
        repoPath="/repo"
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument()
  })

  it('does not show submit button when review is null', () => {
    render(
      <ReviewPanel
        pr={pr}
        review={null}
        reviews={[]}
        comments={[]}
        prId="pr1"
        repoPath="/repo"
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /submit review/i })).not.toBeInTheDocument()
  })
})

import userEvent from '@testing-library/user-event'
import { waitFor } from '@testing-library/react'
import { installMockApi } from './helpers/mock-api'

const submittedReview: ReviewFile = {
  ...review,
  id: 'rev2',
  status: 'submitted',
  submitted_at: '2026-04-08T12:00:00Z',
}

const completeReview: ReviewFile = {
  ...review,
  id: 'rev3',
  status: 'complete',
  submitted_at: '2026-04-08T12:00:00Z',
}

function renderPanel(overrides: Partial<Parameters<typeof ReviewPanel>[0]> = {}) {
  const onSubmitted = vi.fn()
  const result = render(
    <ReviewPanel
      pr={pr}
      review={null}
      reviews={[]}
      comments={[]}
      prId="pr1"
      repoPath="/repo"
      onClose={vi.fn()}
      onSubmitted={onSubmitted}
      {...overrides}
    />
  )
  return { ...result, onSubmitted }
}

describe('ReviewPanel empty states', () => {
  it('explains how to start a review before one exists', () => {
    renderPanel()
    expect(screen.getByText(/first comment starts the review/i)).toBeInTheDocument()
  })

  it('explains that a new comment starts the next round after fix-complete', () => {
    renderPanel({ reviews: [completeReview] })
    expect(screen.getByText(/starts the next review round/i)).toBeInTheDocument()
  })
})

describe('ReviewPanel return to editing', () => {
  it('offers it for a submitted review with no assignee and reopens via the api', async () => {
    const api = installMockApi({
      reopenReview: vi.fn().mockResolvedValue(submittedReview),
      getPr: vi.fn().mockResolvedValue(null),
    })
    const { onSubmitted } = renderPanel({
      review: submittedReview,
      reviews: [submittedReview],
      comments,
    })
    await userEvent.click(screen.getByRole('button', { name: /return to editing/i }))
    expect(api.reopenReview).toHaveBeenCalledWith('/repo', 'pr1', 'rev2')
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
  })

  it('does not offer it while an agent is assigned', () => {
    renderPanel({
      pr: { ...pr, assignee: 'claude', assigned_at: '2026-04-08T12:30:00Z' },
      review: submittedReview,
      reviews: [submittedReview],
      comments,
    })
    expect(screen.queryByRole('button', { name: /return to editing/i })).not.toBeInTheDocument()
  })

  it('surfaces a reopen failure instead of swallowing it', async () => {
    installMockApi({
      reopenReview: vi
        .fn()
        .mockResolvedValue({ error: 'Only a submitted review can be returned to editing.' }),
    })
    renderPanel({ review: submittedReview, reviews: [submittedReview], comments })
    await userEvent.click(screen.getByRole('button', { name: /return to editing/i }))
    expect(
      await screen.findByText(/only a submitted review can be returned to editing/i)
    ).toBeInTheDocument()
  })
})

describe('ReviewPanel markdown export', () => {
  it('offers export for a review with comments and calls the api', async () => {
    const api = installMockApi()
    renderPanel({ review: submittedReview, reviews: [submittedReview], comments })
    await userEvent.click(screen.getByRole('button', { name: /export as markdown/i }))
    expect(api.downloadMarkdown).toHaveBeenCalledWith('/repo', 'pr1', 'rev2')
  })

  it('offers no export without comments', () => {
    renderPanel({ review: submittedReview, reviews: [submittedReview], comments: [] })
    expect(screen.queryByRole('button', { name: /export as markdown/i })).not.toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommentThread from '../components/CommentThread'
import type { ReviewComment } from '../../../shared/types'

const base: ReviewComment = {
  id: 'RVW-001', file: 'src/foo.ts',
  start_line: 3, end_line: 3, side: 'right',
  body: 'This needs a null check', is_stale: false,
  context: [],
  status: 'open',
  resolution: null,
  created_at: '2026-04-08T10:00:00Z',
}

describe('CommentThread', () => {
  it('renders the comment body', () => {
    render(<CommentThread comment={base} />)
    expect(screen.getByText('This needs a null check')).toBeInTheDocument()
  })

  it('shows stale indicator for stale comments', () => {
    render(<CommentThread comment={{ ...base, is_stale: true }} />)
    expect(screen.getByText(/outdated/i)).toBeInTheDocument()
  })

  it('shows no badge for open comments', () => {
    render(<CommentThread comment={base} />)
    expect(screen.queryByText(/resolved/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/won't fix/i)).not.toBeInTheDocument()
  })

  it('shows Resolved badge for resolved comments', () => {
    render(<CommentThread comment={{ ...base, status: 'resolved' }} />)
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it("shows Won't fix badge for wont_fix comments", () => {
    render(<CommentThread comment={{ ...base, status: 'wont_fix' }} />)
    expect(screen.getByText("Won't fix")).toBeInTheDocument()
  })

  it('shows no resolution panel when resolution is null', () => {
    render(<CommentThread comment={{ ...base, status: 'resolved', resolution: null }} />)
    expect(screen.queryByText(/claude code/i)).not.toBeInTheDocument()
  })

  it('shows resolution panel with agent comment when resolution is present', () => {
    render(<CommentThread comment={{
      ...base,
      status: 'resolved',
      resolution: {
        comment: 'Added null guard on line 3.',
        resolved_by: 'Claude Code',
        resolved_at: '2026-04-08T12:00:00Z',
      }
    }} />)
    expect(screen.getByText('Added null guard on line 3.')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })
})

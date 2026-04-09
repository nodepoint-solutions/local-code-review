import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommentThread from '../components/CommentThread'
import type { Comment } from '../../../../shared/types'

const comment: Comment = {
  id: 'c1', review_id: 'r1', file_path: 'src/foo.ts',
  start_line: 3, end_line: 3, side: 'right',
  body: 'This needs a null check', is_stale: false,
  created_at: '2026-04-08T10:00:00Z',
}

describe('CommentThread', () => {
  it('renders the comment body', () => {
    render(<CommentThread comment={comment} />)
    expect(screen.getByText('This needs a null check')).toBeInTheDocument()
  })

  it('shows stale indicator for stale comments', () => {
    render(<CommentThread comment={{ ...comment, is_stale: true }} />)
    expect(screen.getByText(/outdated/i)).toBeInTheDocument()
  })
})

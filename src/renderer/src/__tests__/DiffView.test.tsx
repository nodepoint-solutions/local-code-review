import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiffView from '../components/DiffView'
import type { ParsedFile, ReviewComment } from '../../../shared/types'

const file: ParsedFile = {
  oldPath: 'src/foo.ts',
  newPath: 'src/foo.ts',
  isNew: false,
  isDeleted: false,
  isRenamed: false,
  lines: [
    {
      diffLineNumber: 1,
      type: 'context',
      content: 'const a = 1',
      oldLineNumber: 1,
      newLineNumber: 1,
    },
    {
      diffLineNumber: 2,
      type: 'added',
      content: 'const b = 2',
      oldLineNumber: null,
      newLineNumber: 2,
    },
    {
      diffLineNumber: 3,
      type: 'context',
      content: 'export {}',
      oldLineNumber: 2,
      newLineNumber: 3,
    },
  ],
}

const openComment: ReviewComment = {
  id: 'RVW-001',
  file: 'src/foo.ts',
  start_line: 2,
  end_line: 2,
  side: 'right',
  body: 'Name this better',
  is_stale: false,
  context: [],
  status: 'open',
  resolution: null,
  created_at: '2026-04-08T10:00:00Z',
}

function row(container: HTMLElement, diffLineNumber: number): Element {
  const el = container.querySelector(`tr[data-diff-line-number="${diffLineNumber}"]`)
  if (!el) throw new Error(`no row for diff line ${diffLineNumber}`)
  return el
}

function openCommentBox(container: HTMLElement, diffLineNumber: number): void {
  fireEvent.mouseDown(row(container, diffLineNumber))
  fireEvent.mouseUp(row(container, diffLineNumber))
}

describe('DiffView commenting', () => {
  it('opens the comment box on a line click and closes it after a successful save', async () => {
    const onAddComment = vi.fn().mockResolvedValue(true)
    const { container } = render(
      <DiffView file={file} comments={[]} view="unified" onAddComment={onAddComment} />
    )

    openCommentBox(container, 2)
    const textarea = await screen.findByPlaceholderText(/leave a comment/i)
    await userEvent.type(textarea, 'Tighten this up')
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }))

    expect(onAddComment).toHaveBeenCalledWith(
      expect.objectContaining({
        file: 'src/foo.ts',
        startLine: 2,
        endLine: 2,
        body: 'Tighten this up',
      })
    )
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/leave a comment/i)).not.toBeInTheDocument()
    )
  })

  it('keeps the box and the draft when the save fails', async () => {
    const onAddComment = vi.fn().mockResolvedValue(false)
    const { container } = render(
      <DiffView file={file} comments={[]} view="unified" onAddComment={onAddComment} />
    )

    openCommentBox(container, 2)
    const textarea = await screen.findByPlaceholderText(/leave a comment/i)
    await userEvent.type(textarea, 'Do not lose me')
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }))

    expect(onAddComment).toHaveBeenCalledTimes(1)
    expect(screen.getByPlaceholderText(/leave a comment/i)).toHaveValue('Do not lose me')
  })

  it('opens no comment box when read-only', () => {
    const { container } = render(
      <DiffView file={file} comments={[]} view="unified" onAddComment={vi.fn()} readOnly />
    )
    openCommentBox(container, 2)
    expect(screen.queryByPlaceholderText(/leave a comment/i)).not.toBeInTheDocument()
  })

  it('cancels an armed selection on Escape so the next comment cannot widen', async () => {
    const onAddComment = vi.fn().mockResolvedValue(true)
    const { container } = render(
      <DiffView file={file} comments={[]} view="unified" onAddComment={onAddComment} />
    )

    // Arm a selection at line 1 and abandon it with Escape
    fireEvent.mouseDown(row(container, 1))
    fireEvent.keyDown(window, { key: 'Escape' })

    // A later click on line 3 must produce a single-line comment, not 1–3
    openCommentBox(container, 3)
    await userEvent.type(await screen.findByPlaceholderText(/leave a comment/i), 'x')
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }))

    expect(onAddComment).toHaveBeenCalledWith(expect.objectContaining({ startLine: 3, endLine: 3 }))
  })

  it('passes reviewer resolution through to comment threads', async () => {
    const onResolveComment = vi.fn()
    render(
      <DiffView
        file={file}
        comments={[openComment]}
        view="unified"
        onAddComment={vi.fn()}
        readOnly
        onResolveComment={onResolveComment}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(onResolveComment).toHaveBeenCalledWith('RVW-001', 'resolved')
  })
})

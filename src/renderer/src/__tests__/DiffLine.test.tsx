import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DiffLine from '../components/DiffView/DiffLine'
import type { ParsedLine } from '../../../shared/types'

const addedLine: ParsedLine = {
  diffLineNumber: 3,
  type: 'added',
  content: 'const x = 1',
  oldLineNumber: null,
  newLineNumber: 5,
}

describe('DiffLine', () => {
  it('renders the line content', () => {
    render(<DiffLine line={addedLine} comments={[]} onStartComment={vi.fn()} onExtendComment={vi.fn()} isSelecting={false} selectionStart={null} />)
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })

  it('shows gutter button on mouse enter', () => {
    render(<DiffLine line={addedLine} comments={[]} onStartComment={vi.fn()} onExtendComment={vi.fn()} isSelecting={false} selectionStart={null} />)
    const row = screen.getByRole('row')
    fireEvent.mouseEnter(row)
    expect(screen.getByTitle('Add comment')).toBeInTheDocument()
  })
})

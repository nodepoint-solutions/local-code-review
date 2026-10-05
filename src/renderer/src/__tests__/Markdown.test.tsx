import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import Markdown from '../components/Markdown'

describe('Markdown', () => {
  it('renders a GitHub table', () => {
    render(<Markdown>{'| File | Change |\n| --- | --- |\n| runner.ts | Added retry |'}</Markdown>)

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'File' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Change' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'Added retry' })).toBeInTheDocument()
  })

  it('hides a comment that sits on its own lines', () => {
    render(
      <Markdown>
        {'# Summary\n\n<!--\nDelete this template\nbefore you submit\n-->\n\nDone.'}
      </Markdown>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByText('Done.')).toBeInTheDocument()
    expect(screen.queryByText(/Delete this template/)).not.toBeInTheDocument()
  })

  it('hides a comment inside a paragraph', () => {
    render(<Markdown>{'Before <!-- reviewer note --> after'}</Markdown>)

    expect(screen.getByText(/Before\s+after/)).toBeInTheDocument()
    expect(screen.queryByText(/reviewer note/)).not.toBeInTheDocument()
  })

  it('renders a task list as checkboxes', () => {
    render(<Markdown>{'- [x] Tests pass\n- [ ] Docs updated'}</Markdown>)

    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toBeChecked()
    expect(boxes[1]).not.toBeChecked()
  })

  it('renders collapsible sections written as HTML', () => {
    render(<Markdown>{'<details><summary>Logs</summary>\n\nstack trace\n\n</details>'}</Markdown>)

    expect(screen.getByRole('group')).toBeInTheDocument()
    expect(screen.getByText('Logs')).toBeInTheDocument()
  })

  it('removes script elements', () => {
    const { container } = render(
      <Markdown>{'Hello\n\n<script>window.pwned = true</script>'}</Markdown>
    )

    expect(container.querySelector('script')).toBeNull()
    expect(screen.queryByText(/pwned/)).not.toBeInTheDocument()
  })
})

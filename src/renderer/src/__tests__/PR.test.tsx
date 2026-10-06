import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PR from '../screens/PR'
import { useStore } from '../store'
import { EditorView } from '@codemirror/view'
import { installMockApi } from './helpers/mock-api'
import type { Commit, ParsedFile, PrDetail, Repository } from '../../../shared/types'

const repo: Repository = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: '2026-04-08T10:00:00Z',
}

const detail: PrDetail = {
  pr: {
    version: 1,
    id: 'pr1',
    title: 'Add auth middleware',
    description: null,
    base_branch: 'main',
    compare_branch: 'feature/auth',
    status: 'open',
    assignee: null,
    assigned_at: null,
    merged_at: null,
    created_at: '2026-04-08T09:00:00Z',
    updated_at: '2026-04-08T09:00:00Z',
  },
  diff: [],
  review: null,
  reviews: [],
  reviewCommitCounts: {},
  isStale: false,
}

function makeCommit(subject: string): Commit {
  return {
    hash: subject.padEnd(40, '0'),
    shortHash: subject.slice(0, 7),
    subject,
    authorName: 'Test',
    authorEmail: 't@example.com',
    timestamp: 1_775_000_000,
  }
}

function renderPr() {
  return render(
    <MemoryRouter initialEntries={['/repo/r1/pr/pr1']}>
      <Routes>
        <Route path="/repo/:repoId/pr/:prId" element={<PR />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PR commits tab', () => {
  beforeEach(() => {
    useStore.setState({ repos: [repo], selectedRepo: repo })
  })

  it('reloads the commits when an agent changes the PR', async () => {
    let notify: (data: { repoPath: string; prId: string }) => void = () => {}
    installMockApi({
      getPr: vi.fn().mockResolvedValue(detail),
      listCommits: vi
        .fn()
        .mockResolvedValueOnce([makeCommit('feat: against main')])
        .mockResolvedValue([makeCommit('feat: against develop')]),
      onPrUpdated: vi.fn((callback) => {
        notify = callback
        return () => {}
      }),
    })
    renderPr()
    await userEvent.click(await screen.findByRole('button', { name: /Commits/ }))
    expect(await screen.findByText('feat: against main')).toBeInTheDocument()

    await act(async () => notify({ repoPath: repo.path, prId: 'pr1' }))

    expect(await screen.findByText('feat: against develop')).toBeInTheDocument()
  })
})

describe('PR description', () => {
  const description = [
    '## Goals',
    '',
    '<!-- Delete this hint before you submit -->',
    '',
    '| Area | Change |',
    '| --- | --- |',
    '| Auth | Added middleware |',
  ].join('\n')
  const withDescription: PrDetail = { ...detail, pr: { ...detail.pr, description } }

  beforeEach(() => {
    useStore.setState({ repos: [repo], selectedRepo: repo })
  })

  it('renders tables and hides comments', async () => {
    installMockApi({ getPr: vi.fn().mockResolvedValue(withDescription) })
    renderPr()

    expect(await screen.findByRole('heading', { level: 2, name: 'Goals' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Area' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'Added middleware' })).toBeInTheDocument()
    expect(screen.queryByText(/Delete this hint/)).not.toBeInTheDocument()
  })

  it('shows the markdown source, with its syntax, while editing', async () => {
    installMockApi({ getPr: vi.fn().mockResolvedValue(withDescription) })
    renderPr()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const editor = screen.getByRole('textbox', { name: 'Description' })
    expect(editor).toHaveTextContent('## Goals')
    expect(editor).toHaveTextContent('<!-- Delete this hint before you submit -->')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders the edited description after save', async () => {
    const updatePr = vi.fn(async (_repoPath: string, _prId: string, patch: object) => ({
      ...withDescription.pr,
      ...patch,
    }))
    installMockApi({ getPr: vi.fn().mockResolvedValue(withDescription), updatePr })
    renderPr()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Description' }))
    act(() => {
      view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '### Risks' } })
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updatePr).toHaveBeenCalledWith(repo.path, 'pr1', { description: '### Risks' })
    expect(await screen.findByRole('heading', { level: 3, name: 'Risks' })).toBeInTheDocument()
  })
})

describe('PR files changed filter', () => {
  function makeFile(newPath: string): ParsedFile {
    return {
      oldPath: newPath,
      newPath,
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      lines: [
        {
          diffLineNumber: 1,
          type: 'added',
          content: 'greeting',
          oldLineNumber: null,
          newLineNumber: 1,
        },
      ],
    }
  }

  const withFiles: PrDetail = {
    ...detail,
    diff: ['a/hello.txt', 'a/hi.txt', 'a/bye.txt', 'b/goodbye.txt'].map(makeFile),
  }

  function treeFiles(): string[] {
    const tree = screen.getByRole('navigation', { name: 'Changed files' })
    return within(tree)
      .getAllByRole('button')
      .map((button) => button.getAttribute('title'))
      .filter((title): title is string => title !== null)
  }

  function diffFiles(): string[] {
    return screen
      .queryAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter((label): label is string => label !== null)
  }

  async function openFilesTab(): Promise<HTMLElement> {
    installMockApi({ getPr: vi.fn().mockResolvedValue(withFiles) })
    renderPr()
    await userEvent.click(await screen.findByRole('button', { name: /Files changed/ }))
    return screen.getByRole('searchbox', { name: 'Filter changed files' })
  }

  beforeEach(() => {
    useStore.setState({ repos: [repo], selectedRepo: repo })
  })

  it('shows every file before the user types', async () => {
    await openFilesTab()

    expect(treeFiles()).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt', 'b/goodbye.txt'])
    expect(diffFiles()).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt', 'b/goodbye.txt'])
  })

  it('narrows the tree and the diffs on each keystroke', async () => {
    const filter = await openFilesTab()

    await userEvent.type(filter, 'a/')
    expect(treeFiles()).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt'])
    expect(diffFiles()).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt'])

    await userEvent.type(filter, 'h')
    expect(treeFiles()).toEqual(['a/hello.txt', 'a/hi.txt'])
    expect(diffFiles()).toEqual(['a/hello.txt', 'a/hi.txt'])
  })

  it('keeps matches visible inside a folder the user collapsed', async () => {
    const filter = await openFilesTab()
    await userEvent.click(screen.getByRole('button', { name: 'b' }))
    expect(treeFiles()).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt'])

    await userEvent.type(filter, 'b/')

    expect(treeFiles()).toEqual(['b/goodbye.txt'])
  })

  it('tells the user when no file matches', async () => {
    const filter = await openFilesTab()

    await userEvent.type(filter, 'nothing-here')

    expect(diffFiles()).toEqual([])
    expect(screen.getByText('No files match “nothing-here”.')).toBeInTheDocument()
  })

  it('shows every file again when the user presses Escape', async () => {
    const filter = await openFilesTab()
    await userEvent.type(filter, 'b/')

    await userEvent.keyboard('{Escape}')

    expect(filter).toHaveValue('')
    expect(diffFiles()).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt', 'b/goodbye.txt'])
  })
})

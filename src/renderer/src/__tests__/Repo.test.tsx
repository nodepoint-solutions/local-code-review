import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Repo from '../screens/Repo'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'
import type { PRListItem, RepositoryWithMeta } from '../../../shared/types'

const repo: RepositoryWithMeta = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: '2026-04-08T10:00:00Z',
  pr_count: 1,
}

function makePrItem(overrides: Partial<PRListItem> = {}): PRListItem {
  return {
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
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    workflowPhase: 'awaiting_review',
    openComments: 0,
    ...overrides,
  }
}

function renderRepo() {
  return render(
    <MemoryRouter initialEntries={['/repo/r1']}>
      <Routes>
        <Route path="/repo/:repoId" element={<Repo />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Repo PR list state', () => {
  beforeEach(() => {
    useStore.setState({ repos: [repo], selectedRepo: null })
  })

  it('shows the review phase and open-comment count on a row', async () => {
    installMockApi({
      listPrs: vi
        .fn()
        .mockResolvedValue([makePrItem({ workflowPhase: 'reviewed', openComments: 2 })]),
    })
    renderRepo()
    expect(await screen.findByText('Add auth middleware')).toBeInTheDocument()
    expect(screen.getByText('Review submitted')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/opened .+ ago/)).toBeInTheDocument()
  })

  it('shows no phase chip before a review starts', async () => {
    installMockApi({ listPrs: vi.fn().mockResolvedValue([makePrItem()]) })
    renderRepo()
    expect(await screen.findByText('Add auth middleware')).toBeInTheDocument()
    expect(screen.queryByText('Review submitted')).not.toBeInTheDocument()
    expect(screen.queryByText('Review in progress')).not.toBeInTheDocument()
  })

  it('shows the agent-fixing phase while an agent is assigned', async () => {
    installMockApi({
      listPrs: vi
        .fn()
        .mockResolvedValue([
          makePrItem({ workflowPhase: 'in_fix', assignee: 'claude', openComments: 1 }),
        ]),
    })
    renderRepo()
    expect(await screen.findByText('Agent fixing')).toBeInTheDocument()
  })
})

describe('Repo PR list refresh', () => {
  beforeEach(() => {
    useStore.setState({ repos: [repo], selectedRepo: null })
  })

  it('shows an agent change to a PR in this repository', async () => {
    let notify: (data: { repoPath: string; prId: string }) => void = () => {}
    installMockApi({
      listPrs: vi
        .fn()
        .mockResolvedValueOnce([makePrItem()])
        .mockResolvedValue([makePrItem({ title: 'Renamed by the agent' })]),
      onPrUpdated: vi.fn((callback) => {
        notify = callback
        return () => {}
      }),
    })
    renderRepo()
    expect(await screen.findByText('Add auth middleware')).toBeInTheDocument()

    await act(async () => notify({ repoPath: repo.path, prId: 'pr1' }))

    expect(await screen.findByText('Renamed by the agent')).toBeInTheDocument()
  })

  it('ignores a change to a PR in another repository', async () => {
    let notify: (data: { repoPath: string; prId: string }) => void = () => {}
    const listPrs = vi.fn().mockResolvedValue([makePrItem()])
    installMockApi({
      listPrs,
      onPrUpdated: vi.fn((callback) => {
        notify = callback
        return () => {}
      }),
    })
    renderRepo()
    expect(await screen.findByText('Add auth middleware')).toBeInTheDocument()

    await act(async () => notify({ repoPath: '/work/other-repo', prId: 'pr9' }))

    expect(listPrs).toHaveBeenCalledTimes(1)
  })
})

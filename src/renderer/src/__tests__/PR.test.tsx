import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PR from '../screens/PR'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'
import type { Commit, PrDetail, RepositoryWithMeta } from '../../../shared/types'

const repo: RepositoryWithMeta = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: '2026-04-08T10:00:00Z',
  pr_count: 1,
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

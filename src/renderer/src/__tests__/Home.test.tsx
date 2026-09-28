import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from '../screens/Home'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'
import type { ActivePrItem, Repository } from '../../../shared/types'

const repo: Repository = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: '2026-04-08T10:00:00Z',
}

const activePr: ActivePrItem = {
  version: 1,
  id: 'pr1',
  title: 'Add export button',
  description: null,
  base_branch: 'main',
  compare_branch: 'feature/export',
  status: 'open',
  assignee: null,
  assigned_at: null,
  merged_at: null,
  created_at: '2026-04-08T09:00:00Z',
  updated_at: '2026-04-08T09:00:00Z',
  workflowPhase: 'reviewing',
  openComments: 3,
  repoId: 'r1',
  repoName: 'sample-repo',
  repoPath: '/work/sample-repo',
}

function onboarded() {
  return vi
    .fn()
    .mockImplementation((key: string) =>
      Promise.resolve(key === 'onboarding_complete' ? 'true' : null)
    )
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/repo/:repoId/pr/:prId" element={<p>PR screen</p>} />
      </Routes>
    </MemoryRouter>
  )
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

describe('Home repo removal', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], scanResults: [], scanInProgress: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('removes a repo after confirmation and refreshes the list', async () => {
    const api = installMockApi({
      listRepos: vi.fn().mockResolvedValueOnce([repo]).mockResolvedValue([]),
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'onboarding_complete' ? 'true' : null)
        ),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderHome()
    expect(await screen.findByText('sample-repo')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove sample-repo from list' }))

    expect(api.removeRepo).toHaveBeenCalledWith('/work/sample-repo')
    await waitFor(() => expect(screen.queryByText('sample-repo')).not.toBeInTheDocument())
  })

  it('shows a repository the app adopts while the screen is open', async () => {
    let notify = (): void => {}
    installMockApi({
      listRepos: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([repo]),
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'onboarding_complete' ? 'true' : null)
        ),
      onReposChanged: vi.fn().mockImplementation((callback: () => void) => {
        notify = callback
        return () => {}
      }),
    })

    renderHome()
    await waitFor(() => expect(screen.queryByText('sample-repo')).not.toBeInTheDocument())

    await act(async () => notify())

    expect(await screen.findByText('sample-repo')).toBeInTheDocument()
  })

  it('removes nothing when the confirmation is declined', async () => {
    const api = installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'onboarding_complete' ? 'true' : null)
        ),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderHome()
    expect(await screen.findByText('sample-repo')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove sample-repo from list' }))

    expect(api.removeRepo).not.toHaveBeenCalled()
    expect(screen.getByText('sample-repo')).toBeInTheDocument()
  })
})

describe('Home active pull requests', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], scanResults: [], scanInProgress: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists open PRs across repositories with their review state', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listActivePrs: vi.fn().mockResolvedValue([activePr]),
      getSetting: onboarded(),
    })

    renderHome()

    expect(
      await screen.findByRole('heading', { name: 'Active pull requests', level: 2 })
    ).toBeInTheDocument()
    const active = within(section('Active pull requests'))
    expect(active.getByRole('button', { name: /Add export button/ })).toBeInTheDocument()
    expect(active.getByText('sample-repo')).toBeInTheDocument()
    expect(active.getByText('Review in progress')).toBeInTheDocument()
  })

  it('opens the PR when its row is clicked', async () => {
    installMockApi({
      listActivePrs: vi.fn().mockResolvedValue([activePr]),
      getSetting: onboarded(),
    })

    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: /Add export button/ }))

    expect(await screen.findByText('PR screen')).toBeInTheDocument()
  })

  it('hides the section when no PR is open', async () => {
    installMockApi({ listRepos: vi.fn().mockResolvedValue([repo]), getSetting: onboarded() })

    renderHome()
    expect(await screen.findByRole('heading', { name: 'Recent', level: 2 })).toBeInTheDocument()

    expect(screen.queryByRole('heading', { name: 'Active pull requests' })).not.toBeInTheDocument()
  })

  it('reloads when an agent changes a PR', async () => {
    let notify = (_data: { repoPath: string; prId: string }): void => {}
    installMockApi({
      listActivePrs: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([activePr]),
      getSetting: onboarded(),
      onPrUpdated: vi.fn().mockImplementation((callback: typeof notify) => {
        notify = callback
        return () => {}
      }),
    })

    renderHome()
    await act(async () => notify({ repoPath: '/work/sample-repo', prId: 'pr1' }))

    expect(await screen.findByRole('button', { name: /Add export button/ })).toBeInTheDocument()
  })

  it('drops the PRs of a repository the user removes', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValueOnce([repo]).mockResolvedValue([]),
      listActivePrs: vi.fn().mockResolvedValueOnce([activePr]).mockResolvedValue([]),
      getSetting: onboarded(),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderHome()
    await screen.findByRole('button', { name: /Add export button/ })
    await userEvent.click(screen.getByRole('button', { name: 'Remove sample-repo from list' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Add export button/ })).not.toBeInTheDocument()
    )
  })

  it('filters PRs by the search text', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listActivePrs: vi.fn().mockResolvedValue([activePr]),
      getSetting: onboarded(),
    })

    renderHome()
    await screen.findByRole('button', { name: /Add export button/ })
    await userEvent.type(screen.getByRole('textbox'), 'unrelated')

    expect(screen.queryByRole('button', { name: /Add export button/ })).not.toBeInTheDocument()
  })
})

describe('Home recent repositories', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], scanResults: [], scanInProgress: false })
  })

  it('lists a visited repository that has PRs', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listActivePrs: vi.fn().mockResolvedValue([activePr]),
      getSetting: onboarded(),
    })

    renderHome()
    await screen.findByRole('heading', { name: 'Recent', level: 2 })

    expect(
      within(section('Recent')).getByRole('button', { name: /^sample-repo/ })
    ).toBeInTheDocument()
  })
})

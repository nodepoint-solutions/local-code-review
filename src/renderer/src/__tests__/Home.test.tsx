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
        <Route path="/repo/:repoId" element={<p>Repo screen</p>} />
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
    expect(await screen.findByRole('heading', { name: 'Discovered', level: 2 })).toBeInTheDocument()

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

describe('Home repository lists', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], scanResults: [], scanInProgress: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const otherRepo: Repository = {
    id: 'r2',
    path: '/work/another-repo',
    name: 'another-repo',
    created_at: '2026-04-08T09:00:00Z',
    last_visited_at: null,
  }

  function scanning() {
    return vi
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(
          key === 'onboarding_complete' ? 'true' : key === 'scan_base_dir' ? '/work' : null
        )
      )
  }

  it('lists a repository whose PRs are all closed under Recent', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listReviewedRepos: vi
        .fn()
        .mockResolvedValue([{ ...repo, last_pr_at: '2026-04-08T09:00:00Z' }]),
      getSetting: onboarded(),
    })

    renderHome()
    await screen.findByRole('heading', { name: 'Recent', level: 2 })

    expect(
      within(section('Recent')).getByRole('button', { name: /^sample-repo/ })
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Discovered' })).not.toBeInTheDocument()
  })

  it('removes a repository from Recent', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValueOnce([repo]).mockResolvedValue([]),
      listReviewedRepos: vi
        .fn()
        .mockResolvedValueOnce([{ ...repo, last_pr_at: '2026-04-08T09:00:00Z' }])
        .mockResolvedValue([]),
      getSetting: onboarded(),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderHome()
    await screen.findByRole('heading', { name: 'Recent', level: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Remove sample-repo from list' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument()
    )
  })

  it('lists known repositories without PRs and scanned repositories under Discovered, A to Z', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo, otherRepo]),
      scanRepos: vi.fn().mockResolvedValue([
        { path: '/work/zeta', name: 'zeta' },
        { path: repo.path, name: repo.name },
      ]),
      getSetting: scanning(),
    })

    renderHome()
    await screen.findByRole('button', { name: /^zeta/ })

    const names = within(section('Discovered'))
      .getAllByRole('button', { name: /^(?!Remove)/ })
      .map((button) => button.textContent)
    expect(names).toEqual([
      expect.stringMatching(/^another-repo/),
      expect.stringMatching(/^sample-repo/),
      expect.stringMatching(/^zeta/),
    ])
  })

  it('shows a repository with an open PR only through its PRs', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listActivePrs: vi.fn().mockResolvedValue([activePr]),
      getSetting: onboarded(),
    })

    renderHome()
    await screen.findByRole('heading', { name: 'Active pull requests', level: 2 })

    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Discovered' })).not.toBeInTheDocument()
  })

  it('opens a known repository from Discovered without adding it again', async () => {
    const api = installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      getSetting: onboarded(),
    })

    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: /^sample-repo/ }))

    expect(await screen.findByText('Repo screen')).toBeInTheDocument()
    expect(api.addRepoByPath).not.toHaveBeenCalled()
  })
})

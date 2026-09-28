import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from '../screens/Home'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'
import type { RepoActivity, Repository } from '../../../shared/types'

const repo: Repository = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: '2026-04-08T10:00:00Z',
}

function activity(openPrCount: number): RepoActivity {
  return { ...repo, open_pr_count: openPrCount, last_pr_at: '2026-04-08T09:00:00Z' }
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
      </Routes>
    </MemoryRouter>
  )
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

describe('Home repository adoption', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], scanResults: [], scanInProgress: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
})

describe('Home active repositories', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], scanResults: [], scanInProgress: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists repositories with open PRs and their open-PR count', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listRepoActivity: vi.fn().mockResolvedValue([activity(2)]),
      getSetting: onboarded(),
    })

    renderHome()

    expect(
      await screen.findByRole('heading', { name: 'Active repositories', level: 2 })
    ).toBeInTheDocument()
    const active = within(section('Active repositories'))
    expect(active.getByRole('button', { name: /^sample-repo/ })).toBeInTheDocument()
    expect(active.getByText('2 open PRs')).toBeInTheDocument()
  })

  it('opens the repository when its row is clicked', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listRepoActivity: vi.fn().mockResolvedValue([activity(1)]),
      getSetting: onboarded(),
    })

    renderHome()
    await userEvent.click(await screen.findByRole('button', { name: /^sample-repo/ }))

    expect(await screen.findByText('Repo screen')).toBeInTheDocument()
  })

  it('hides the section when no repository has an open PR', async () => {
    installMockApi({ listRepos: vi.fn().mockResolvedValue([repo]), getSetting: onboarded() })

    renderHome()
    expect(await screen.findByRole('heading', { name: 'Discovered', level: 2 })).toBeInTheDocument()

    expect(screen.queryByRole('heading', { name: 'Active repositories' })).not.toBeInTheDocument()
  })

  it('reloads when an agent changes a PR', async () => {
    let notify = (_data: { repoPath: string; prId: string }): void => {}
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listRepoActivity: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([activity(1)]),
      getSetting: onboarded(),
      onPrUpdated: vi.fn().mockImplementation((callback: typeof notify) => {
        notify = callback
        return () => {}
      }),
    })

    renderHome()
    await screen.findByRole('heading', { name: 'Discovered', level: 2 })
    await act(async () => notify({ repoPath: '/work/sample-repo', prId: 'pr1' }))

    expect(
      await screen.findByRole('heading', { name: 'Active repositories', level: 2 })
    ).toBeInTheDocument()
  })

  it('filters repositories by the search text', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listRepoActivity: vi.fn().mockResolvedValue([activity(1)]),
      getSetting: onboarded(),
    })

    renderHome()
    await screen.findByRole('button', { name: /^sample-repo/ })
    await userEvent.type(screen.getByRole('textbox'), 'unrelated')

    expect(screen.queryByRole('button', { name: /^sample-repo/ })).not.toBeInTheDocument()
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
      listRepoActivity: vi.fn().mockResolvedValue([activity(0)]),
      getSetting: onboarded(),
    })

    renderHome()
    await screen.findByRole('heading', { name: 'Recent', level: 2 })

    expect(
      within(section('Recent')).getByRole('button', { name: /^sample-repo/ })
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Discovered' })).not.toBeInTheDocument()
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
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names).toEqual([
      expect.stringMatching(/^another-repo/),
      expect.stringMatching(/^sample-repo/),
      expect.stringMatching(/^zeta/),
    ])
  })

  it('shows a repository with an open PR only under Active repositories', async () => {
    installMockApi({
      listRepos: vi.fn().mockResolvedValue([repo]),
      listRepoActivity: vi.fn().mockResolvedValue([activity(1)]),
      getSetting: onboarded(),
    })

    renderHome()
    await screen.findByRole('heading', { name: 'Active repositories', level: 2 })

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

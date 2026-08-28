import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Home from '../screens/Home'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'
import type { RepositoryWithMeta } from '../../../shared/types'

const repo: RepositoryWithMeta = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: '2026-04-08T10:00:00Z',
  pr_count: 2,
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  )
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { UPDATE_CHECK_INTERVAL_MS } from '../App'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'
import { UPDATE_AUTH_DECLINED } from '../../../shared/types'
import type { RepositoryWithMeta } from '../../../shared/types'

const repo: RepositoryWithMeta = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: '2026-04-08T10:00:00Z',
  pr_count: 1,
}

describe('App deep links', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], selectedRepo: null })
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('renders a repo route directly after a reload, without visiting Home first', async () => {
    // A reload deep in the app: the hash points at a repo screen and the
    // in-memory repo list starts empty
    window.location.hash = '#/repo/r1'
    installMockApi({
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'setup_complete' ? 'true' : null)
        ),
      listRepos: vi.fn().mockResolvedValue([repo]),
      listPrs: vi.fn().mockResolvedValue([]),
    })

    render(<App />)

    // The repo resolves once App's own repo load lands — no Home visit involved
    expect(await screen.findByText('Pull Requests')).toBeInTheDocument()
  })
})

describe('update banner', () => {
  beforeEach(() => {
    useStore.setState({ repos: [], selectedRepo: null })
  })

  function mockWithUpdate(installResult: { success: boolean } | { error: string }): void {
    installMockApi({
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'setup_complete' ? 'true' : null)
        ),
      // A version no real release will ever reach, so the fixture stays
      // unmistakably fake as the app's own version climbs
      checkUpdate: vi.fn().mockResolvedValue({
        version: '99.0.0',
        url: 'https://example.com/releases',
        dmgUrl: 'https://example.com/update.dmg',
      }),
      installUpdate: vi.fn().mockResolvedValue(installResult),
    })
  }

  it('returns to an installable banner when the authorization dialog is declined', async () => {
    mockWithUpdate({ error: UPDATE_AUTH_DECLINED })
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Install & Relaunch' }))

    expect(await screen.findByText(/Update cancelled/)).toBeInTheDocument()
    // Declining is not a failure: the retry path stays, the failure copy does not
    expect(screen.getByRole('button', { name: 'Install & Relaunch' })).toBeInTheDocument()
    expect(screen.queryByText(/Update failed/)).not.toBeInTheDocument()
  })

  it('still reports other install errors as failures', async () => {
    mockWithUpdate({ error: 'Could not mount update DMG' })
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Install & Relaunch' }))

    expect(
      await screen.findByText(/Update failed \(Could not mount update DMG\)/)
    ).toBeInTheDocument()
  })
})

describe('periodic update check', () => {
  const release = (version: string) => ({
    version,
    url: 'https://example.com/releases',
    dmgUrl: 'https://example.com/update.dmg',
  })

  beforeEach(() => {
    useStore.setState({ repos: [], selectedRepo: null })
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mockCheckUpdate(checkUpdate: ReturnType<typeof vi.fn>): void {
    installMockApi({
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'setup_complete' ? 'true' : null)
        ),
      checkUpdate,
    })
  }

  async function waitForNextCheck(): Promise<void> {
    await act(() => vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS))
  }

  it('shows the banner when a release lands while the app stays open', async () => {
    const checkUpdate = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(release('99.0.0'))
    mockCheckUpdate(checkUpdate)
    render(<App />)
    await vi.waitFor(() => expect(checkUpdate).toHaveBeenCalledTimes(1))

    expect(screen.queryByText(/is available/)).not.toBeInTheDocument()

    await waitForNextCheck()

    expect(await screen.findByText('99.0.0')).toBeInTheDocument()
  })

  it('keeps a dismissed version hidden but shows a newer one', async () => {
    const checkUpdate = vi
      .fn()
      .mockResolvedValueOnce(release('99.0.0'))
      .mockResolvedValueOnce(release('99.0.0'))
      .mockResolvedValue(release('99.1.0'))
    mockCheckUpdate(checkUpdate)
    render(<App />)

    await screen.findByText('99.0.0')
    await userEvent.click(screen.getByTitle('Dismiss'))

    await waitForNextCheck()
    expect(screen.queryByText('99.0.0')).not.toBeInTheDocument()

    await waitForNextCheck()
    expect(await screen.findByText('99.1.0')).toBeInTheDocument()
  })
})

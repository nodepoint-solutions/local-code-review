import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'
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

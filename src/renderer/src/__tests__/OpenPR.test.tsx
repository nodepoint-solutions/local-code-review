import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OpenPR from '../screens/OpenPR'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'

const repo = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: null,
  pr_count: 0,
}

function renderOpenPr() {
  return render(
    <MemoryRouter initialEntries={['/repo/r1/new-pr']}>
      <Routes>
        <Route path="/repo/:repoId/new-pr" element={<OpenPR />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('OpenPR assignee picker', () => {
  beforeEach(() => {
    useStore.setState({ repos: [repo] })
    localStorage.clear()
  })

  it('offers Claude, Copilot, and Me, defaulting to Me', async () => {
    installMockApi({ listBranches: vi.fn().mockResolvedValue(['main', 'feature/x']) })
    renderOpenPr()
    const picker = await screen.findByRole('combobox', { name: /assignee/i })
    expect(picker).toHaveValue('me')
    expect(screen.getByRole('option', { name: /claude code/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /copilot/i })).toBeInTheDocument()
  })

  it('sends the chosen assignee with the create payload and remembers it', async () => {
    const api = installMockApi({
      listBranches: vi.fn().mockResolvedValue(['main', 'feature/x']),
      createPr: vi.fn().mockResolvedValue({ id: 'pr9' }),
    })
    renderOpenPr()
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /assignee/i }),
      'claude'
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /base branch/i }), 'main')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /compare branch/i }),
      'feature/x'
    )
    await userEvent.type(screen.getByLabelText(/title/i), 'My PR')
    await userEvent.click(screen.getByRole('button', { name: /create pull request/i }))
    await waitFor(() =>
      expect(api.createPr).toHaveBeenCalledWith(expect.objectContaining({ assignee: 'claude' }))
    )
    expect(localStorage.getItem('newPrAssignee')).toBe('claude')
  })
})

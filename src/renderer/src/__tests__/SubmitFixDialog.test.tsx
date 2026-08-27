import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubmitFixDialog from '../components/SubmitFixDialog'
import { installMockApi } from './helpers/mock-api'

function renderDialog(overrides: Record<string, unknown> = {}) {
  const api = installMockApi(overrides)
  const onClose = vi.fn()
  const onUpdated = vi.fn()
  render(
    <SubmitFixDialog
      assignee="claude"
      commentCount={3}
      repoPath="/repo"
      prId="pr1"
      reviewId="rev1"
      onClose={onClose}
      onUpdated={onUpdated}
    />
  )
  return { api, onClose, onUpdated }
}

describe('SubmitFixDialog', () => {
  it('offers start, copy, and later for the assigned agent', () => {
    renderDialog()
    expect(
      screen.getByRole('dialog', { name: /start fixing review comments/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/claude code is assigned to fix 3 comments/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start fix/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy prompt/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument()
  })

  it('start fix launches the agent, refreshes the PR, and closes', async () => {
    const { api, onClose, onUpdated } = renderDialog({
      launchFix: vi.fn().mockResolvedValue({}),
      getPr: vi.fn().mockResolvedValue(null),
    })
    await userEvent.click(screen.getByRole('button', { name: /start fix/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.launchFix).toHaveBeenCalledWith('claude', '/repo', 'pr1', 'rev1')
    expect(onUpdated).toHaveBeenCalled()
  })

  it('copy prompt shows paste instructions instead of closing', async () => {
    const { api, onClose } = renderDialog({
      copyFixPrompt: vi.fn().mockResolvedValue({ prompt: '/local-code-review x' }),
    })
    await userEvent.click(screen.getByRole('button', { name: /copy prompt/i }))
    expect(await screen.findByText(/prompt copied to clipboard/i)).toBeInTheDocument()
    expect(api.copyFixPrompt).toHaveBeenCalledWith('/repo', 'pr1', 'rev1')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('later closes without starting anything', async () => {
    const { api, onClose } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /later/i }))
    expect(onClose).toHaveBeenCalled()
    expect(api.launchFix).not.toHaveBeenCalled()
    expect(api.copyFixPrompt).not.toHaveBeenCalled()
  })
})

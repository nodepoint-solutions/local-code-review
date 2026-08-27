import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubmitFixDialog from '../components/SubmitFixDialog'
import { installMockApi } from './helpers/mock-api'
import type { PrDetail } from '../../../shared/types'

const detail: PrDetail = {
  pr: {
    version: 1,
    id: 'pr1',
    title: 'Test PR',
    description: null,
    base_branch: 'main',
    compare_branch: 'feature/x',
    status: 'open',
    assignee: 'claude',
    assigned_at: '2026-04-08T09:00:00Z',
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

function renderDialog(
  overrides: Record<string, unknown> = {},
  props: Partial<{ assignee: 'claude' | 'vscode'; commentCount: number }> = {}
) {
  const api = installMockApi(overrides)
  const onClose = vi.fn()
  const onUpdated = vi.fn()
  render(
    <SubmitFixDialog
      assignee={props.assignee ?? 'claude'}
      commentCount={props.commentCount ?? 3}
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
      getPr: vi.fn().mockResolvedValue(detail),
    })
    // The handler chains two awaited IPC calls (launchFix, then getPr) before
    // its final state settles, so the whole interaction runs inside one act
    // scope — otherwise the second hop's state updates commit outside of any
    // act() window and React warns even though the assertions below still pass.
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /start fix/i }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.launchFix).toHaveBeenCalledWith('claude', '/repo', 'pr1', 'rev1')
    expect(onUpdated).toHaveBeenCalledWith(detail)
  })

  it('copy prompt shows paste instructions instead of closing', async () => {
    const { api, onClose } = renderDialog({
      copyFixPrompt: vi.fn().mockResolvedValue({ prompt: '/local-code-review x' }),
      getPr: vi.fn().mockResolvedValue(detail),
    })
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /copy prompt/i }))
    })
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

  it('vscode start fix stays open and shows paste instructions when launch returns a prompt', async () => {
    const { api, onClose } = renderDialog(
      {
        launchFix: vi.fn().mockResolvedValue({ prompt: '/local-code-review vscode-prompt' }),
        getPr: vi.fn().mockResolvedValue(detail),
      },
      { assignee: 'vscode' }
    )
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /start fix/i }))
    })
    expect(await screen.findByText(/prompt copied to clipboard/i)).toBeInTheDocument()
    expect(
      screen.getByText(/switch to the copilot agent tab and paste the prompt/i)
    ).toBeInTheDocument()
    expect(api.launchFix).toHaveBeenCalledWith('vscode', '/repo', 'pr1', 'rev1')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('leaves the parent PR detail untouched when the post-action refresh fails', async () => {
    const { onUpdated } = renderDialog({
      copyFixPrompt: vi.fn().mockResolvedValue({ prompt: '/local-code-review x' }),
      getPr: vi.fn().mockResolvedValue({ error: 'not found' }),
    })
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /copy prompt/i }))
    })
    // Copying still succeeded, so the paste-instructions UI shows even though
    // the follow-up refresh failed — the failure must not reach the parent.
    expect(await screen.findByText(/prompt copied to clipboard/i)).toBeInTheDocument()
    expect(onUpdated).not.toHaveBeenCalled()
  })
})

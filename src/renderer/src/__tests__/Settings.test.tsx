import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '../screens/Settings'
import { installMockApi } from './helpers/mock-api'

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  )
}

describe('Settings terminal picker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists installed terminals and saves the choice', async () => {
    const api = installMockApi({
      listTerminals: vi.fn().mockResolvedValue(['Terminal', 'Ghostty']),
      getSetting: vi.fn().mockResolvedValue(null),
    })
    renderSettings()

    // Options render only once `listTerminals` resolves, so waiting on one of
    // them (rather than the combobox itself, which exists from first paint)
    // ensures the async update is settled before we interact with the field.
    await screen.findByRole('option', { name: 'Ghostty' })
    const picker = screen.getByRole('combobox', { name: /terminal/i })
    expect(picker).toHaveValue('Terminal')
    expect(screen.getByRole('option', { name: 'Terminal.app' })).toBeInTheDocument()

    // The change handler awaits `setSetting` before settling, so the
    // selection is wrapped in one act() scope to let that commit land inside
    // it rather than after the test moves on.
    await act(async () => {
      await userEvent.selectOptions(picker, 'Ghostty')
    })

    await waitFor(() => expect(api.setSetting).toHaveBeenCalledWith('terminal_app', 'Ghostty'))
  })

  it('preselects the saved terminal when one is stored', async () => {
    installMockApi({
      listTerminals: vi.fn().mockResolvedValue(['Terminal', 'iTerm', 'Ghostty']),
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'terminal_app' ? 'iTerm' : null)
        ),
    })
    renderSettings()

    await screen.findByRole('option', { name: 'iTerm2' })
    const picker = screen.getByRole('combobox', { name: /terminal/i })
    await waitFor(() => expect(picker).toHaveValue('iTerm'))
  })
})

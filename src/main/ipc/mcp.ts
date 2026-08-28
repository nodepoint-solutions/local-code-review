// src/main/ipc/mcp.ts
import { ipcMain, clipboard } from 'electron'
import { spawn } from 'child_process'
import type { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { getSetting, setSetting } from '../db/settings'
import { getIntegrations, installIntegrations } from '../integrations'
import type { McpManager } from '../mcp-manager'
import { assertKnownRepo } from './_guard'
import { ReviewStore } from '../../shared/review-store'
import { buildFixPrompt, buildLaunchCommand, detectTerminals } from '../fix-launcher'
import type { TerminalApp } from '../fix-launcher'

const store = new ReviewStore()

export function registerMcpHandlers(
  db: Database.Database,
  mcpManager: McpManager,
  getMainWindow: () => BrowserWindow | null,
  updateTrayMenu: () => void
): void {
  ipcMain.handle('mcp:get-status', () => ({ running: mcpManager.running }))

  ipcMain.handle('mcp:toggle', () => {
    if (mcpManager.running) {
      mcpManager.stop()
      setSetting(db, 'mcp_enabled', 'false')
    } else {
      mcpManager.start()
      setSetting(db, 'mcp_enabled', 'true')
    }
    const running = mcpManager.running
    getMainWindow()?.webContents.send('mcp:status-changed', { running })
    updateTrayMenu()
    return { running }
  })

  ipcMain.handle('integrations:get', () => getIntegrations())
  ipcMain.handle('integrations:install', () => installIntegrations())

  ipcMain.handle('terminals:list', () => detectTerminals())

  // "Fix with" launcher — starts the assignee's fix session. Stamping
  // fix_started_at here (idempotently) keeps the phase and the action in
  // one place, so they can never disagree; a nudge re-launches without
  // moving the original start time.
  ipcMain.handle(
    'fix:launch',
    (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
      try {
        assertKnownRepo(db, repoPath)
      } catch (err) {
        return { error: (err as Error).message }
      }

      const prompt = buildFixPrompt(repoPath, prId, reviewId)

      if (tool === 'claude' || tool === 'copilot') {
        const saved = getSetting(db, 'terminal_app') as TerminalApp | null
        const terminal: TerminalApp = saved ?? 'Terminal'
        const { command, args } = buildLaunchCommand(tool, terminal, repoPath, prompt)
        spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
        store.startFix(repoPath, prId, reviewId)
        return {}
      }

      return { error: `Unknown tool: ${tool}` }
    }
  )

  // Manual path: the user drives the same fix from their own agent session,
  // so copying counts as starting.
  ipcMain.handle('fix:copy-prompt', (_e, repoPath: string, prId: string, reviewId: string) => {
    try {
      assertKnownRepo(db, repoPath)
    } catch (err) {
      return { error: (err as Error).message }
    }
    const prompt = buildFixPrompt(repoPath, prId, reviewId)
    clipboard.writeText(prompt)
    store.startFix(repoPath, prId, reviewId)
    return { prompt }
  })
}

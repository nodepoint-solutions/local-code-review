// src/main/ipc/mcp.ts
import { ipcMain, clipboard } from 'electron'
import { spawn } from 'child_process'
import type { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { setSetting } from '../db/settings'
import { getIntegrations, installIntegrations } from '../integrations'
import type { McpManager } from '../mcp-manager'
import { assertKnownRepo } from './_guard'

export function registerMcpHandlers(
  db: Database.Database,
  mcpManager: McpManager,
  getMainWindow: () => BrowserWindow | null,
  updateTrayMenu: () => void,
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

  // "Fix with" launcher — opens the agent tool in Terminal / VS Code
  ipcMain.handle('fix:launch', (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
    try {
      assertKnownRepo(db, repoPath)
    } catch (err) {
      return { error: (err as Error).message }
    }

    const prompt = `/local-code-review repo_path="${repoPath}" pr_id="${prId}" review_id="${reviewId}"`

    if (tool === 'claude') {
      // Pass repoPath and prompt as separate osascript argv items so the shell
      // never tokenises them — AppleScript's `quoted form of` handles quoting
      // for the final `do script` call using OS-provided rules. No string
      // escaping required on our side.
      spawn(
        'osascript',
        [
          '-e', 'on run argv',
          '-e', '  tell application "Terminal" to do script ("cd " & quoted form of item 1 of argv & " && claude " & quoted form of item 2 of argv)',
          '-e', 'end run',
          '--',
          repoPath,
          prompt,
        ],
        { detached: true, stdio: 'ignore' },
      ).unref()
      return {}
    }

    if (tool === 'vscode') {
      clipboard.writeText(prompt)
      // Delay opening VS Code by 10 s so the user has time to read the modal
      setTimeout(() => {
        spawn('open', ['-a', 'Visual Studio Code', repoPath], { detached: true, stdio: 'ignore' }).unref()
      }, 5_000)
      return { prompt }
    }

    return { error: `Unknown tool: ${tool}` }
  })
}

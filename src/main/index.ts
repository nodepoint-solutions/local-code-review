// src/main/index.ts
;(globalThis as any).__non_webpack_require__ = require

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb } from './db'
import { registerRepoHandlers } from './ipc/repos'
import { registerPrHandlers } from './ipc/prs'
import { registerReviewHandlers } from './ipc/reviews'
import { registerExportHandlers } from './ipc/export'
import { McpManager } from './mcp-manager'
import { ReviewWatcher } from './review-watcher'
import { getSetting, setSetting } from './db/settings'
import { listRepos } from './db/repos'
import { getIntegrations, installIntegrations } from './integrations'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let mcpManager: McpManager | null = null
let reviewWatcher: ReviewWatcher | null = null

function writeErrorLog(err: unknown): void {
  try {
    const logsDir = join(app.getPath('logs'), 'local-code-review')
    mkdirSync(logsDir, { recursive: true })
    const msg = `[${new Date().toISOString()}] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
    writeFileSync(join(logsDir, 'error.log'), msg, { flag: 'a' })
  } catch {
    // ignore — can't do anything if logging itself fails
  }
}

process.on('uncaughtException', (err) => {
  writeErrorLog(err)
})

process.on('unhandledRejection', (reason) => {
  writeErrorLog(reason)
})

/** Path to the resources directory — works both in dev and in packaged builds. */
function resourcesPath(): string {
  return is.dev ? join(__dirname, '../../resources') : process.resourcesPath
}

function createTray(db: ReturnType<typeof getDb>): void {
  const iconPath = join(resourcesPath(), 'iconTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)
  tray = new Tray(icon)

  function updateMenu(): void {
    const running = mcpManager?.running ?? false
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Interface',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            mainWindow = createWindow()
          } else {
            mainWindow.show()
          }
        },
      },
      { type: 'separator' },
      {
        label: running ? 'MCP Server: Running ✓' : 'MCP Server: Stopped',
        click: () => {
          if (running) {
            mcpManager!.stop()
            setSetting(db, 'mcp_enabled', 'false')
          } else {
            mcpManager!.start()
            setSetting(db, 'mcp_enabled', 'true')
          }
          updateMenu()
          mainWindow?.webContents.send('mcp:status-changed', { running: mcpManager?.running ?? false })
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          mcpManager?.stop()
          reviewWatcher?.unwatchAll()
          app.quit()
        },
      },
    ])
    tray!.setContextMenu(menu)
    tray!.setToolTip('Local Code Review')
  }

  updateMenu()
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // Window icon for Windows / Linux taskbar (macOS uses the bundle icon)
    icon: join(resourcesPath(), 'icon-512.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.on('render-process-gone', (_event, details) => {
    writeErrorLog(new Error(`Renderer process gone: ${details.reason} (exit ${details.exitCode})`))
  })

  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    writeErrorLog(new Error(`Renderer failed to load ${url}: [${code}] ${desc}`))
  })

  win.on('close', (e) => {
    if (mcpManager?.running) {
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  try {
  electronApp.setAppUserModelId('com.local-code-review')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const db = getDb()

  reviewWatcher = new ReviewWatcher()
  mcpManager = new McpManager((event) => {
    if (event.event === 'pr:updated') {
      mainWindow?.webContents.send('pr:updated', { repoPath: event.repoPath, prId: event.prId })
    } else {
      mainWindow?.webContents.send('review:updated', {
        repoPath: event.repoPath,
        prId: event.prId,
        reviewId: event.reviewId,
      })
    }
  })

  if (getSetting(db, 'mcp_enabled') === 'true') {
    mcpManager.start()
  }

  for (const repo of listRepos(db)) {
    reviewWatcher.watch(repo.path, (repoPath) => {
      mainWindow?.webContents.send('review:updated', { repoPath, prId: null, reviewId: null })
    })
  }

  registerRepoHandlers(db)
  registerPrHandlers(db)
  registerReviewHandlers(db)
  registerExportHandlers(db)

  ipcMain.handle('mcp:get-status', () => ({ running: mcpManager?.running ?? false }))
  ipcMain.handle('mcp:toggle', () => {
    if (mcpManager!.running) {
      mcpManager!.stop()
      setSetting(db, 'mcp_enabled', 'false')
    } else {
      mcpManager!.start()
      setSetting(db, 'mcp_enabled', 'true')
    }
    const running = mcpManager!.running
    mainWindow?.webContents.send('mcp:status-changed', { running })
    return { running }
  })

  // Integrations
  ipcMain.handle('integrations:get', () => getIntegrations())
  ipcMain.handle('integrations:install', () => installIntegrations())

  // "Fix with" launcher — interactive, fire and forget
  ipcMain.handle('fix:launch', (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
    const prompt = `You are implementing fixes from a local code review. Use the local-code-review MCP tools.

repo_path: ${repoPath}
pr_id: ${prId}
review_id: ${reviewId}

1. Call get_open_issues(repo_path, pr_id, review_id) to see all open issues
2. For each open issue: implement the fix in the codebase, then call mark_resolved() or mark_wont_fix() with a clear explanation
3. Never mark an issue without a resolution_comment
4. When all issues are addressed, call complete_assignment(repo_path, pr_id) to unassign yourself and signal that you are done`

    if (tool === 'claude') {
      const safeRepo = repoPath.replace(/'/g, "'\\''")
      const safePrompt = prompt.replace(/'/g, "'\\''")
      const shellCmd = `cd '${safeRepo}' && claude '${safePrompt}'`
      const appleScript = `tell application "Terminal" to do script "${shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      const { spawn } = require('child_process') as typeof import('child_process')
      spawn('osascript', ['-e', appleScript], { detached: true, stdio: 'ignore' }).unref()
      return {}
    }

    if (tool === 'vscode') {
      const { clipboard } = require('electron') as typeof import('electron')
      clipboard.writeText(prompt)
      const { spawn } = require('child_process') as typeof import('child_process')
      spawn('open', ['-a', 'Visual Studio Code', repoPath], { detached: true, stdio: 'ignore' }).unref()
      return {}
    }

    return { error: `Unknown tool: ${tool}` }
  })

  // Hide the dock icon — the tray owns the app lifecycle
  if (process.platform === 'darwin') {
    app.dock.hide()
  }

  createTray(db)
  mainWindow = createWindow()

  // Guard prevents rapid successive activate events from spawning multiple windows.
  // On macOS dock-hidden apps, calling focus() inside the activate handler can
  // re-trigger activate, so we only show/create — never focus — from here.
  let _activating = false
  app.on('activate', () => {
    if (_activating) return
    _activating = true
    setTimeout(() => { _activating = false }, 500)

    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createWindow()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    // Do NOT call focus() — triggers re-entrant activate on dock-hidden macOS apps
  })
  } catch (err) {
    writeErrorLog(err)
    app.quit()
  }
})

app.on('before-quit', () => {
  mcpManager?.stop()
  reviewWatcher?.unwatchAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !mcpManager?.running) {
    app.quit()
  }
})

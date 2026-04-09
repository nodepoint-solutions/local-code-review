// src/main/index.ts
;(globalThis as any).__non_webpack_require__ = require

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } from 'electron'
import { join } from 'path'
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

function createTray(db: ReturnType<typeof getDb>): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  function updateMenu(): void {
    const running = mcpManager?.running ?? false
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Interface',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

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
  electronApp.setAppUserModelId('com.local-code-review')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const db = getDb()

  reviewWatcher = new ReviewWatcher()
  mcpManager = new McpManager((event) => {
    mainWindow?.webContents.send('review:updated', {
      repoPath: event.repoPath,
      prId: event.prId,
      reviewId: event.reviewId,
    })
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

  // "Fix with" launcher
  ipcMain.handle('fix:launch', async (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
    try {
      if (tool === 'claude') {
        const mcpFlag = mcpManager?.running ? ['--mcp-server', 'local-code-review'] : []
        const prompt = `Fix the open issues in .reviews/${prId}/reviews/${reviewId}.json`
        const { execFile } = await import('child_process')
        await new Promise<void>((res, rej) =>
          execFile('claude', [...mcpFlag, prompt], { cwd: repoPath }, (err) => (err ? rej(err) : res()))
        )
        return {}
      }
      if (tool === 'vscode') {
        const prompt = `Fix the open issues in .reviews/${prId}/reviews/${reviewId}.json`
        mainWindow?.webContents.executeJavaScript(`navigator.clipboard.writeText(${JSON.stringify(prompt)})`)
        const { execFile } = await import('child_process')
        await new Promise<void>((res, rej) =>
          execFile('code', [repoPath], (err) => (err ? rej(err) : res()))
        )
        return {}
      }
      return { error: `Unknown tool: ${tool}` }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  createTray(db)
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else {
      mainWindow?.show()
    }
  })
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

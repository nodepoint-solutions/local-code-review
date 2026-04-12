// src/main/index.ts
// better-sqlite3 uses __non_webpack_require__ to load its native .node binding;
// without this, electron-vite's bundled require would intercept the call and
// the native module would fail to load at runtime.
;(globalThis as any).__non_webpack_require__ = require

import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb } from './db'
import { registerRepoHandlers } from './ipc/repos'
import { registerPrHandlers } from './ipc/prs'
import { registerReviewHandlers } from './ipc/reviews'
import { registerExportHandlers } from './ipc/export'
import { registerMcpHandlers } from './ipc/mcp'
import { McpManager } from './mcp-manager'
import { ReviewWatcher } from './review-watcher'
import { getSetting, setSetting } from './db/settings'
import { listRepos } from './db/repos'

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

let updateTrayMenu: (() => void) | null = null

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

  updateTrayMenu = updateMenu
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
      },
  })

  win.on('ready-to-show', () => win.show())

  if (process.platform === 'darwin') {
    win.on('show', () => app.dock.show())
    win.on('hide', () => app.dock.hide())
  }

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

// In dev, use a separate userData dir so the dev instance doesn't conflict
// with the installed production app's single-instance lock and database
if (is.dev) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

// Enforce single instance — prevents second launch from spawning a ghost dock icon
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
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
  mcpManager.onChildExit = () => {
    mainWindow?.webContents.send('mcp:status-changed', { running: false })
    updateTrayMenu?.()
  }
  mcpManager.onStderr = (line) => writeErrorLog(new Error(line))

  if (getSetting(db, 'mcp_enabled') !== 'false') {
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
  registerMcpHandlers(db, mcpManager, () => mainWindow, () => updateTrayMenu?.())

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

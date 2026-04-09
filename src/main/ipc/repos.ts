import { ipcMain, dialog } from 'electron'
import path from 'path'
import type Database from 'better-sqlite3'
import { insertRepo, listReposWithMeta, touchRepo } from '../db/repos'
import { getSetting, setSetting } from '../db/settings'
import { isGitRepo } from '../git/branches'
import { scanForRepos } from '../git/scanner'

export function registerRepoHandlers(db: Database.Database): void {
  ipcMain.handle('repos:list', () => {
    try {
      return listReposWithMeta(db)
    } catch {
      return []
    }
  })

  ipcMain.handle('repos:open', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select a Git Repository',
      })
      if (result.canceled || !result.filePaths[0]) return { error: 'cancelled' }

      const repoPath = result.filePaths[0]
      const valid = await isGitRepo(repoPath)
      if (!valid) return { error: 'not-a-git-repo' }

      const name = path.basename(repoPath)
      const repo = insertRepo(db, repoPath, name)
      touchRepo(db, repo.id)
      return { repo }
    } catch (err) {
      return { error: 'unexpected', message: (err as Error).message }
    }
  })

  ipcMain.handle('repos:add-by-path', async (_event, repoPath: string) => {
    try {
      const valid = await isGitRepo(repoPath)
      if (!valid) return { error: 'not-a-git-repo' }

      const name = path.basename(repoPath)
      const repo = insertRepo(db, repoPath, name)
      touchRepo(db, repo.id)
      return { repo }
    } catch (err) {
      return { error: 'unexpected', message: (err as Error).message }
    }
  })

  ipcMain.handle('repos:touch', (_event, repoId: string) => {
    try {
      touchRepo(db, repoId)
    } catch {
      // non-fatal
    }
  })

  ipcMain.handle('repos:get-setting', (_event, key: string) => {
    try {
      return getSetting(db, key)
    } catch {
      return null
    }
  })

  ipcMain.handle('repos:set-setting', (_event, key: string, value: string) => {
    try {
      setSetting(db, key, value)
    } catch {
      // non-fatal
    }
  })

  ipcMain.handle('repos:scan', async () => {
    try {
      const baseDir = getSetting(db, 'scan_base_dir')
      if (!baseDir) return []
      return await scanForRepos(baseDir)
    } catch {
      return []
    }
  })

  ipcMain.handle('repos:open-scan-dir-picker', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select your projects directory',
      })
      if (result.canceled || !result.filePaths[0]) return null
      return result.filePaths[0]
    } catch {
      return null
    }
  })

  ipcMain.handle('repos:reset', () => {
    try {
      db.exec('DELETE FROM repositories; DELETE FROM settings;')
    } catch {
      // non-fatal
    }
  })
}

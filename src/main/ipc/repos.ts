import { ipcMain, dialog } from 'electron'
import path from 'path'
import type Database from 'better-sqlite3'
import { insertRepo, listRepos } from '../db/repos'
import { isGitRepo } from '../git/branches'

export function registerRepoHandlers(db: Database.Database): void {
  ipcMain.handle('repos:list', () => listRepos(db))

  ipcMain.handle('repos:open', async () => {
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
    return { repo }
  })
}

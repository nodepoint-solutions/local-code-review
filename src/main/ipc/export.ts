// src/main/ipc/export.ts
import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { buildMarkdown, prTitleSlug } from '../export/markdown'

const store = new ReviewStore()

export function registerExportHandlers(_db: Database.Database): void {
  ipcMain.handle(
    'export:download-markdown',
    async (_e, repoPath: string, prId: string, reviewId: string) => {
      try {
        const pr = store.getPR(repoPath, prId)
        const review = store.getReview(repoPath, prId, reviewId)

        const date = new Date().toISOString().slice(0, 10)
        const slug = prTitleSlug(pr.title)
        const defaultName = `review-${slug}-${date}.md`

        const { filePath, canceled } = await dialog.showSaveDialog({
          title: 'Save Review as Markdown',
          defaultPath: defaultName,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })

        if (canceled || !filePath) return { error: 'cancelled' }

        const md = buildMarkdown(pr, review)
        fs.writeFileSync(filePath, md, 'utf8')
        return { path: filePath }
      } catch (err) {
        return { error: 'export-failed', message: (err as Error).message }
      }
    }
  )
}

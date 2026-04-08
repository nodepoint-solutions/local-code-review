import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import type Database from 'better-sqlite3'
import { getPr } from '../db/prs'
import { submitReview, listComments, getCommentContext } from '../db/reviews'
import { buildMarkdown, prTitleSlug } from '../export/markdown'
import { buildJson } from '../export/json'
import type { ExportResult } from '../../shared/types'

export function registerExportHandlers(db: Database.Database): void {
  ipcMain.handle('export:submit', async (_e, reviewId: string, prId: string): Promise<ExportResult | { error: string }> => {
    try {
      const pr = getPr(db, prId)
      if (!pr) return { error: 'pr-not-found' }

      // Gather data BEFORE showing dialog (non-destructive reads)
      const comments = listComments(db, reviewId)
      const contextMap: Record<string, any[]> = {}
      for (const comment of comments) {
        contextMap[comment.id] = getCommentContext(db, comment.id)
      }

      const date = new Date().toISOString().slice(0, 10)
      const slug = prTitleSlug(pr.title)
      const defaultName = `review-${slug}-${date}`

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Review',
        defaultPath: defaultName + '.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })

      if (canceled || !filePath) return { error: 'cancelled' }

      // Submit AFTER user confirms save path
      const review = submitReview(db, reviewId)

      const md = buildMarkdown(pr, review, comments, contextMap)
      const json = buildJson(pr, review, comments, contextMap)

      const basePath = filePath.replace(/\.md$/, '')
      const mdPath = basePath + '.md'
      const jsonPath = basePath + '.json'

      fs.writeFileSync(mdPath, md, 'utf8')
      fs.writeFileSync(jsonPath, json, 'utf8')

      return { mdPath, jsonPath }
    } catch (err) {
      return { error: 'export-failed', message: (err as Error).message } as any
    }
  })
}

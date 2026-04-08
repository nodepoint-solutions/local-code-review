import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getOrCreateInProgressReview, addComment, listComments, getCommentContext } from '../db/reviews'
import type { AddCommentPayload } from '../../shared/types'

export function registerReviewHandlers(db: Database.Database): void {
  ipcMain.handle('reviews:get-current', (_e, prId: string) => {
    try {
      return db.prepare(`SELECT * FROM reviews WHERE pr_id = ? AND status = 'in_progress' LIMIT 1`).get(prId) ?? null
    } catch {
      return null
    }
  })

  ipcMain.handle('comments:add', async (_e, payload: AddCommentPayload & { repoPath: string }) => {
    try {
      const review = getOrCreateInProgressReview(db, payload.prId)
      const comment = addComment(db, {
        reviewId: review.id,
        filePath: payload.filePath,
        startLine: payload.startLine,
        endLine: payload.endLine,
        side: payload.side,
        body: payload.body,
        contextLines: payload.contextLines,
      })
      return { review, comment }
    } catch (err) {
      return { error: 'db-failed', message: (err as Error).message }
    }
  })

  ipcMain.handle('comments:list', (_e, reviewId: string) => {
    try {
      return listComments(db, reviewId)
    } catch {
      return []
    }
  })

  ipcMain.handle('comments:context', (_e, commentId: string) => {
    try {
      return getCommentContext(db, commentId)
    } catch {
      return []
    }
  })
}

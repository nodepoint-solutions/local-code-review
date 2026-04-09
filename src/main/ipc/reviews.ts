// src/main/ipc/reviews.ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { resolveSha } from '../git/branches'
import { execGit } from '../git/runner'
import { parseDiff } from '../git/diff-parser'
import type { AddCommentPayload, PrDetail } from '../../shared/types'

const store = new ReviewStore()

export function registerReviewHandlers(_db: Database.Database): void {
  ipcMain.handle('comments:add', async (_e, payload: AddCommentPayload) => {
    try {
      const updated = store.addComment(payload.repoPath, payload.prId, payload.reviewId, {
        file: payload.file,
        start_line: payload.startLine,
        end_line: payload.endLine,
        side: payload.side,
        body: payload.body,
        context: payload.context,
      })
      return updated
    } catch (err) {
      return { error: 'store-failed', message: (err as Error).message }
    }
  })

  ipcMain.handle('reviews:submit', async (_e, repoPath: string, prId: string, reviewId: string) => {
    try {
      return store.submitReview(repoPath, prId, reviewId)
    } catch (err) {
      return { error: 'store-failed', message: (err as Error).message }
    }
  })

  ipcMain.handle('reviews:new', async (_e, repoPath: string, prId: string): Promise<PrDetail | { error: string }> => {
    try {
      const pr = store.getPR(repoPath, prId)
      const baseSha = await resolveSha(repoPath, pr.base_branch)
      const compareSha = await resolveSha(repoPath, pr.compare_branch)
      const review = store.createReview(repoPath, prId, { base_sha: baseSha, compare_sha: compareSha })
      const rawDiff = await execGit(repoPath, ['diff', `${baseSha}..${compareSha}`, '--unified=3'])
      const diff = parseDiff(rawDiff)
      return { pr, diff, review, isStale: false }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
}

// src/main/ipc/reviews.ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { PRWorkflow } from '../../shared/pr-workflow'
import { resolveSha } from '../git/branches'
import { getDiff } from '../git/diff-parser'
import { countCommitsBetween } from '../git/commits'
import type { AddCommentPayload, PrDetail } from '../../shared/types'

const store = new ReviewStore()

export function registerReviewHandlers(_db: Database.Database): void {
  ipcMain.handle('comments:add', async (_e, payload: AddCommentPayload) => {
    try {
      const pr = store.getPR(payload.repoPath, payload.prId)
      const activeReview = store.getActiveReview(payload.repoPath, payload.prId)
      const workflow = new PRWorkflow(pr, activeReview)
      if (!workflow.allowsComments()) {
        return { error: PRWorkflow.commentDeniedReason(workflow.phase) }
      }
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

  ipcMain.handle('comments:delete', (_e, repoPath: string, prId: string, reviewId: string, commentId: string) => {
    try {
      const review = store.getReview(repoPath, prId, reviewId)
      if (review.status !== 'in_progress') {
        return { error: 'Comments can only be deleted from in-progress reviews' }
      }
      return store.deleteComment(repoPath, prId, reviewId, commentId)
    } catch (err) {
      return { error: (err as Error).message }
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
      const activeReview = store.getActiveReview(repoPath, prId)
      const workflow = new PRWorkflow(pr, activeReview)

      if (!workflow.allowsNewReview() && activeReview !== null) {
        return { error: PRWorkflow.newReviewDeniedReason(workflow.phase) }
      }

      const baseSha = await resolveSha(repoPath, pr.base_branch)
      const compareSha = await resolveSha(repoPath, pr.compare_branch)
      const diff = await getDiff(repoPath, baseSha, compareSha)

      // Return the in_progress review if one already exists rather than creating a duplicate
      if (activeReview?.status === 'in_progress') {
        const allReviewsA = store.listReviews(repoPath, prId).slice().reverse()
        const countsA: Record<string, number> = {}
        for (let i = 0; i < allReviewsA.length; i++) {
          const r = allReviewsA[i]
          if (r.status === 'complete') {
            const toSha = allReviewsA[i + 1]?.compare_sha ?? compareSha
            countsA[r.id] = await countCommitsBetween(repoPath, r.compare_sha, toSha)
          }
        }
        return { pr, diff, review: activeReview, reviews: allReviewsA, reviewCommitCounts: countsA, isStale: false }
      }

      const review = store.createReview(repoPath, prId, { base_sha: baseSha, compare_sha: compareSha })
      const allReviewsB = store.listReviews(repoPath, prId).slice().reverse()
      return { pr, diff, review, reviews: allReviewsB, reviewCommitCounts: {}, isStale: false }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
}

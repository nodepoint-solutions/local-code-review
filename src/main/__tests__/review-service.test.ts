// src/main/__tests__/review-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ReviewStore } from '../../shared/review-store'
import { resolveReviewComment, reopenSubmittedReview } from '../services/review-service'
import type { ReviewFile } from '../../shared/review-store'

function isError(result: ReviewFile | { error: string }): result is { error: string } {
  return 'error' in result
}

describe('review-service', () => {
  let store: ReviewStore
  let repoPath: string
  let prId: string
  let reviewId: string
  let commentId: string

  beforeEach(() => {
    store = new ReviewStore()
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'review-service-test-'))
    fs.mkdirSync(path.join(repoPath, '.git'))
    prId = store.createPR(repoPath, {
      title: 'Test PR',
      description: null,
      base_branch: 'main',
      compare_branch: 'feature/x',
    }).id
    reviewId = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    }).id
    const review = store.addComment(repoPath, prId, reviewId, {
      file: 'src/foo.ts',
      start_line: 3,
      end_line: 3,
      side: 'right',
      body: 'needs a guard',
      context: [],
    })
    commentId = review.comments[0].id
  })

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true })
  })

  describe('resolveReviewComment', () => {
    it('rejects resolving while the review is still being written', () => {
      const result = resolveReviewComment(store, repoPath, prId, reviewId, commentId, 'resolved')
      expect(isError(result)).toBe(true)
    })

    it('resolves a comment on a submitted review as the reviewer', () => {
      store.submitReview(repoPath, prId, reviewId)
      const result = resolveReviewComment(store, repoPath, prId, reviewId, commentId, 'resolved')
      expect(isError(result)).toBe(false)
      const comment = (result as ReviewFile).comments[0]
      expect(comment.status).toBe('resolved')
      expect(comment.resolution?.resolved_by).toBe('reviewer')
      expect(comment.resolution?.comment).toBe('Marked as resolved by the reviewer.')
    })

    it("records a won't-fix with the reviewer's note", () => {
      store.submitReview(repoPath, prId, reviewId)
      const result = resolveReviewComment(
        store,
        repoPath,
        prId,
        reviewId,
        commentId,
        'wont_fix',
        'Out of scope for this PR.'
      )
      const comment = (result as ReviewFile).comments[0]
      expect(comment.status).toBe('wont_fix')
      expect(comment.resolution?.comment).toBe('Out of scope for this PR.')
    })

    it('still allows resolving while an agent is assigned', () => {
      store.submitReview(repoPath, prId, reviewId)
      store.assignPR(repoPath, prId, 'claude')
      const result = resolveReviewComment(store, repoPath, prId, reviewId, commentId, 'resolved')
      expect(isError(result)).toBe(false)
    })
  })

  describe('reopenSubmittedReview', () => {
    it('returns a submitted review to editing when no agent is assigned', () => {
      store.submitReview(repoPath, prId, reviewId)
      const result = reopenSubmittedReview(store, repoPath, prId, reviewId)
      expect(isError(result)).toBe(false)
      expect((result as ReviewFile).status).toBe('in_progress')
      expect((result as ReviewFile).submitted_at).toBeNull()
    })

    it('refuses while an agent is assigned, and says why', () => {
      store.submitReview(repoPath, prId, reviewId)
      store.assignPR(repoPath, prId, 'claude')
      const result = reopenSubmittedReview(store, repoPath, prId, reviewId)
      expect(isError(result)).toBe(true)
      expect((result as { error: string }).error).toMatch(/unassign/i)
    })

    it('refuses for a review that has not been submitted', () => {
      const result = reopenSubmittedReview(store, repoPath, prId, reviewId)
      expect(isError(result)).toBe(true)
    })
  })
})

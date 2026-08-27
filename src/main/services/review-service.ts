// src/main/services/review-service.ts
//
// Reviewer-driven review mutations, extracted from the IPC layer so the
// workflow gating is testable against the on-disk review store.
import { PRWorkflow } from '../../shared/pr-workflow'
import type { ReviewStore, ReviewFile } from '../../shared/review-store'

export type ResolveOutcome = 'resolved' | 'wont_fix'

/**
 * Marks a comment resolved or won't-fix on the reviewer's behalf. Allowed only
 * once the review is submitted, so the reviewer can finish a cycle without an
 * agent.
 */
export function resolveReviewComment(
  store: ReviewStore,
  repoPath: string,
  prId: string,
  reviewId: string,
  commentId: string,
  status: ResolveOutcome,
  note?: string
): ReviewFile | { error: string } {
  const pr = store.getPR(repoPath, prId)
  const activeReview = store.getActiveReview(repoPath, prId)
  const workflow = new PRWorkflow(pr, activeReview)
  if (!workflow.allowsManualResolve()) {
    return { error: 'Comments can be resolved once the review has been submitted.' }
  }
  return store.resolveComment(repoPath, prId, reviewId, commentId, status, {
    comment:
      note?.trim() ||
      (status === 'resolved' ? 'Marked as resolved by the reviewer.' : 'Declined by the reviewer.'),
    resolved_by: 'reviewer',
    resolved_at: new Date().toISOString(),
  })
}

/** Returns a submitted review to editing while no fix has started. */
export function reopenSubmittedReview(
  store: ReviewStore,
  repoPath: string,
  prId: string,
  reviewId: string
): ReviewFile | { error: string } {
  const pr = store.getPR(repoPath, prId)
  const activeReview = store.getActiveReview(repoPath, prId)
  const workflow = new PRWorkflow(pr, activeReview)
  if (!workflow.allowsReopenReview()) {
    return {
      error:
        activeReview?.fix_started_at != null
          ? 'The review is being fixed. Wait for the fix session to end before returning it to editing.'
          : 'Only a submitted review can be returned to editing.',
    }
  }
  return store.reopenReview(repoPath, prId, reviewId)
}

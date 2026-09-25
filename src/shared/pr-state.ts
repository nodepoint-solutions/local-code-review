// src/shared/pr-state.ts
//
// PR state as the reviewer sees it: the workflow phase and the open comment
// count. The app's PR list and the MCP server both read it from here, so an
// agent and the list chip always describe the same phase.
import { PRWorkflow } from './pr-workflow'
import type { PRFile, ReviewFile, ReviewStore } from './review-store'
import type { PRListItem } from './types'

// Same active-review selection as getPrDetail: an in-progress review wins,
// then a submitted one. A complete review is history, not the active round.
function activeReview(reviews: ReviewFile[]): ReviewFile | null {
  return (
    reviews.find((r) => r.status === 'in_progress') ??
    reviews.find((r) => r.status === 'submitted') ??
    null
  )
}

function withState(store: ReviewStore, repoPath: string, pr: PRFile): PRListItem {
  const reviews = store.listReviews(repoPath, pr.id)
  const active = activeReview(reviews)
  const workflow = new PRWorkflow(pr, active, reviews)
  const openComments = active
    ? active.comments.filter((c) => !c.is_stale && c.status === 'open').length
    : 0
  return { ...pr, workflowPhase: workflow.phase, openComments }
}

/** PRs with the review state the list surfaces: workflow phase and open-comment count. */
export function listPrsWithState(store: ReviewStore, repoPath: string): PRListItem[] {
  return store.listPRs(repoPath).map((pr) => withState(store, repoPath, pr))
}

export function prWithState(store: ReviewStore, repoPath: string, prId: string): PRListItem {
  return withState(store, repoPath, store.getPR(repoPath, prId))
}

export function prWorkflow(store: ReviewStore, repoPath: string, prId: string): PRWorkflow {
  const reviews = store.listReviews(repoPath, prId)
  return new PRWorkflow(store.getPR(repoPath, prId), activeReview(reviews), reviews)
}

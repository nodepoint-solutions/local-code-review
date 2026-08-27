// src/main/services/pr-service.ts
//
// PR read-model assembly, extracted from the IPC layer so the behaviour is
// testable against a real git fixture and an on-disk review store. The IPC
// handlers stay thin: guard, delegate, map errors.
import { PRWorkflow } from '../../shared/pr-workflow'
import { resolveSha, fetchOrigin, isMergedIntoRemote } from '../git/branches'
import { getDiff } from '../git/diff-parser'
import { listCommits, buildReviewCommitCounts } from '../git/commits'
import { collectStaleRanges } from '../git/stale'
import type { ReviewStore } from '../../shared/review-store'
import type { Commit, PrDetail, PRListItem } from '../../shared/types'

const fetchCache = new Map<string, number>()
const FETCH_TTL_MS = 30_000

/** PRs with the review state the list surfaces: workflow phase and open-comment count. */
export function listPrsWithState(store: ReviewStore, repoPath: string): PRListItem[] {
  // Same active-review selection as getPrDetail, so the list chip and the PR
  // screen always describe the same phase
  return store.listPRs(repoPath).map((pr) => {
    const reviews = store.listReviews(repoPath, pr.id)
    const active =
      reviews.find((r) => r.status === 'in_progress') ??
      reviews.find((r) => r.status === 'submitted') ??
      null
    const workflow = new PRWorkflow(pr, active, reviews)
    const openComments = active
      ? active.comments.filter((c) => !c.is_stale && c.status === 'open').length
      : 0
    return { ...pr, workflowPhase: workflow.phase, openComments }
  })
}

/**
 * Commits on the PR's branch range. Branch refs rather than review SHAs, so
 * the list works before any review exists and keeps showing fix commits
 * pushed after submission.
 */
export async function listPrCommits(
  store: ReviewStore,
  repoPath: string,
  prId: string
): Promise<Commit[]> {
  const pr = store.getPR(repoPath, prId)
  try {
    return await listCommits(repoPath, pr.base_branch, pr.compare_branch)
  } catch {
    // Compare branch deleted post-merge — fall back to the remote ref
    return await listCommits(repoPath, pr.base_branch, `origin/${pr.compare_branch}`)
  }
}

/** Full PR detail: fresh diff, active review, staleness, history, commit counts. */
export async function getPrDetail(
  store: ReviewStore,
  repoPath: string,
  prId: string
): Promise<PrDetail> {
  let pr = store.getPR(repoPath, prId)

  // Fetch origin for open PRs so remote refs are available for merge detection
  // and as a fallback if the local compare branch has been deleted post-merge
  if (pr.status === 'open') {
    const lastFetch = fetchCache.get(repoPath) ?? 0
    if (Date.now() - lastFetch > FETCH_TTL_MS) {
      await fetchOrigin(repoPath)
      fetchCache.set(repoPath, Date.now())
    }
  }

  const currentBaseSha = await resolveSha(repoPath, pr.base_branch)
  // Try local compare branch first; fall back to remote ref if deleted post-merge
  let currentCompareSha: string
  try {
    currentCompareSha = await resolveSha(repoPath, pr.compare_branch)
  } catch {
    currentCompareSha = await resolveSha(repoPath, `origin/${pr.compare_branch}`)
  }

  // Auto-close if compare branch has been merged into the remote base
  if (pr.status === 'open') {
    const merged = await isMergedIntoRemote(repoPath, currentCompareSha, pr.base_branch)
    if (merged) {
      pr = store.mergePR(repoPath, pr.id)
    }
  }

  const reviews = store.listReviews(repoPath, prId)
  // Use an in-progress or submitted review as the active review.
  const review =
    store.getInProgressReview(repoPath, prId) ??
    reviews.find((r) => r.status === 'submitted') ??
    null

  // Always diff against current branch HEADs so the view shows latest code
  const diff = await getDiff(repoPath, currentBaseSha, currentCompareSha)

  // When the branch has advanced since the review was started, detect newly
  // stale comments. In-progress reviews also get their SHAs re-pinned so the
  // next load is cheaper; submitted reviews keep their original SHAs — those
  // record what was reviewed, and commit counts are derived from them.
  let activeReview = review
  let isStale = false
  if (review !== null) {
    const shasChanged =
      currentBaseSha !== review.base_sha || currentCompareSha !== review.compare_sha
    if (shasChanged) {
      isStale = true
      for (const [file, ranges] of collectStaleRanges(diff, review.comments)) {
        store.markStale(repoPath, prId, review.id, file, ranges)
      }
      if (review.status === 'in_progress') {
        store.updateReviewShas(repoPath, prId, review.id, currentBaseSha, currentCompareSha)
      }
      activeReview = store.getReview(repoPath, prId, review.id)
    }

    // Auto-complete a submitted review once all non-stale comments are resolved/wont_fix
    if (activeReview !== null && activeReview.status === 'submitted') {
      const nonStale = activeReview.comments.filter((c) => !c.is_stale)
      if (
        nonStale.length > 0 &&
        nonStale.every((c) => c.status === 'resolved' || c.status === 'wont_fix')
      ) {
        store.completeReview(repoPath, prId, activeReview.id)
        // Auto-unassign the agent now that the review cycle is complete
        if (pr.assignee !== null) {
          pr = store.assignPR(repoPath, prId, null)
        }
        activeReview = null
      }
    }
  }

  const allReviews = store.listReviews(repoPath, prId).slice().reverse()
  const reviewCommitCounts = await buildReviewCommitCounts(repoPath, allReviews, currentCompareSha)
  return { pr, diff, review: activeReview, reviews: allReviews, reviewCommitCounts, isStale }
}

/** Refresh: re-diff, re-mark stale comments, and report staleness for the active review. */
export async function refreshPrDetail(
  store: ReviewStore,
  repoPath: string,
  prId: string
): Promise<PrDetail> {
  const pr = store.getPR(repoPath, prId)
  const baseSha = await resolveSha(repoPath, pr.base_branch)
  const compareSha = await resolveSha(repoPath, pr.compare_branch)

  const reviews = store.listReviews(repoPath, prId)
  const inProgress = store.getInProgressReview(repoPath, prId)

  const diff = await getDiff(repoPath, baseSha, compareSha)
  const activeReview = inProgress ?? reviews.find((r) => r.status === 'submitted') ?? null

  if (activeReview) {
    for (const [file, ranges] of collectStaleRanges(diff, activeReview.comments)) {
      store.markStale(repoPath, prId, activeReview.id, file, ranges)
    }
    if (inProgress) {
      store.updateReviewShas(repoPath, prId, inProgress.id, baseSha, compareSha)
    }
  }

  const freshReview = activeReview ? store.getReview(repoPath, prId, activeReview.id) : null
  const allReviews = store.listReviews(repoPath, prId).slice().reverse()
  const counts = await buildReviewCommitCounts(repoPath, allReviews, compareSha)
  const isStale =
    freshReview !== null &&
    freshReview.status !== 'in_progress' &&
    (baseSha !== freshReview.base_sha || compareSha !== freshReview.compare_sha)
  return {
    pr,
    diff,
    review: freshReview,
    reviews: allReviews,
    reviewCommitCounts: counts,
    isStale,
  }
}

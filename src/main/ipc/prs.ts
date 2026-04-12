// src/main/ipc/prs.ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { PRWorkflow } from '../../shared/pr-workflow'
import { deleteRepo } from '../db/repos'
import {
  listBranches, resolveSha,
  getRemoteOriginUrl, parseGithubRemote,
  isWorkingDirClean, isBranchPushed, pushBranch,
  fetchOrigin, isMergedIntoRemote,
} from '../git/branches'
import { getDiff } from '../git/diff-parser'
import { listCommits, getCommitDiff, buildReviewCommitCounts } from '../git/commits'
import type { CreatePrPayload, PrDetail } from '../../shared/types'
import { assertKnownRepo } from './_guard'

const store = new ReviewStore()

export function registerPrHandlers(db: Database.Database): void {
  const fetchCache = new Map<string, number>()
  const FETCH_TTL_MS = 30_000

  ipcMain.handle('prs:list', (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return store.listPRs(repoPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('branches:list', async (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return await listBranches(repoPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('prs:create', async (_e, payload: CreatePrPayload) => {
    try {
      assertKnownRepo(db, payload.repoPath)
      await resolveSha(payload.repoPath, payload.baseBranch)
      await resolveSha(payload.repoPath, payload.compareBranch)
      return store.createPR(payload.repoPath, {
        title: payload.title,
        description: payload.description,
        base_branch: payload.baseBranch,
        compare_branch: payload.compareBranch,
      })
      // SHAs are resolved but stored on the first review, not on the PR itself
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:get', async (_e, repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> => {
    try {
      assertKnownRepo(db, repoPath)
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
        reviews.find(r => r.status === 'submitted') ??
        null

      // Always diff against current branch HEADs so the view shows latest code
      const diff = await getDiff(repoPath, currentBaseSha, currentCompareSha)

      // When the branch has advanced since the review was started, detect newly
      // stale comments and persist the updated SHAs so the next load is cheaper.
      let activeReview = review
      if (review !== null) {
        const shasChanged = currentBaseSha !== review.base_sha || currentCompareSha !== review.compare_sha
        if (shasChanged && review.status === 'in_progress') {
          for (const file of diff) {
            const validLineNums = new Set(file.lines.map((l) => l.diffLineNumber))
            const staleRanges = review.comments
              .filter((c) => c.file === file.newPath && !c.is_stale && (!validLineNums.has(c.start_line) || !validLineNums.has(c.end_line)))
              .map((c) => ({ startLine: c.start_line, endLine: c.end_line }))
            if (staleRanges.length > 0) {
              store.markStale(repoPath, prId, review.id, file.newPath, staleRanges)
            }
          }
          store.updateReviewShas(repoPath, prId, review.id, currentBaseSha, currentCompareSha)
          activeReview = store.getReview(repoPath, prId, review.id)
        }

        // Auto-complete a submitted review once all non-stale comments are resolved/wont_fix
        if (activeReview !== null && activeReview.status === 'submitted') {
          const nonStale = activeReview.comments.filter((c) => !c.is_stale)
          if (nonStale.length > 0 && nonStale.every((c) => c.status === 'resolved' || c.status === 'wont_fix')) {
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
      return { pr, diff, review: activeReview, reviews: allReviews, reviewCommitCounts, isStale: false }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:refresh', async (_e, repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> => {
    try {
      assertKnownRepo(db, repoPath)
      const pr = store.getPR(repoPath, prId)
      const baseSha = await resolveSha(repoPath, pr.base_branch)
      const compareSha = await resolveSha(repoPath, pr.compare_branch)

      const reviews = store.listReviews(repoPath, prId)
      const inProgress = store.getInProgressReview(repoPath, prId)

      if (inProgress) {
        const diff = await getDiff(repoPath, baseSha, compareSha)

        for (const file of diff) {
          const validLineNums = new Set(file.lines.map((l) => l.diffLineNumber))
          const staleRanges = inProgress.comments
            .filter((c) => c.file === file.newPath && (!validLineNums.has(c.start_line) || !validLineNums.has(c.end_line)))
            .map((c) => ({ startLine: c.start_line, endLine: c.end_line }))
          if (staleRanges.length > 0) {
            store.markStale(repoPath, prId, inProgress.id, file.newPath, staleRanges)
          }
        }

        const freshReview = store.getReview(repoPath, prId, inProgress.id)
        const allReviews1 = store.listReviews(repoPath, prId).slice().reverse()
        const counts1 = await buildReviewCommitCounts(repoPath, allReviews1, compareSha)
        return { pr, diff, review: freshReview, reviews: allReviews1, reviewCommitCounts: counts1, isStale: false }
      }

      // No in-progress review — use submitted review if present, or auto-create
      // a new in-progress one if all existing reviews are complete.
      const diff = await getDiff(repoPath, baseSha, compareSha)
      const latestReview = reviews.find(r => r.status === 'submitted') ?? null
      const allReviews2 = reviews.slice().reverse()
      const counts2 = await buildReviewCommitCounts(repoPath, allReviews2, compareSha)
      return { pr, diff, review: latestReview, reviews: allReviews2, reviewCommitCounts: counts2, isStale: false }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('commits:list', async (_e, prId: string, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      const reviews = store.listReviews(repoPath, prId)
      const latest = reviews[0]
      if (!latest) return []
      return await listCommits(repoPath, latest.base_sha, latest.compare_sha)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:update', (_e, repoPath: string, prId: string, changes: { title?: string; description?: string | null }) => {
    try {
      assertKnownRepo(db, repoPath)
      return store.updatePR(repoPath, prId, changes)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:close', (_e, repoPath: string, prId: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return store.updatePRStatus(repoPath, prId, 'closed')
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:reopen', (_e, repoPath: string, prId: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return store.updatePRStatus(repoPath, prId, 'open')
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:delete', (_e, repoPath: string, prId: string) => {
    try {
      assertKnownRepo(db, repoPath)
      store.deletePR(repoPath, prId)
      const openRemaining = store.listPRs(repoPath).filter((pr) => pr.status === 'open')
      if (openRemaining.length === 0) {
        deleteRepo(db, repoPath)
      }
      return {}
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('commits:show', async (_e, repoPath: string, hash: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return { diff: await getCommitDiff(repoPath, hash) }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:assign', (_e, repoPath: string, prId: string, assignee: 'claude' | 'vscode' | null) => {
    try {
      assertKnownRepo(db, repoPath)
      if (assignee !== null) {
        const pr = store.getPR(repoPath, prId)
        const workflow = new PRWorkflow(pr, store.getActiveReview(repoPath, prId))
        if (!workflow.allowsAssignee()) {
          return { error: PRWorkflow.assignDeniedReason(workflow.phase) }
        }
      }
      return store.assignPR(repoPath, prId, assignee)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('git:diff-at-shas', async (_e, repoPath: string, baseSha: string, compareSha: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return await getDiff(repoPath, baseSha, compareSha)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('git:remote-info', async (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      const url = await getRemoteOriginUrl(repoPath)
      if (!url) return null
      return parseGithubRemote(url)
    } catch {
      return null
    }
  })

  ipcMain.handle('git:working-dir-clean', async (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return { clean: await isWorkingDirClean(repoPath) }
    } catch {
      return { clean: false }
    }
  })

  ipcMain.handle('git:branch-pushed', async (_e, repoPath: string, branch: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return { pushed: await isBranchPushed(repoPath, branch) }
    } catch {
      return { pushed: false }
    }
  })

  ipcMain.handle('git:push-branch', async (_e, repoPath: string, branch: string) => {
    try {
      assertKnownRepo(db, repoPath)
      await pushBranch(repoPath, branch)
      return {}
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
}

// src/main/__tests__/pr-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ReviewStore } from '../../shared/review-store'
import {
  getPrDetail,
  refreshPrDetail,
  listPrsWithState,
  listPrCommits,
} from '../services/pr-service'
import { makeGitRepo, advanceFeatureBranch, shaOf, type GitFixture } from './helpers/git-fixture'

const NEVER_A_DIFF_LINE = 999

describe('pr-service', () => {
  let fixture: GitFixture
  let repoPath: string
  let store: ReviewStore
  let prId: string

  beforeEach(() => {
    fixture = makeGitRepo()
    repoPath = fixture.repoPath
    store = new ReviewStore()
    prId = store.createPR(repoPath, {
      title: 'Change output',
      description: null,
      base_branch: 'main',
      compare_branch: 'feature/change',
    }).id
  })

  afterEach(() => {
    fixture.cleanup()
  })

  function createPinnedReview(): string {
    return store.createReview(repoPath, prId, {
      base_sha: shaOf(repoPath, 'main'),
      compare_sha: shaOf(repoPath, 'feature/change'),
    }).id
  }

  function addComment(reviewId: string, endLine: number): string {
    const review = store.addComment(repoPath, prId, reviewId, {
      file: 'app.js',
      start_line: endLine,
      end_line: endLine,
      side: 'right',
      body: 'note',
      context: [],
    })
    return review.comments[review.comments.length - 1].id
  }

  describe('listPrCommits', () => {
    it('lists the branch commits before any review exists', async () => {
      const commits = await listPrCommits(store, repoPath, prId)
      expect(commits.map((c) => c.subject)).toEqual([
        'feat: add extra module',
        'feat: change output',
      ])
    })

    it('keeps showing commits pushed after a review was pinned', async () => {
      createPinnedReview()
      advanceFeatureBranch(repoPath)
      const commits = await listPrCommits(store, repoPath, prId)
      expect(commits).toHaveLength(3)
      expect(commits[0].subject).toBe('chore: move the branch forward')
    })
  })

  describe('listPrsWithState', () => {
    it('reports awaiting_review with no comments for a fresh PR', () => {
      const [item] = listPrsWithState(store, repoPath)
      expect(item.workflowPhase).toBe('awaiting_review')
      expect(item.openComments).toBe(0)
    })

    it('reports reviewing while a review is being written', () => {
      const reviewId = createPinnedReview()
      addComment(reviewId, 2)
      const [item] = listPrsWithState(store, repoPath)
      expect(item.workflowPhase).toBe('reviewing')
      expect(item.openComments).toBe(1)
    })

    it('reports reviewed with the open-comment count after submission', () => {
      const reviewId = createPinnedReview()
      addComment(reviewId, 2)
      addComment(reviewId, 3)
      store.submitReview(repoPath, prId, reviewId)
      const [item] = listPrsWithState(store, repoPath)
      expect(item.workflowPhase).toBe('reviewed')
      expect(item.openComments).toBe(2)
    })

    it('excludes resolved comments from the open count', () => {
      const reviewId = createPinnedReview()
      const commentId = addComment(reviewId, 2)
      addComment(reviewId, 3)
      store.submitReview(repoPath, prId, reviewId)
      store.resolveComment(repoPath, prId, reviewId, commentId, 'resolved', {
        comment: 'done',
        resolved_by: 'reviewer',
        resolved_at: new Date().toISOString(),
      })
      const [item] = listPrsWithState(store, repoPath)
      expect(item.openComments).toBe(1)
    })
  })

  describe('getPrDetail', () => {
    it('returns a fresh diff and no staleness for a PR without reviews', async () => {
      const detail = await getPrDetail(store, repoPath, prId)
      expect(detail.isStale).toBe(false)
      expect(detail.review).toBeNull()
      expect(detail.diff.length).toBeGreaterThan(0)
      expect(detail.pr.id).toBe(prId)
    })

    it('re-pins an in-progress review and reports staleness when the branch moves', async () => {
      const reviewId = createPinnedReview()
      addComment(reviewId, NEVER_A_DIFF_LINE)
      advanceFeatureBranch(repoPath)

      const detail = await getPrDetail(store, repoPath, prId)

      expect(detail.isStale).toBe(true)
      const review = store.getReview(repoPath, prId, reviewId)
      expect(review.compare_sha).toBe(shaOf(repoPath, 'feature/change'))
      expect(review.comments[0].is_stale).toBe(true)
    })

    it('flags stale comments on a submitted review but keeps its pinned SHAs', async () => {
      const reviewId = createPinnedReview()
      addComment(reviewId, NEVER_A_DIFF_LINE)
      store.submitReview(repoPath, prId, reviewId)
      const pinnedSha = shaOf(repoPath, 'feature/change')
      advanceFeatureBranch(repoPath)

      const detail = await getPrDetail(store, repoPath, prId)

      expect(detail.isStale).toBe(true)
      const review = store.getReview(repoPath, prId, reviewId)
      expect(review.compare_sha).toBe(pinnedSha)
      expect(review.comments[0].is_stale).toBe(true)
    })

    it('auto-completes a submitted review once every comment is addressed', async () => {
      const reviewId = createPinnedReview()
      const commentId = addComment(reviewId, 2)
      store.submitReview(repoPath, prId, reviewId)
      store.assignPR(repoPath, prId, 'claude')
      store.resolveComment(repoPath, prId, reviewId, commentId, 'resolved', {
        comment: 'done',
        resolved_by: 'agent',
        resolved_at: new Date().toISOString(),
      })

      const detail = await getPrDetail(store, repoPath, prId)

      expect(detail.review).toBeNull()
      expect(detail.pr.assignee).toBeNull()
      expect(store.getReview(repoPath, prId, reviewId).status).toBe('complete')
    })
  })

  describe('refreshPrDetail', () => {
    it('reports staleness and flags comments for a submitted review', async () => {
      const reviewId = createPinnedReview()
      addComment(reviewId, NEVER_A_DIFF_LINE)
      store.submitReview(repoPath, prId, reviewId)
      advanceFeatureBranch(repoPath)

      const detail = await refreshPrDetail(store, repoPath, prId)

      expect(detail.isStale).toBe(true)
      expect(store.getReview(repoPath, prId, reviewId).comments[0].is_stale).toBe(true)
    })

    it('re-pins an in-progress review and reports it as current', async () => {
      const reviewId = createPinnedReview()
      advanceFeatureBranch(repoPath)

      const detail = await refreshPrDetail(store, repoPath, prId)

      expect(detail.isStale).toBe(false)
      expect(store.getReview(repoPath, prId, reviewId).compare_sha).toBe(
        shaOf(repoPath, 'feature/change')
      )
    })
  })
})

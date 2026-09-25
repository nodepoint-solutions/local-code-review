// src/main/__tests__/pr-state.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ReviewStore } from '../../shared/review-store'
import { listPrsWithState, prWithState, prWorkflow } from '../../shared/pr-state'
import { makeGitRepo, shaOf, type GitFixture } from './helpers/git-fixture'

describe('pr-state', () => {
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

  describe('prWithState', () => {
    it('gives one PR the same state the list gives it', () => {
      const reviewId = createPinnedReview()
      addComment(reviewId, 2)
      store.submitReview(repoPath, prId, reviewId)
      expect(prWithState(store, repoPath, prId)).toEqual(listPrsWithState(store, repoPath)[0])
    })
  })

  describe('prWorkflow', () => {
    it('derives the phase from the active review', () => {
      const reviewId = createPinnedReview()
      store.submitReview(repoPath, prId, reviewId)
      store.startFix(repoPath, prId, reviewId)
      expect(prWorkflow(store, repoPath, prId).phase).toBe('in_fix')
    })
  })
})

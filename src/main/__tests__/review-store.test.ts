// src/main/__tests__/review-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ReviewStore, InvalidReviewFileError } from '../../shared/review-store'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'review-store-test-'))
}

describe('ReviewStore', () => {
  let store: ReviewStore
  let repoPath: string

  beforeEach(() => {
    store = new ReviewStore()
    repoPath = makeTmpDir()
    // Simulate a git repo directory
    fs.mkdirSync(path.join(repoPath, '.git'))
  })

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true })
  })

  describe('PRs', () => {
    it('creates a PR and lists it', () => {
      const pr = store.createPR(repoPath, {
        title: 'Add auth',
        description: null,
        base_branch: 'main',
        compare_branch: 'feature/auth',
      })
      expect(pr.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(pr.title).toBe('Add auth')
      expect(pr.status).toBe('open')

      const prs = store.listPRs(repoPath)
      expect(prs).toHaveLength(1)
      expect(prs[0].id).toBe(pr.id)
    })

    it('getPR reads from disk', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const fetched = store.getPR(repoPath, pr.id)
      expect(fetched.id).toBe(pr.id)
      expect(fetched.title).toBe('T')
    })

    it('updatePRStatus changes status and updated_at', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const updated = store.updatePRStatus(repoPath, pr.id, 'closed')
      expect(updated.status).toBe('closed')
      expect(updated.updated_at).not.toBe(pr.updated_at)
    })

    it('listPRs returns empty array when .reviews/ is absent', () => {
      expect(store.listPRs(repoPath)).toHaveLength(0)
    })

    it('listPRs silently skips corrupt files', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const indexPath = path.join(repoPath, '.reviews', pr.id, 'index.json')
      fs.writeFileSync(indexPath, 'not json')
      expect(store.listPRs(repoPath)).toHaveLength(0)
    })

    it('createPR sets assignee to null by default', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      expect(pr.assignee).toBeNull()
      expect(pr.assigned_at).toBeNull()
    })

    it('assignPR sets and clears assignee', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const assigned = store.assignPR(repoPath, pr.id, 'claude')
      expect(assigned.assignee).toBe('claude')
      expect(assigned.assigned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      const cleared = store.assignPR(repoPath, pr.id, null)
      expect(cleared.assignee).toBeNull()
      expect(cleared.assigned_at).toBeNull()
    })

    it('existing index.json without assignee fields parses correctly', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      // Write a file without the new fields (simulating a pre-migration file)
      const indexPath = path.join(repoPath, '.reviews', pr.id, 'index.json')
      const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      delete raw.assignee
      delete raw.assigned_at
      fs.writeFileSync(indexPath, JSON.stringify(raw))
      const fetched = store.getPR(repoPath, pr.id)
      expect(fetched.assignee).toBeNull()
      expect(fetched.assigned_at).toBeNull()
    })
  })

  describe('Reviews', () => {
    let prId: string

    beforeEach(() => {
      prId = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' }).id
    })

    it('creates a review and lists it', () => {
      const review = store.createReview(repoPath, prId, { base_sha: 'abc', compare_sha: 'def' })
      expect(review.status).toBe('in_progress')
      expect(review.comments).toHaveLength(0)

      const reviews = store.listReviews(repoPath, prId)
      expect(reviews).toHaveLength(1)
      expect(reviews[0].id).toBe(review.id)
    })

    it('getOrCreateInProgressReview returns existing review on second call', () => {
      const r1 = store.getOrCreateInProgressReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      const r2 = store.getOrCreateInProgressReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      expect(r1.id).toBe(r2.id)
    })

    it('submitReview sets status and submitted_at', () => {
      const review = store.createReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      const submitted = store.submitReview(repoPath, prId, review.id)
      expect(submitted.status).toBe('submitted')
      expect(submitted.submitted_at).not.toBeNull()
    })

    it('allows multiple review rounds per PR', () => {
      store.createReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      store.createReview(repoPath, prId, { base_sha: 'c', compare_sha: 'd' })
      expect(store.listReviews(repoPath, prId)).toHaveLength(2)
    })
  })

  describe('Comments', () => {
    let prId: string
    let reviewId: string

    beforeEach(() => {
      prId = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' }).id
      reviewId = store.createReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' }).id
    })

    it('adds a comment and assigns sequential ID', () => {
      const updated = store.addComment(repoPath, prId, reviewId, {
        file: 'src/auth.ts',
        start_line: 10,
        end_line: 12,
        side: 'right',
        body: 'Use httpOnly cookie',
        context: [{ line: 10, type: 'added', content: 'res.send(token)' }],
      })
      expect(updated.comments).toHaveLength(1)
      expect(updated.comments[0].id).toBe('RVW-001')
      expect(updated.comments[0].status).toBe('open')
      expect(updated.comments[0].resolution).toBeNull()
    })

    it('assigns sequential IDs for multiple comments', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 1, end_line: 1, side: 'right', body: 'c1', context: [] })
      const updated = store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 2, end_line: 2, side: 'right', body: 'c2', context: [] })
      expect(updated.comments[1].id).toBe('RVW-002')
    })

    it('resolveComment marks as resolved with resolution', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 1, end_line: 1, side: 'right', body: 'Fix me', context: [] })
      const updated = store.resolveComment(repoPath, prId, reviewId, 'RVW-001', 'resolved', {
        comment: 'Fixed by using httpOnly',
        resolved_by: 'claude',
        resolved_at: new Date().toISOString(),
      })
      expect(updated.comments[0].status).toBe('resolved')
      expect(updated.comments[0].resolution?.comment).toBe('Fixed by using httpOnly')
    })

    it('resolveComment supports wont_fix status', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 1, end_line: 1, side: 'right', body: 'Fix me', context: [] })
      const updated = store.resolveComment(repoPath, prId, reviewId, 'RVW-001', 'wont_fix', {
        comment: 'Out of scope for this PR',
        resolved_by: 'claude',
        resolved_at: new Date().toISOString(),
      })
      expect(updated.comments[0].status).toBe('wont_fix')
    })

    it('markStale marks comments whose line range overlaps stale ranges', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'src/a.ts', start_line: 5, end_line: 7, side: 'right', body: 'old', context: [] })
      store.markStale(repoPath, prId, reviewId, 'src/a.ts', [{ startLine: 5, endLine: 7 }])
      const review = store.getReview(repoPath, prId, reviewId)
      expect(review.comments[0].is_stale).toBe(true)
    })

    it('markStale does not affect comments on other files', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'src/b.ts', start_line: 5, end_line: 7, side: 'right', body: 'ok', context: [] })
      store.markStale(repoPath, prId, reviewId, 'src/a.ts', [{ startLine: 5, endLine: 7 }])
      const review = store.getReview(repoPath, prId, reviewId)
      expect(review.comments[0].is_stale).toBe(false)
    })
  })

  describe('InvalidReviewFileError', () => {
    it('getPR throws InvalidReviewFileError for corrupt file', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const indexPath = path.join(repoPath, '.reviews', pr.id, 'index.json')
      fs.writeFileSync(indexPath, '{"version":1,"id":"not-a-uuid"}')
      expect(() => store.getPR(repoPath, pr.id)).toThrow(InvalidReviewFileError)
    })
  })
})

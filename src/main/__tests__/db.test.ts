import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../db/schema'
import { insertRepo, listRepos, findRepoByPath } from '../db/repos'
import { insertPr, listPrs, getPr, updatePrShas } from '../db/prs'
import {
  getOrCreateInProgressReview,
  submitReview,
  addComment,
  listComments,
  markCommentsStale,
} from '../db/reviews'
import type { ContextLine } from '../../shared/types'

describe('database schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('creates all five tables', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('repositories')
    expect(names).toContain('pull_requests')
    expect(names).toContain('reviews')
    expect(names).toContain('comments')
    expect(names).toContain('comment_context')
  })

  it('enforces foreign key on pull_requests.repo_id', () => {
    db.pragma('foreign_keys = ON')
    expect(() => {
      db.prepare(`INSERT INTO pull_requests VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        'pr1', 'nonexistent-repo', 'title', null, 'main', 'feat', 'sha1', 'sha2', 'open',
        new Date().toISOString(), new Date().toISOString()
      )
    }).toThrow()
  })
})

describe('repos', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('inserts and retrieves a repo', () => {
    const repo = insertRepo(db, '/projects/my-app', 'my-app')
    const found = findRepoByPath(db, '/projects/my-app')
    expect(found).not.toBeNull()
    expect(found!.id).toBe(repo.id)
    expect(found!.name).toBe('my-app')
  })

  it('returns existing repo if path already registered', () => {
    const r1 = insertRepo(db, '/projects/my-app', 'my-app')
    const r2 = insertRepo(db, '/projects/my-app', 'my-app')
    expect(r1.id).toBe(r2.id)
  })

  it('lists all repos', () => {
    insertRepo(db, '/a', 'a')
    insertRepo(db, '/b', 'b')
    expect(listRepos(db)).toHaveLength(2)
  })
})

describe('pull_requests', () => {
  let db: Database.Database
  let repoId: string

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    const repo = insertRepo(db, '/projects/app', 'app')
    repoId = repo.id
  })

  it('inserts and retrieves a PR', () => {
    const pr = insertPr(db, {
      repoId,
      title: 'My PR',
      description: null,
      baseBranch: 'main',
      compareBranch: 'feat/thing',
      baseSha: 'aaa',
      compareSha: 'bbb',
    })
    const found = getPr(db, pr.id)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('My PR')
    expect(found!.base_sha).toBe('aaa')
  })

  it('lists PRs for a repo', () => {
    insertPr(db, { repoId, title: 'PR1', description: null, baseBranch: 'main', compareBranch: 'a', baseSha: 'x', compareSha: 'y' })
    insertPr(db, { repoId, title: 'PR2', description: null, baseBranch: 'main', compareBranch: 'b', baseSha: 'x', compareSha: 'z' })
    expect(listPrs(db, repoId)).toHaveLength(2)
  })

  it('updates SHAs on refresh', () => {
    const pr = insertPr(db, { repoId, title: 'PR', description: null, baseBranch: 'main', compareBranch: 'f', baseSha: 'old1', compareSha: 'old2' })
    updatePrShas(db, pr.id, 'new1', 'new2')
    const updated = getPr(db, pr.id)!
    expect(updated.base_sha).toBe('new1')
    expect(updated.compare_sha).toBe('new2')
  })
})

describe('reviews and comments', () => {
  let db: Database.Database
  let prId: string

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    const repo = insertRepo(db, '/projects/app', 'app')
    const pr = insertPr(db, { repoId: repo.id, title: 'PR', description: null, baseBranch: 'main', compareBranch: 'f', baseSha: 'x', compareSha: 'y' })
    prId = pr.id
  })

  it('creates a new in-progress review if none exists', () => {
    const review = getOrCreateInProgressReview(db, prId)
    expect(review.status).toBe('in_progress')
    expect(review.pr_id).toBe(prId)
  })

  it('returns the existing in-progress review on subsequent calls', () => {
    const r1 = getOrCreateInProgressReview(db, prId)
    const r2 = getOrCreateInProgressReview(db, prId)
    expect(r1.id).toBe(r2.id)
  })

  it('adds a comment with context and retrieves it', () => {
    const review = getOrCreateInProgressReview(db, prId)
    const ctx: ContextLine[] = [
      { line_number: 1, type: 'context', content: 'before' },
      { line_number: 2, type: 'added', content: 'the line' },
      { line_number: 3, type: 'context', content: 'after' },
    ]
    addComment(db, { reviewId: review.id, filePath: 'src/foo.ts', startLine: 2, endLine: 2, side: 'right', body: 'Fix this', contextLines: ctx })
    const comments = listComments(db, review.id)
    expect(comments).toHaveLength(1)
    expect(comments[0].body).toBe('Fix this')
    expect(comments[0].file_path).toBe('src/foo.ts')
  })

  it('submits a review', () => {
    const review = getOrCreateInProgressReview(db, prId)
    const submitted = submitReview(db, review.id)
    expect(submitted.status).toBe('submitted')
    expect(submitted.submitted_at).not.toBeNull()
  })

  it('marks comments as stale by line range', () => {
    const review = getOrCreateInProgressReview(db, prId)
    addComment(db, { reviewId: review.id, filePath: 'src/a.ts', startLine: 5, endLine: 7, side: 'right', body: 'old', contextLines: [] })
    markCommentsStale(db, review.id, 'src/a.ts', [{ startLine: 5, endLine: 7 }])
    const comments = listComments(db, review.id)
    expect(comments[0].is_stale).toBe(true)
  })
})

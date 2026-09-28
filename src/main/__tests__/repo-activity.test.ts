// src/main/__tests__/repo-activity.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { applySchema } from '../db/schema'
import { insertRepo } from '../db/repos'
import { ReviewStore } from '../../shared/review-store'
import { listRepoActivity } from '../services/repo-activity'

describe('listRepoActivity', () => {
  let db: Database.Database
  let store: ReviewStore
  let dirs: string[]

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    store = new ReviewStore()
    dirs = []
  })

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  })

  function makeRepo(name: string): { id: string; path: string } {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
    dirs.push(repoPath)
    return insertRepo(db, repoPath, name)
  }

  function openPr(repoPath: string, title: string): string {
    return store.createPR(repoPath, {
      title,
      description: null,
      base_branch: 'main',
      compare_branch: `feature/${title}`,
    }).id
  }

  function closedPr(repoPath: string, title: string): string {
    const id = openPr(repoPath, title)
    return store.updatePRStatus(repoPath, id, 'closed').updated_at
  }

  it('returns a repository whose PRs are all closed, with the latest PR update', () => {
    const repo = makeRepo('alpha')
    closedPr(repo.path, 'first')
    const latest = closedPr(repo.path, 'second')

    expect(listRepoActivity(db, store)).toEqual([
      expect.objectContaining({ id: repo.id, name: 'alpha', open_pr_count: 0, last_pr_at: latest }),
    ])
  })

  it('counts the open PRs of a repository', () => {
    const repo = makeRepo('alpha')
    closedPr(repo.path, 'done')
    openPr(repo.path, 'first')
    openPr(repo.path, 'second')

    expect(listRepoActivity(db, store)).toEqual([
      expect.objectContaining({ id: repo.id, open_pr_count: 2 }),
    ])
  })

  it('leaves out repositories without PRs', () => {
    makeRepo('alpha')

    expect(listRepoActivity(db, store)).toEqual([])
  })

  it('lists the repository with the most recent PR activity first', () => {
    const older = makeRepo('older')
    const newer = makeRepo('newer')
    closedPr(older.path, 'a')
    // Each status change moves updated_at forward, so newer ends up later even
    // when both repositories are written in the same millisecond
    const id = openPr(newer.path, 'b')
    store.updatePRStatus(newer.path, id, 'closed')
    store.updatePRStatus(newer.path, id, 'open')
    store.updatePRStatus(newer.path, id, 'closed')

    expect(listRepoActivity(db, store).map((r) => r.name)).toEqual(['newer', 'older'])
  })
})

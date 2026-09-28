// src/main/__tests__/active-prs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { applySchema } from '../db/schema'
import { insertRepo } from '../db/repos'
import { ReviewStore } from '../../shared/review-store'
import { listActivePrs } from '../services/active-prs'

describe('listActivePrs', () => {
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

  it('returns the open PRs of every known repository with their repository', () => {
    const alpha = makeRepo('alpha')
    const beta = makeRepo('beta')
    openPr(alpha.path, 'alpha-work')
    openPr(beta.path, 'beta-work')

    const prs = listActivePrs(db, store)

    expect(prs.map((pr) => [pr.title, pr.repoId, pr.repoName, pr.repoPath]).sort()).toEqual([
      ['alpha-work', alpha.id, 'alpha', alpha.path],
      ['beta-work', beta.id, 'beta', beta.path],
    ])
  })

  it('leaves out closed PRs', () => {
    const repo = makeRepo('alpha')
    openPr(repo.path, 'still-open')
    store.updatePRStatus(repo.path, openPr(repo.path, 'done'), 'closed')

    expect(listActivePrs(db, store).map((pr) => pr.title)).toEqual(['still-open'])
  })

  it('lists the most recently updated PR first', () => {
    const repo = makeRepo('alpha')
    openPr(repo.path, 'older')
    const newerId = openPr(repo.path, 'newer')
    store.updatePRStatus(repo.path, newerId, 'open')

    expect(listActivePrs(db, store).map((pr) => pr.title)).toEqual(['newer', 'older'])
  })

  it('carries the review state the PR list shows', () => {
    const repo = makeRepo('alpha')
    openPr(repo.path, 'fresh')

    const [pr] = listActivePrs(db, store)

    expect(pr.workflowPhase).toBe('awaiting_review')
    expect(pr.openComments).toBe(0)
  })
})

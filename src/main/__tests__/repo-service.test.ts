// src/main/__tests__/repo-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../db/schema'
import { findRepoByPath, insertRepo, removeRepo } from '../db/repos'
import { syncDiscoveredRepos } from '../services/repo-service'

describe('syncDiscoveredRepos', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('registers newly discovered repos and returns their paths', () => {
    const registered = syncDiscoveredRepos(db, [
      { path: '/tmp/repo-a', name: 'repo-a' },
      { path: '/tmp/repo-b', name: 'repo-b' },
    ])
    expect(registered).toEqual(['/tmp/repo-a', '/tmp/repo-b'])
    expect(findRepoByPath(db, '/tmp/repo-a')).not.toBeNull()
    expect(findRepoByPath(db, '/tmp/repo-b')).not.toBeNull()
  })

  it('skips repos the user removed, so discovery does not resurrect them', () => {
    insertRepo(db, '/tmp/repo-a', 'repo-a')
    removeRepo(db, '/tmp/repo-a')

    const registered = syncDiscoveredRepos(db, [{ path: '/tmp/repo-a', name: 'repo-a' }])

    expect(registered).toEqual([])
    expect(findRepoByPath(db, '/tmp/repo-a')).toBeNull()
  })

  it('is idempotent for repos that are already registered', () => {
    insertRepo(db, '/tmp/repo-a', 'repo-a')
    const registered = syncDiscoveredRepos(db, [{ path: '/tmp/repo-a', name: 'repo-a' }])
    expect(registered).toEqual(['/tmp/repo-a'])
    expect(db.prepare('SELECT COUNT(*) AS n FROM repositories').get()).toEqual({ n: 1 })
  })
})

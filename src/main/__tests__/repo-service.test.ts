// src/main/__tests__/repo-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { applySchema } from '../db/schema'
import { findRepoByPath, insertRepo, removeRepo } from '../db/repos'
import { syncDiscoveredRepos, registerAgentRepo } from '../services/repo-service'

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

describe('registerAgentRepo', () => {
  let db: Database.Database
  let repoPath: string

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-repo-'))
    fs.mkdirSync(path.join(repoPath, '.reviews'))
  })

  afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }))

  it('registers a repository an agent has written a PR to', () => {
    const repo = registerAgentRepo(db, repoPath)

    expect(repo).not.toBeNull()
    expect(repo!.name).toBe(path.basename(repoPath))
    expect(findRepoByPath(db, repoPath)).not.toBeNull()
  })

  it('brings back a repository the user removed, because the agent chose it deliberately', () => {
    insertRepo(db, repoPath, 'x')
    removeRepo(db, repoPath)

    expect(registerAgentRepo(db, repoPath)).not.toBeNull()
    expect(findRepoByPath(db, repoPath)).not.toBeNull()
    // The tombstone is lifted, so scan discovery keeps it too
    expect(syncDiscoveredRepos(db, [{ path: repoPath, name: 'x' }])).toEqual([repoPath])
  })

  it('is idempotent across repeated PRs in the same repository', () => {
    const first = registerAgentRepo(db, repoPath)
    const second = registerAgentRepo(db, repoPath)

    expect(second!.id).toBe(first!.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM repositories').get()).toEqual({ n: 1 })
  })

  it('ignores a path with no reviews on disk, so a stray event cannot add rows', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-'))

    expect(registerAgentRepo(db, bare)).toBeNull()
    expect(findRepoByPath(db, bare)).toBeNull()

    fs.rmSync(bare, { recursive: true, force: true })
  })
})

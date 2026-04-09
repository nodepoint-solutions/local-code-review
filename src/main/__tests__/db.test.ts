// src/main/__tests__/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../db/schema'
import { insertRepo, listRepos, findRepoByPath, touchRepo } from '../db/repos'
import { getSetting, setSetting } from '../db/settings'

describe('database schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('creates repositories and settings tables', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('repositories')
    expect(names).toContain('settings')
    expect(names).not.toContain('pull_requests')
    expect(names).not.toContain('reviews')
    expect(names).not.toContain('comments')
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
  })

  it('returns existing repo if path already registered', () => {
    const r1 = insertRepo(db, '/projects/my-app', 'my-app')
    const r2 = insertRepo(db, '/projects/my-app', 'my-app')
    expect(r1.id).toBe(r2.id)
  })

  it('lists all repos ordered by last_visited_at desc', () => {
    insertRepo(db, '/a', 'a')
    insertRepo(db, '/b', 'b')
    expect(listRepos(db)).toHaveLength(2)
  })

  it('touchRepo sets last_visited_at', () => {
    const repo = insertRepo(db, '/a', 'a')
    expect(listRepos(db)[0].last_visited_at).toBeNull()
    touchRepo(db, repo.id)
    expect(listRepos(db)[0].last_visited_at).not.toBeNull()
  })
})

describe('settings', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('returns null for unknown key', () => {
    expect(getSetting(db, 'nonexistent')).toBeNull()
  })

  it('sets and gets a value', () => {
    setSetting(db, 'scan_base_dir', '/home/user/dev')
    expect(getSetting(db, 'scan_base_dir')).toBe('/home/user/dev')
  })

  it('overwrites an existing value', () => {
    setSetting(db, 'scan_base_dir', '/old')
    setSetting(db, 'scan_base_dir', '/new')
    expect(getSetting(db, 'scan_base_dir')).toBe('/new')
  })
})

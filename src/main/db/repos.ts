// src/main/db/repos.ts
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Repository } from '../../shared/types'

export function findRepoByPath(db: Database.Database, repoPath: string): Repository | null {
  return (
    (db.prepare('SELECT * FROM repositories WHERE path = ?').get(repoPath) as Repository) ?? null
  )
}

export function insertRepo(db: Database.Database, repoPath: string, name: string): Repository {
  const existing = findRepoByPath(db, repoPath)
  if (existing) return existing
  const repo: Repository = {
    id: uuidv4(),
    path: repoPath,
    name,
    created_at: new Date().toISOString(),
    last_visited_at: null,
  }
  db.prepare(
    'INSERT INTO repositories (id, path, name, created_at, last_visited_at) VALUES (?,?,?,?,?)'
  ).run(repo.id, repo.path, repo.name, repo.created_at, repo.last_visited_at)
  return repo
}

export function listRepos(db: Database.Database): Repository[] {
  return db
    .prepare('SELECT * FROM repositories ORDER BY last_visited_at DESC NULLS LAST, created_at DESC')
    .all() as Repository[]
}

export function touchRepo(db: Database.Database, repoId: string): void {
  db.prepare('UPDATE repositories SET last_visited_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    repoId
  )
}

export function deleteRepo(db: Database.Database, repoPath: string): void {
  db.prepare('DELETE FROM repositories WHERE path = ?').run(repoPath)
}

/**
 * Removes a repo from the list and records a tombstone, so scan discovery
 * does not silently re-add it. Review data on disk is left untouched.
 */
export function removeRepo(db: Database.Database, repoPath: string): void {
  deleteRepo(db, repoPath)
  db.prepare('INSERT OR REPLACE INTO removed_repositories (path, removed_at) VALUES (?, ?)').run(
    repoPath,
    new Date().toISOString()
  )
}

export function isRepoRemoved(db: Database.Database, repoPath: string): boolean {
  return db.prepare('SELECT 1 FROM removed_repositories WHERE path = ?').get(repoPath) !== undefined
}

/** Explicitly adding a repo again lifts its tombstone. */
export function clearRemovedRepo(db: Database.Database, repoPath: string): void {
  db.prepare('DELETE FROM removed_repositories WHERE path = ?').run(repoPath)
}

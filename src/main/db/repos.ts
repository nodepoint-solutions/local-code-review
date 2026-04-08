import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Repository } from '../../shared/types'

export function findRepoByPath(db: Database.Database, repoPath: string): Repository | null {
  return (db.prepare('SELECT * FROM repositories WHERE path = ?').get(repoPath) as Repository) ?? null
}

export function insertRepo(db: Database.Database, repoPath: string, name: string): Repository {
  const existing = findRepoByPath(db, repoPath)
  if (existing) return existing
  const repo: Repository = {
    id: uuidv4(),
    path: repoPath,
    name,
    created_at: new Date().toISOString(),
  }
  db.prepare('INSERT INTO repositories (id, path, name, created_at) VALUES (?,?,?,?)').run(
    repo.id, repo.path, repo.name, repo.created_at
  )
  return repo
}

export function listRepos(db: Database.Database): Repository[] {
  return db.prepare('SELECT * FROM repositories ORDER BY created_at DESC').all() as Repository[]
}

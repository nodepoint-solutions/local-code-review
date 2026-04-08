import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { PullRequest } from '../../shared/types'

interface InsertPrArgs {
  repoId: string
  title: string
  description: string | null
  baseBranch: string
  compareBranch: string
  baseSha: string
  compareSha: string
}

export function insertPr(db: Database.Database, args: InsertPrArgs): PullRequest {
  const now = new Date().toISOString()
  const pr: PullRequest = {
    id: uuidv4(),
    repo_id: args.repoId,
    title: args.title,
    description: args.description,
    base_branch: args.baseBranch,
    compare_branch: args.compareBranch,
    base_sha: args.baseSha,
    compare_sha: args.compareSha,
    status: 'open',
    created_at: now,
    updated_at: now,
  }
  db.prepare(`
    INSERT INTO pull_requests
      (id, repo_id, title, description, base_branch, compare_branch, base_sha, compare_sha, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(pr.id, pr.repo_id, pr.title, pr.description, pr.base_branch, pr.compare_branch,
         pr.base_sha, pr.compare_sha, pr.status, pr.created_at, pr.updated_at)
  return pr
}

export function getPr(db: Database.Database, id: string): PullRequest | null {
  return (db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(id) as PullRequest) ?? null
}

export function listPrs(db: Database.Database, repoId: string): PullRequest[] {
  return db.prepare('SELECT * FROM pull_requests WHERE repo_id = ? ORDER BY created_at DESC').all(repoId) as PullRequest[]
}

export function updatePrShas(db: Database.Database, id: string, baseSha: string, compareSha: string): void {
  db.prepare('UPDATE pull_requests SET base_sha = ?, compare_sha = ?, updated_at = ? WHERE id = ?')
    .run(baseSha, compareSha, new Date().toISOString(), id)
}

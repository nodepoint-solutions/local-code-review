import type Database from 'better-sqlite3'
import { findRepoByPath } from '../db/repos'

/**
 * Throws if repoPath is not a registered repository.
 * Call at the start of every IPC handler that accepts a repoPath from the renderer
 * to prevent path-traversal attacks from a compromised renderer dependency.
 */
export function assertKnownRepo(db: Database.Database, repoPath: string): void {
  if (!findRepoByPath(db, repoPath)) {
    throw new Error(`Unknown repository: ${repoPath}`)
  }
}

// src/main/services/repo-service.ts
//
// Repo-list maintenance shared by the IPC layer, extracted so the tombstone
// behaviour is testable against the real database.
import { insertRepo, isRepoRemoved } from '../db/repos'
import type Database from 'better-sqlite3'
import type { DiscoveredRepo } from '../../shared/types'

/**
 * Registers scan-discovered repos, honouring removal tombstones: a repo the
 * user removed stays removed until they add it back explicitly. Returns the
 * paths that are (now) registered, so callers can attach watchers.
 */
export function syncDiscoveredRepos(db: Database.Database, discovered: DiscoveredRepo[]): string[] {
  const registered: string[] = []
  for (const { path: repoPath, name } of discovered) {
    if (isRepoRemoved(db, repoPath)) continue
    insertRepo(db, repoPath, name)
    registered.push(repoPath)
  }
  return registered
}

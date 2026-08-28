// src/main/services/repo-service.ts
//
// Repo-list maintenance shared by the IPC layer, extracted so the tombstone
// behaviour is testable against the real database.
import fs from 'fs'
import path from 'path'
import { insertRepo, isRepoRemoved, clearRemovedRepo } from '../db/repos'
import type Database from 'better-sqlite3'
import type { DiscoveredRepo, Repository } from '../../shared/types'

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

/**
 * Registers a repository an agent opened a PR in, so the app manages it from
 * the first PR onwards. An earlier removal is lifted: the agent named this
 * repository deliberately, which is the same intent as adding it by hand.
 * The .reviews directory must exist, so a stray event cannot add rows for
 * arbitrary paths. Returns null when the path does not qualify.
 */
export function registerAgentRepo(db: Database.Database, repoPath: string): Repository | null {
  if (!fs.existsSync(path.join(repoPath, '.reviews'))) return null
  clearRemovedRepo(db, repoPath)
  return insertRepo(db, repoPath, path.basename(repoPath))
}

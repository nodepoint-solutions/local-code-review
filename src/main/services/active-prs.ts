// src/main/services/active-prs.ts
//
// Open PRs across every known repository, for the Home screen's
// "Active pull requests" list.
import { listRepos } from '../db/repos'
import { listPrsWithState } from '../../shared/pr-state'
import type Database from 'better-sqlite3'
import type { ReviewStore } from '../../shared/review-store'
import type { ActivePrItem } from '../../shared/types'

/** Open PRs of all known repositories, the most recently updated first. */
export function listActivePrs(db: Database.Database, store: ReviewStore): ActivePrItem[] {
  return listRepos(db)
    .flatMap((repo) =>
      listPrsWithState(store, repo.path)
        .filter((pr) => pr.status === 'open')
        .map((pr) => ({ ...pr, repoId: repo.id, repoName: repo.name, repoPath: repo.path }))
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

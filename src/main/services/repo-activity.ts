// src/main/services/repo-activity.ts
//
// Repositories with PR history, for the Home screen's "Active repositories"
// and "Recent" lists.
import { listRepos } from '../db/repos'
import type Database from 'better-sqlite3'
import type { ReviewStore } from '../../shared/review-store'
import type { RepoActivity } from '../../shared/types'

/** Repositories that have PRs, with their open-PR count, the most recent PR activity first. */
export function listRepoActivity(db: Database.Database, store: ReviewStore): RepoActivity[] {
  return listRepos(db)
    .flatMap((repo) => {
      const prs = store.listPRs(repo.path)
      if (prs.length === 0) return []
      const open_pr_count = prs.filter((pr) => pr.status === 'open').length
      const last_pr_at = prs.map((pr) => pr.updated_at).reduce((a, b) => (a > b ? a : b))
      return [{ ...repo, open_pr_count, last_pr_at }]
    })
    .sort((a, b) => b.last_pr_at.localeCompare(a.last_pr_at))
}

// src/main/services/reviewed-repos.ts
//
// Repositories that have been reviewed before and have no open PR, for the
// Home screen's "Recent" list.
import { listRepos } from '../db/repos'
import type Database from 'better-sqlite3'
import type { ReviewStore } from '../../shared/review-store'
import type { ReviewedRepo } from '../../shared/types'

/** Repositories whose PRs are all closed, the most recent PR activity first. */
export function listReviewedRepos(db: Database.Database, store: ReviewStore): ReviewedRepo[] {
  return listRepos(db)
    .flatMap((repo) => {
      const prs = store.listPRs(repo.path)
      if (prs.length === 0 || prs.some((pr) => pr.status === 'open')) return []
      const last_pr_at = prs.map((pr) => pr.updated_at).reduce((a, b) => (a > b ? a : b))
      return [{ ...repo, last_pr_at }]
    })
    .sort((a, b) => b.last_pr_at.localeCompare(a.last_pr_at))
}

// src/shared/review-store/index.ts
import { v4 as uuidv4 } from 'uuid'
import {
  readPR,
  writePR,
  readReview,
  writeReview,
  listPRIds,
  listReviewIds,
  deletePRDir,
  reviewFileHasFixStarted,
} from './serializer'
import type { PRFile, ReviewFile, ReviewComment, Resolution, ContextLineEntry } from './schema'

export { InvalidReviewFileError } from './serializer'
export type { PRFile, ReviewFile, ReviewComment, Resolution, ContextLineEntry } from './schema'

export interface CreatePRArgs {
  title: string
  description: string | null
  base_branch: string
  compare_branch: string
  assignee?: 'claude' | 'vscode' | null
}

export interface CreateReviewArgs {
  base_sha: string
  compare_sha: string
}

export interface AddCommentArgs {
  file: string
  start_line: number
  end_line: number
  side: 'left' | 'right'
  body: string
  context: ContextLineEntry[]
}

export interface LineRange {
  startLine: number
  endLine: number
}

export class ReviewStore {
  // ── PRs ──────────────────────────────────────────────────────────────────

  listPRs(repoPath: string): PRFile[] {
    return listPRIds(repoPath)
      .flatMap((prId) => {
        try {
          return [readPR(repoPath, prId)]
        } catch {
          return []
        }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  createPR(repoPath: string, args: CreatePRArgs): PRFile {
    const now = new Date().toISOString()
    const pr: PRFile = {
      version: 1,
      id: uuidv4(),
      title: args.title,
      description: args.description,
      base_branch: args.base_branch,
      compare_branch: args.compare_branch,
      status: 'open',
      assignee: args.assignee ?? null,
      assigned_at: args.assignee ? now : null,
      merged_at: null,
      created_at: now,
      updated_at: now,
    }
    writePR(repoPath, pr)
    return pr
  }

  getPR(repoPath: string, prId: string): PRFile {
    return readPR(repoPath, prId)
  }

  deletePR(repoPath: string, prId: string): void {
    deletePRDir(repoPath, prId)
  }

  updatePR(
    repoPath: string,
    prId: string,
    changes: { title?: string; description?: string | null }
  ): PRFile {
    const pr = readPR(repoPath, prId)
    const updated: PRFile = { ...pr, ...changes, updated_at: new Date().toISOString() }
    writePR(repoPath, updated)
    return updated
  }

  updatePRStatus(repoPath: string, prId: string, status: 'open' | 'closed'): PRFile {
    const pr = readPR(repoPath, prId)
    const now = new Date().toISOString()
    const updated_at =
      now > pr.updated_at ? now : new Date(new Date(pr.updated_at).getTime() + 1).toISOString()
    const updated: PRFile = { ...pr, status, updated_at }
    writePR(repoPath, updated)
    return updated
  }

  mergePR(repoPath: string, prId: string): PRFile {
    const pr = readPR(repoPath, prId)
    const now = new Date().toISOString()
    const updated_at =
      now > pr.updated_at ? now : new Date(new Date(pr.updated_at).getTime() + 1).toISOString()
    const updated: PRFile = { ...pr, status: 'closed', merged_at: now, updated_at }
    writePR(repoPath, updated)
    return updated
  }

  assignPR(repoPath: string, prId: string, assignee: 'claude' | 'vscode' | null): PRFile {
    const pr = readPR(repoPath, prId)
    const updated: PRFile = {
      ...pr,
      assignee: assignee ?? null,
      assigned_at: assignee ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    writePR(repoPath, updated)
    return updated
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  listReviews(repoPath: string, prId: string): ReviewFile[] {
    let pr: PRFile | null = null
    try {
      pr = readPR(repoPath, prId)
    } catch {
      pr = null
    }
    return listReviewIds(repoPath, prId)
      .flatMap((reviewId) => {
        try {
          return [this.migrateFixStarted(repoPath, prId, pr, readReview(repoPath, prId, reviewId))]
        } catch {
          return []
        }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  /**
   * One-shot migration for review files written before fix_started_at
   * existed. Every current write path serializes the key (even when null), so
   * a raw file without it is legacy by definition — key absence is the
   * discriminator, and timestamps never touch key-present files. Legacy data
   * signalled an active fix by assigning the agent after submission, so those
   * reviews are stamped with the assignment time. Every key-absent file is
   * persisted once, stamped or not, so the key exists on disk afterwards and
   * the migration can never re-fire.
   */
  private migrateFixStarted(
    repoPath: string,
    prId: string,
    pr: PRFile | null,
    review: ReviewFile
  ): ReviewFile {
    if (reviewFileHasFixStarted(repoPath, prId, review.id)) return review
    const legacyMidFix =
      review.status === 'submitted' &&
      review.submitted_at !== null &&
      pr?.assignee != null &&
      pr.assigned_at !== null &&
      pr.assigned_at > review.submitted_at
    const updated: ReviewFile = {
      ...review,
      fix_started_at: legacyMidFix ? pr!.assigned_at : null,
    }
    writeReview(repoPath, prId, updated)
    return updated
  }

  createReview(repoPath: string, prId: string, args: CreateReviewArgs): ReviewFile {
    const review: ReviewFile = {
      version: 1,
      id: uuidv4(),
      status: 'in_progress',
      base_sha: args.base_sha,
      compare_sha: args.compare_sha,
      created_at: new Date().toISOString(),
      submitted_at: null,
      fix_started_at: null,
      comments: [],
    }
    writeReview(repoPath, prId, review)
    return review
  }

  getReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
    return readReview(repoPath, prId, reviewId)
  }

  /**
   * Returns the review that drives the current workflow phase.
   * Priority: in_progress → submitted → most-recent complete → null
   */
  getActiveReview(repoPath: string, prId: string): ReviewFile | null {
    const reviews = this.listReviews(repoPath, prId)
    return (
      reviews.find((r) => r.status === 'in_progress') ??
      reviews.find((r) => r.status === 'submitted') ??
      reviews[0] ??
      null
    )
  }

  /** Returns the in_progress review if one exists, otherwise null. */
  getInProgressReview(repoPath: string, prId: string): ReviewFile | null {
    return this.listReviews(repoPath, prId).find((r) => r.status === 'in_progress') ?? null
  }

  getOrCreateInProgressReview(repoPath: string, prId: string, args: CreateReviewArgs): ReviewFile {
    const existing = this.getInProgressReview(repoPath, prId)
    if (existing) return existing
    return this.createReview(repoPath, prId, args)
  }

  submitReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = {
      ...review,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }
    writeReview(repoPath, prId, updated)
    return updated
  }

  /** Returns a submitted review to editing so the reviewer can amend it. */
  reopenReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    if (review.status !== 'submitted') {
      throw new Error('Only submitted reviews can be reopened')
    }
    const updated: ReviewFile = {
      ...review,
      status: 'in_progress',
      submitted_at: null,
      fix_started_at: null,
    }
    writeReview(repoPath, prId, updated)
    return updated
  }

  /**
   * Records that the assignee's fix session began. Idempotent — a nudge or a
   * second copy of the prompt keeps the original start time.
   */
  startFix(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    if (review.fix_started_at !== null) return review
    const updated: ReviewFile = { ...review, fix_started_at: new Date().toISOString() }
    writeReview(repoPath, prId, updated)
    return updated
  }

  /** Marks the fix session ended, so an abandoned fix can be restarted. */
  clearFixStarted(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = { ...review, fix_started_at: null }
    writeReview(repoPath, prId, updated)
    return updated
  }

  completeReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = { ...review, status: 'complete' }
    writeReview(repoPath, prId, updated)
    return updated
  }

  updateReviewShas(
    repoPath: string,
    prId: string,
    reviewId: string,
    baseSha: string,
    compareSha: string
  ): void {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = { ...review, base_sha: baseSha, compare_sha: compareSha }
    writeReview(repoPath, prId, updated)
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  addComment(repoPath: string, prId: string, reviewId: string, args: AddCommentArgs): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const nextNum = review.comments.length + 1
    const comment: ReviewComment = {
      id: `RVW-${String(nextNum).padStart(3, '0')}`,
      file: args.file,
      start_line: args.start_line,
      end_line: args.end_line,
      side: args.side,
      body: args.body,
      context: args.context,
      is_stale: false,
      status: 'open',
      resolution: null,
      created_at: new Date().toISOString(),
    }
    const updated: ReviewFile = { ...review, comments: [...review.comments, comment] }
    writeReview(repoPath, prId, updated)
    return updated
  }

  deleteComment(repoPath: string, prId: string, reviewId: string, commentId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    if (!review.comments.some((c) => c.id === commentId)) throw new Error('Comment not found')
    const updated: ReviewFile = {
      ...review,
      comments: review.comments.filter((c) => c.id !== commentId),
    }
    writeReview(repoPath, prId, updated)
    return updated
  }

  resolveComment(
    repoPath: string,
    prId: string,
    reviewId: string,
    commentId: string,
    status: 'resolved' | 'wont_fix',
    resolution: Resolution
  ): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = {
      ...review,
      comments: review.comments.map((c) => (c.id === commentId ? { ...c, status, resolution } : c)),
    }
    writeReview(repoPath, prId, updated)
    return updated
  }

  markStale(
    repoPath: string,
    prId: string,
    reviewId: string,
    filePath: string,
    staleRanges: LineRange[]
  ): void {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = {
      ...review,
      comments: review.comments.map((c) => {
        if (c.file !== filePath) return c
        const isStale = staleRanges.some(
          (r) => c.start_line >= r.startLine && c.end_line <= r.endLine
        )
        return isStale ? { ...c, is_stale: true } : c
      }),
    }
    writeReview(repoPath, prId, updated)
  }
}

import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Comment, ContextLine, Review } from '../../shared/types'

interface AddCommentArgs {
  reviewId: string
  filePath: string
  startLine: number
  endLine: number
  side: 'left' | 'right'
  body: string
  contextLines: ContextLine[]
}

export function getOrCreateInProgressReview(db: Database.Database, prId: string): Review {
  const existing = db.prepare(
    `SELECT * FROM reviews WHERE pr_id = ? AND status = 'in_progress' LIMIT 1`
  ).get(prId) as Review | undefined
  if (existing) return existing

  const review: Review = {
    id: uuidv4(),
    pr_id: prId,
    status: 'in_progress',
    submitted_at: null,
    created_at: new Date().toISOString(),
  }
  db.prepare(`INSERT INTO reviews (id, pr_id, status, submitted_at, created_at) VALUES (?,?,?,?,?)`)
    .run(review.id, review.pr_id, review.status, review.submitted_at, review.created_at)
  return review
}

export function submitReview(db: Database.Database, reviewId: string): Review {
  const now = new Date().toISOString()
  db.prepare(`UPDATE reviews SET status = 'submitted', submitted_at = ? WHERE id = ?`).run(now, reviewId)
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as Review
}

export function addComment(db: Database.Database, args: AddCommentArgs): Comment {
  const comment: Comment = {
    id: uuidv4(),
    review_id: args.reviewId,
    file_path: args.filePath,
    start_line: args.startLine,
    end_line: args.endLine,
    side: args.side,
    body: args.body,
    is_stale: false,
    created_at: new Date().toISOString(),
  }
  db.prepare(`
    INSERT INTO comments (id, review_id, file_path, start_line, end_line, side, body, is_stale, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(comment.id, comment.review_id, comment.file_path, comment.start_line,
         comment.end_line, comment.side, comment.body, 0, comment.created_at)

  const contextId = uuidv4()
  db.prepare(`INSERT INTO comment_context (id, comment_id, context_lines) VALUES (?,?,?)`)
    .run(contextId, comment.id, JSON.stringify(args.contextLines))

  return comment
}

export function listComments(db: Database.Database, reviewId: string): Comment[] {
  const rows = db.prepare('SELECT * FROM comments WHERE review_id = ? ORDER BY created_at ASC').all(reviewId) as any[]
  return rows.map((r) => ({ ...r, is_stale: Boolean(r.is_stale) }))
}

export function getCommentContext(db: Database.Database, commentId: string): ContextLine[] {
  const row = db.prepare('SELECT context_lines FROM comment_context WHERE comment_id = ?').get(commentId) as { context_lines: string } | undefined
  if (!row) return []
  return JSON.parse(row.context_lines) as ContextLine[]
}

export function markCommentsStale(
  db: Database.Database,
  reviewId: string,
  filePath: string,
  staleRanges: { startLine: number; endLine: number }[]
): void {
  const comments = listComments(db, reviewId).filter((c) => c.file_path === filePath)
  const stmt = db.prepare('UPDATE comments SET is_stale = 1 WHERE id = ?')
  for (const comment of comments) {
    const isStale = staleRanges.some(
      (r) => comment.start_line >= r.startLine && comment.end_line <= r.endLine
    )
    if (isStale) stmt.run(comment.id)
  }
}

import { useState } from 'react'
import type { ReviewComment, PrDetail, ReviewFile } from '../../../shared/types'
import styles from './ReviewPanel.module.css'

interface Props {
  review: ReviewFile | null
  comments: ReviewComment[]
  prId: string
  repoPath: string
  onClose: () => void
  onSubmitted: (updated: PrDetail | null) => void
}

function XIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function ReviewPanel({ review, comments, prId, repoPath, onClose, onSubmitted }: Props): JSX.Element {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const nonStale = comments.filter((c) => !c.is_stale)

  async function handleSubmit(): Promise<void> {
    if (!review) return
    setSubmitting(true)
    setError('')
    const result = await window.api.submitReview(repoPath, prId, review.id)
    if ('error' in result) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    const updated = await window.api.getPr(repoPath, prId)
    if (updated && 'error' in updated) { setSubmitting(false); return }
    onSubmitted(updated as PrDetail | null)
    setSubmitting(false)
  }

  function getFileName(path: string): string {
    return path.split('/').pop() ?? path
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Review</span>
          {nonStale.length > 0 && (
            <span className={styles.badge}>{nonStale.length}</span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Close panel">
          <XIcon />
        </button>
      </div>

      {review?.status === 'submitted' && (
        <div className={styles.submittedBanner}>
          <CheckIcon />
          Review submitted
        </div>
      )}

      <div className={styles.list}>
        {nonStale.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No comments yet</p>
            <p className={styles.emptyText}>
              Click the <strong>+</strong> button on any diff line to add a comment.
            </p>
          </div>
        ) : (
          nonStale.map((comment) => (
            <div key={comment.id} className={styles.commentItem}>
              <div className={styles.commentFile}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className={styles.commentFileName} title={comment.file}>
                  {getFileName(comment.file)}
                </span>
                <span className={styles.commentLines}>
                  :{comment.start_line}
                  {comment.start_line !== comment.end_line ? `–${comment.end_line}` : ''}
                </span>
              </div>
              <p className={styles.commentBody}>{comment.body}</p>
            </div>
          ))
        )}
      </div>

      {review?.status === 'in_progress' && (
        <div className={styles.footer}>
          {error && (
            <div className={styles.error}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={submitting || nonStale.length === 0}
            style={{ width: '100%' }}
          >
            {submitting ? 'Submitting…' : `Submit review (${nonStale.length} comment${nonStale.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      )}
    </div>
  )
}

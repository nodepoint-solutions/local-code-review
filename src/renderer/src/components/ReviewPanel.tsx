import { useState } from 'react'
import type { Comment, PrDetail, Review } from '../../../shared/types'
import styles from './ReviewPanel.module.css'

interface Props {
  review: Review | null
  comments: Comment[]
  prId: string
  repoPath: string
  onClose: () => void
  onSubmitted: (updated: PrDetail | null) => void
}

export default function ReviewPanel({ review, comments, prId, repoPath, onClose, onSubmitted }: Props): JSX.Element {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const nonStale = comments.filter((c) => !c.is_stale)

  async function handleSubmit(): Promise<void> {
    if (!review) return
    setSubmitting(true)
    setError('')
    const result = await window.api.submitAndExport(review.id, prId)
    if ('error' in result) {
      if (result.error !== 'cancelled') setError(result.error)
      setSubmitting(false)
      return
    }
    // Reload PR detail
    const updated = await window.api.getPr(prId, repoPath)
    onSubmitted(updated)
    setSubmitting(false)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Review ({nonStale.length} comment{nonStale.length !== 1 ? 's' : ''})</h3>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div className={styles.list}>
        {nonStale.length === 0 ? (
          <p className={styles.empty}>No comments yet. Click + on any diff line to add one.</p>
        ) : (
          nonStale.map((comment) => (
            <div key={comment.id} className={styles.commentItem}>
              <div className={styles.commentMeta}>
                <code>{comment.file_path}</code>
                <span className={styles.lines}>:{comment.start_line}{comment.start_line !== comment.end_line ? `–${comment.end_line}` : ''}</span>
              </div>
              <div className={styles.commentBody}>{comment.body}</div>
            </div>
          ))
        )}
      </div>
      {review?.status === 'in_progress' && (
        <div className={styles.footer}>
          {error && <p className={styles.error}>{error}</p>}
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={submitting || nonStale.length === 0}
          >
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>
        </div>
      )}
      {review?.status === 'submitted' && (
        <div className={styles.submitted}>Review submitted.</div>
      )}
    </div>
  )
}

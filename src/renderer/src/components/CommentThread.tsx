import type { ReviewComment } from '../../../shared/types'
import styles from './CommentThread.module.css'

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  comment: ReviewComment
}

export default function CommentThread({ comment }: Props): JSX.Element {
  const lineRange = comment.start_line === comment.end_line
    ? `Line ${comment.start_line}`
    : `Lines ${comment.start_line}–${comment.end_line}`

  return (
    <div className={`${styles.thread} ${comment.is_stale ? styles.stale : ''}`}>
      <div className={styles.header}>
        <div className={styles.meta}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className={styles.lineRef}>{lineRange}</span>
        </div>
        <div className={styles.meta}>
          {comment.is_stale && <span className={styles.staleTag}>outdated</span>}
          {comment.status === 'resolved' && <span className={styles.badgeResolved}>Resolved</span>}
          {comment.status === 'wont_fix' && <span className={styles.badgeWontFix}>Won't fix</span>}
        </div>
      </div>
      <div className={styles.body}>{comment.body}</div>
      {comment.resolution && (
        <div className={styles.resolution}>
          <div className={styles.resolutionMeta}>
            <span className={styles.resolutionAgent}>{comment.resolution.resolved_by}</span>
            <span className={styles.resolutionTime}>{formatRelativeTime(comment.resolution.resolved_at)}</span>
          </div>
          <div className={styles.resolutionComment}>{comment.resolution.comment}</div>
        </div>
      )}
    </div>
  )
}

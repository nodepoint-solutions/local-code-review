import type { ReviewComment } from '../../../shared/types'
import styles from './CommentThread.module.css'

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
        {comment.is_stale && <span className={styles.staleTag}>outdated</span>}
      </div>
      <div className={styles.body}>{comment.body}</div>
    </div>
  )
}

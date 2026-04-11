import type { ReviewComment } from '../../../shared/types'
import styles from './CommentThread.module.css'
import { formatRelativeTime } from '../utils/formatTime'
import ReactMarkdown from 'react-markdown'
import { AgentAvatar } from './AgentAvatar'

interface Props {
  comment: ReviewComment
  allowDelete?: boolean
  onDelete?: () => void
  focused?: boolean
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  )
}

export default function CommentThread({ comment, allowDelete, onDelete, focused }: Props): JSX.Element {
  const lineRange = comment.start_line === comment.end_line
    ? `Line ${comment.start_line}`
    : `Lines ${comment.start_line}–${comment.end_line}`

  return (
    <div
      data-comment-id={comment.id}
      className={`${styles.thread} ${comment.is_stale ? styles.stale : ''} ${focused ? styles.focused : ''}`}
    >
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
          {allowDelete && (
            <button aria-label="Delete comment" className={styles.deleteBtn} onClick={onDelete}>
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
      <div className={styles.body}><ReactMarkdown>{comment.body}</ReactMarkdown></div>
      {comment.resolution && (
        <div className={styles.resolution}>
          <div className={styles.resolutionMeta}>
            <div className={styles.resolutionAgentRow}>
              <AgentAvatar resolvedBy={comment.resolution.resolved_by} size={18} />
              <span className={styles.resolutionAgent}>{comment.resolution.resolved_by}</span>
            </div>
            <span className={styles.resolutionTime}>{formatRelativeTime(comment.resolution.resolved_at)}</span>
          </div>
          <div className={styles.resolutionComment}><ReactMarkdown>{comment.resolution.comment}</ReactMarkdown></div>
        </div>
      )}
    </div>
  )
}

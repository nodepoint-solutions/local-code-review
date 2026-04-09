import type { PRFile, ReviewFile, ReviewComment } from '../../../shared/types'
import CommentThread from './CommentThread'
import { formatRelativeTime, formatAbsoluteDate } from '../utils/formatTime'
import styles from './ReviewTimeline.module.css'

interface Props {
  pr: PRFile
  review: ReviewFile | null
  comments: ReviewComment[]
}

export default function ReviewTimeline({ pr, review, comments }: Props): JSX.Element {
  const showReview = review !== null && review.status === 'submitted'
  const visibleComments = comments.filter((c) => !c.is_stale)
  const commentCount = visibleComments.length

  return (
    <div className={styles.timeline}>
      <div className={styles.entry}>
        <div className={styles.rail}>
          <div className={styles.dot} />
        </div>
        <div className={styles.content}>
          <div className={styles.entryHeader}>
            <span className={styles.entryTitle}>Opened this PR</span>
            <span className={styles.entryTime}>{formatAbsoluteDate(pr.created_at)}</span>
          </div>
        </div>
      </div>

      {showReview && (
        <div className={styles.entry}>
          <div className={styles.rail}>
            <div className={`${styles.dot} ${styles.dotActive}`} />
          </div>
          <div className={styles.content}>
            <div className={styles.entryHeader}>
              <span className={styles.entryTitle}>
                Review submitted with {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </span>
              {review.submitted_at && (
                <span className={styles.entryTime}>{formatRelativeTime(review.submitted_at)}</span>
              )}
            </div>
            {visibleComments.length > 0 && (
              <div className={styles.commentList}>
                {visibleComments.map((comment) => (
                  <CommentThread key={comment.id} comment={comment} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

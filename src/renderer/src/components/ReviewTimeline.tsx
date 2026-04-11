import type { PRFile, ReviewFile } from '../../../shared/types'
import CommentThread from './CommentThread'
import { formatRelativeTime, formatAbsoluteDate } from '../utils/formatTime'
import { AgentIcon } from './AgentAvatar'
import styles from './ReviewTimeline.module.css'

interface Props {
  pr: PRFile
  reviews: ReviewFile[]
  reviewCommitCounts: Record<string, number>
}

export default function ReviewTimeline({ pr, reviews, reviewCommitCounts }: Props): JSX.Element {
  return (
    <div className={styles.timeline}>
      {/* PR opened */}
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

      {reviews.map((review) => {
        const visibleComments = review.comments.filter((c) => !c.is_stale)

        if (review.status === 'in_progress') {
          return (
            <div key={review.id} className={styles.entry}>
              <div className={styles.rail}>
                <div className={styles.dot} />
              </div>
              <div className={styles.content}>
                <div className={styles.entryHeader}>
                  <span className={styles.entryTitle}>Review in progress</span>
                </div>
              </div>
            </div>
          )
        }

        const submittedEntry = (
          <div key={`${review.id}-submitted`} className={styles.entry}>
            <div className={styles.rail}>
              <div className={`${styles.dot} ${styles.dotActive}`} />
            </div>
            <div className={styles.content}>
              <div className={styles.entryHeader}>
                <span className={styles.entryTitle}>Review submitted</span>
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
        )

        if (review.status === 'submitted') {
          return submittedEntry
        }

        const commitCount = reviewCommitCounts[review.id] ?? 0
        const commitLabel = `${commitCount} ${commitCount === 1 ? 'commit' : 'commits'} created`

        return (
          <div key={review.id}>
            {submittedEntry}
            {pr.assignee && pr.assigned_at && (
              <div className={styles.entry}>
                <div className={styles.rail}>
                  <div className={`${styles.dot} ${styles.dotActive}`} />
                </div>
                <div className={styles.content}>
                  <div className={styles.entryHeader}>
                    <AgentIcon assignee={pr.assignee} size={16} />
                    <span className={styles.entryTitle}>
                      Assigned to {pr.assignee === 'claude' ? 'Claude Code' : 'Copilot (VS Code)'}
                    </span>
                    <span className={styles.entryTime}>{formatRelativeTime(pr.assigned_at)}</span>
                  </div>
                </div>
              </div>
            )}
            <div className={styles.entry}>
              <div className={styles.rail}>
                <div className={`${styles.dot} ${styles.dotComplete}`} />
              </div>
              <div className={styles.content}>
                <div className={styles.entryHeader}>
                  {pr.assignee && <AgentIcon assignee={pr.assignee} size={16} />}
                  <span className={styles.entryTitle}>Review feedback implemented</span>
                </div>
                <div className={styles.commitCount}>{commitLabel}</div>
              </div>
            </div>
          </div>
        )
      })}

      {pr.merged_at && (
        <div className={styles.entry}>
          <div className={styles.rail}>
            <div className={`${styles.dot} ${styles.dotMerged}`} />
          </div>
          <div className={styles.content}>
            <div className={styles.entryHeader}>
              <span className={styles.entryTitle}>
                Merged into <code>{pr.base_branch}</code>
              </span>
              <span className={styles.entryTime}>{formatRelativeTime(pr.merged_at)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

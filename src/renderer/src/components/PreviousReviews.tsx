import { useState, useCallback } from 'react'
import type { ReviewFile, ReviewComment, ParsedFile } from '../../../shared/types'
import DiffView from './DiffView'
import CommentNav from './CommentNav'
import CommentOutline from './CommentOutline'
import { formatRelativeTime } from '../utils/formatTime'
import { sortCommentsByPosition } from '../utils/sortComments'
import styles from './PreviousReviews.module.css'

interface Props {
  reviews: ReviewFile[]   // only complete reviews, oldest→newest
  repoPath: string
}

export default function PreviousReviews({ reviews, repoPath }: Props): JSX.Element {
  const [selectedReview, setSelectedReview] = useState<ReviewFile | null>(null)
  const [historicDiff, setHistoricDiff] = useState<ParsedFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusedCommentIndex, setFocusedCommentIndex] = useState(-1)

  // All non-stale comments for the selected review, sorted by file path then line
  const navComments: ReviewComment[] = selectedReview
    ? sortCommentsByPosition(selectedReview.comments.filter((c) => !c.is_stale))
    : []

  async function handleSelectReview(review: ReviewFile): Promise<void> {
    if (selectedReview?.id === review.id) return
    setSelectedReview(review)
    setHistoricDiff(null)
    setFocusedCommentIndex(-1)
    setLoading(true)
    const result = await window.api.getDiffAtShas(repoPath, review.base_sha, review.compare_sha)
    setLoading(false)
    if ('error' in result) return
    setHistoricDiff(result)
  }

  const handleNav = useCallback((index: number) => {
    setFocusedCommentIndex(index)
    const comment = navComments[index]
    if (!comment) return
    const el = document.querySelector(`[data-comment-id="${comment.id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [navComments])

  return (
    <div className={styles.layout}>
      {/* Left panel — review list */}
      <div className={styles.listPanel}>
        {reviews.map((review, idx) => (
          <div
            key={review.id}
            className={`${styles.reviewItem} ${selectedReview?.id === review.id ? styles.reviewItemActive : ''}`}
            onClick={() => handleSelectReview(review)}
          >
            <div className={styles.reviewLabel}>Review {idx + 1}</div>
            <div className={styles.reviewMeta}>
              <code className={styles.sha}>{review.compare_sha.slice(0, 7)}</code>
              {review.submitted_at && (
                <span className={styles.reviewTime}>{formatRelativeTime(review.submitted_at)}</span>
              )}
            </div>
            <div className={styles.reviewCommentCount}>
              {review.comments.filter((c) => !c.is_stale).length} comment{review.comments.filter((c) => !c.is_stale).length !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel — historic diff */}
      <div className={styles.diffPanel}>
        {selectedReview && (
          <div className={styles.diffToolbar}>
            <CommentNav
              total={navComments.length}
              current={focusedCommentIndex}
              onPrev={() => handleNav(Math.max(0, focusedCommentIndex - 1))}
              onNext={() => handleNav(Math.min(navComments.length - 1, focusedCommentIndex + 1))}
            />
          </div>
        )}
        <div className={styles.diffScroll}>
          {!selectedReview && (
            <div className={styles.empty}>Select a review to see the diff at that point in time.</div>
          )}
          {selectedReview && loading && (
            <div className={styles.loading}>Loading diff…</div>
          )}
          {selectedReview && !loading && historicDiff && (
            historicDiff.length === 0 ? (
              <div className={styles.empty}>No file changes in this review snapshot.</div>
            ) : (
              historicDiff.map((file) => (
                <DiffView
                  key={file.newPath}
                  file={file}
                  comments={selectedReview.comments.filter((c) => c.file === file.newPath && !c.is_stale)}
                  view="unified"
                  onAddComment={async () => {}}
                  readOnly
                />
              ))
            )
          )}
        </div>
      </div>
      <CommentOutline
        comments={navComments}
        focusedIndex={focusedCommentIndex}
        onSelect={handleNav}
      />
    </div>
  )
}

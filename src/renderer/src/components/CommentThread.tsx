import type { Comment } from '../../../shared/types'
import styles from './CommentThread.module.css'

interface Props {
  comment: Comment
}

export default function CommentThread({ comment }: Props): JSX.Element {
  return (
    <div className={`${styles.thread} ${comment.is_stale ? styles.stale : ''}`}>
      <div className={styles.header}>
        <span className={styles.lines}>Lines {comment.start_line}–{comment.end_line}</span>
        {comment.is_stale && <span className={styles.staleTag}>stale</span>}
      </div>
      <div className={styles.body}>{comment.body}</div>
    </div>
  )
}

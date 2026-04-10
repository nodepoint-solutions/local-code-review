import type { ReviewComment } from '../../../shared/types'
import styles from './CommentOutline.module.css'

interface Props {
  comments: ReviewComment[]  // sorted, non-stale
  focusedIndex: number       // -1 = none focused
  onSelect: (index: number) => void
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path
}

function getDir(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

export default function CommentOutline({ comments, focusedIndex, onSelect }: Props): JSX.Element | null {
  if (comments.length === 0) return null

  // Group into file sections preserving order
  const sections: Array<{ file: string; entries: Array<{ comment: ReviewComment; index: number }> }> = []
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i]
    const last = sections[sections.length - 1]
    if (last && last.file === c.file) {
      last.entries.push({ comment: c, index: i })
    } else {
      sections.push({ file: c.file, entries: [{ comment: c, index: i }] })
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Comments</div>
      <div className={styles.list}>
        {sections.map((section) => (
          <div key={section.file} className={styles.section}>
            <div className={styles.fileLabel} title={section.file}>
              {getDir(section.file) && (
                <span className={styles.fileDir}>{getDir(section.file)}/</span>
              )}
              <span className={styles.fileName}>{getFileName(section.file)}</span>
            </div>
            {section.entries.map(({ comment, index }) => (
              <button
                key={comment.id}
                className={`${styles.item} ${index === focusedIndex ? styles.itemFocused : ''}`}
                onClick={() => onSelect(index)}
                title={comment.body}
              >
                <span className={styles.lineRef}>
                  {comment.start_line === comment.end_line
                    ? `L${comment.start_line}`
                    : `L${comment.start_line}–${comment.end_line}`}
                </span>
                <span className={styles.body}>
                  {comment.body.length > 60 ? comment.body.slice(0, 60) + '…' : comment.body}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

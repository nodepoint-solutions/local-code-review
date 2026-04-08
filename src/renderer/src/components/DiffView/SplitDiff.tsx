import type { Comment, ParsedFile, ParsedLine } from '../../../../shared/types'
import DiffLine from './DiffLine'
import CommentThread from '../CommentThread'
import styles from './SplitDiff.module.css'

interface Props {
  file: ParsedFile
  comments: Comment[]
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
}

/**
 * Pairs up left (old) and right (new) lines for side-by-side rendering.
 * Context lines appear on both sides. Removed lines appear only on left.
 * Added lines appear only on right. Hunk headers span both.
 */
function pairLines(lines: ParsedLine[]): Array<{ left: ParsedLine | null; right: ParsedLine | null }> {
  const pairs: Array<{ left: ParsedLine | null; right: ParsedLine | null }> = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.type === 'hunk-header' || line.type === 'context') {
      pairs.push({ left: line, right: line })
      i++
    } else if (line.type === 'removed') {
      const next = lines[i + 1]
      if (next?.type === 'added') {
        pairs.push({ left: line, right: next })
        i += 2
      } else {
        pairs.push({ left: line, right: null })
        i++
      }
    } else if (line.type === 'added') {
      pairs.push({ left: null, right: line })
      i++
    } else {
      i++
    }
  }
  return pairs
}

export default function SplitDiff({
  file, comments, onStartComment, onExtendComment, isSelecting, selectionStart,
}: Props): JSX.Element {
  const pairs = pairLines(file.lines)

  const commentsByEndLine = new Map<number, Comment[]>()
  for (const comment of comments) {
    const existing = commentsByEndLine.get(comment.end_line) ?? []
    commentsByEndLine.set(comment.end_line, [...existing, comment])
  }

  return (
    <table className={styles.table}>
      <tbody>
        {pairs.map((pair, idx) => {
          if (pair.left?.type === 'hunk-header') {
            return (
              <tr key={`hunk-${idx}`} className={styles.hunkHeader}>
                <td colSpan={6}>{pair.left.content}</td>
              </tr>
            )
          }

          const rightEndComments = pair.right ? (commentsByEndLine.get(pair.right.diffLineNumber) ?? []) : []
          const leftEndComments = pair.left ? (commentsByEndLine.get(pair.left.diffLineNumber) ?? []) : []

          // De-dup: don't show same comment twice if it ends on both sides
          const allEndComments = [...new Map([...rightEndComments, ...leftEndComments].map((c) => [c.id, c])).values()]

          return (
            <>
              <tr key={`pair-${idx}`} className={styles.pairRow}>
                {/* Left side */}
                <td className={styles.side}>
                  {pair.left ? (
                    <table className={styles.innerTable}><tbody>
                      <DiffLine
                        line={pair.left}
                        comments={[]}
                        onStartComment={onStartComment}
                        onExtendComment={onExtendComment}
                        isSelecting={isSelecting}
                        selectionStart={selectionStart}
                        side="left"
                      />
                    </tbody></table>
                  ) : <div className={styles.emptyCell} />}
                </td>
                {/* Right side */}
                <td className={styles.side}>
                  {pair.right ? (
                    <table className={styles.innerTable}><tbody>
                      <DiffLine
                        line={pair.right}
                        comments={[]}
                        onStartComment={onStartComment}
                        onExtendComment={onExtendComment}
                        isSelecting={isSelecting}
                        selectionStart={selectionStart}
                        side="right"
                      />
                    </tbody></table>
                  ) : <div className={styles.emptyCell} />}
                </td>
              </tr>
              {allEndComments.map((comment) => (
                <tr key={`comment-${comment.id}`}>
                  <td colSpan={2}>
                    <CommentThread comment={comment} />
                  </td>
                </tr>
              ))}
            </>
          )
        })}
      </tbody>
    </table>
  )
}

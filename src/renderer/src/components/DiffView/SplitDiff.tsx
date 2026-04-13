import type { ReviewComment, ParsedFile, ParsedLine } from '../../../../shared/types'
import DiffLine from './DiffLine'
import CommentThread from '../CommentThread'
import CommentBox from '../CommentBox'
import styles from './SplitDiff.module.css'

interface Props {
  file: ParsedFile
  comments: ReviewComment[]
  language: string | null
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  onHoverLine: (lineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
  selectionEnd: number | null
  hoverLine: number | null
  allowDeleteComment?: boolean
  onDeleteComment?: (commentId: string) => void
  focusedCommentId?: string
  showCommentBox?: boolean
  commentBoxEndLine?: number | null
  commentBoxStartLine?: number | null
  onCommentBoxSubmit?: (body: string) => Promise<void>
  onCommentBoxCancel?: () => void
}

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
  file, comments, language,
  onStartComment, onExtendComment, onHoverLine,
  isSelecting, selectionStart, selectionEnd, hoverLine,
  allowDeleteComment, onDeleteComment, focusedCommentId,
  showCommentBox, commentBoxEndLine, commentBoxStartLine,
  onCommentBoxSubmit, onCommentBoxCancel,
}: Props): JSX.Element {
  const pairs = pairLines(file.lines)

  const commentsByEndLine = new Map<number, ReviewComment[]>()
  for (const comment of comments) {
    const existing = commentsByEndLine.get(comment.end_line) ?? []
    commentsByEndLine.set(comment.end_line, [...existing, comment])
  }

  const lineNums = new Set(file.lines.map((l) => l.diffLineNumber))
  const orphanedStale = comments.filter((c) => c.is_stale && !lineNums.has(c.end_line))

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

          const rightEndReviewComments = pair.right ? (commentsByEndLine.get(pair.right.diffLineNumber) ?? []) : []
          const leftEndReviewComments = pair.left ? (commentsByEndLine.get(pair.left.diffLineNumber) ?? []) : []
          const allEndReviewComments = [...new Map([...rightEndReviewComments, ...leftEndReviewComments].map((c) => [c.id, c])).values()]

          return (
            <>
              <tr key={`pair-${idx}`} className={styles.pairRow}>
                <td className={styles.side}>
                  {pair.left ? (
                    <table className={styles.innerTable}><tbody>
                      <DiffLine
                        line={pair.left}
                        language={language}
                        comments={[]}
                        onStartComment={onStartComment}
                        onExtendComment={onExtendComment}
                        onHoverLine={onHoverLine}
                        isSelecting={isSelecting}
                        selectionStart={selectionStart}
                        selectionEnd={selectionEnd}
                        hoverLine={hoverLine}
                        side="left"
                      />
                    </tbody></table>
                  ) : <div className={styles.emptyCell} />}
                </td>
                <td className={styles.side}>
                  {pair.right ? (
                    <table className={styles.innerTable}><tbody>
                      <DiffLine
                        line={pair.right}
                        language={language}
                        comments={[]}
                        onStartComment={onStartComment}
                        onExtendComment={onExtendComment}
                        onHoverLine={onHoverLine}
                        isSelecting={isSelecting}
                        selectionStart={selectionStart}
                        selectionEnd={selectionEnd}
                        hoverLine={hoverLine}
                        side="right"
                      />
                    </tbody></table>
                  ) : <div className={styles.emptyCell} />}
                </td>
              </tr>
              {allEndReviewComments.map((comment) => (
                <tr key={`comment-${comment.id}`}>
                  <td colSpan={2}>
                    <CommentThread
                      comment={comment}
                      allowDelete={allowDeleteComment}
                      onDelete={onDeleteComment ? () => onDeleteComment(comment.id) : undefined}
                      focused={focusedCommentId === comment.id}
                    />
                  </td>
                </tr>
              ))}
              {showCommentBox && onCommentBoxSubmit && onCommentBoxCancel && commentBoxEndLine !== null && commentBoxEndLine !== undefined &&
                (pair.right?.diffLineNumber === commentBoxEndLine || pair.left?.diffLineNumber === commentBoxEndLine) && (
                <tr key="comment-box">
                  <td colSpan={2}>
                    <CommentBox
                      startLine={commentBoxStartLine ?? commentBoxEndLine}
                      endLine={commentBoxEndLine}
                      onSubmit={onCommentBoxSubmit}
                      onCancel={onCommentBoxCancel}
                    />
                  </td>
                </tr>
              )}
            </>
          )
        })}
        {orphanedStale.map((comment) => (
          <tr key={`orphan-${comment.id}`}>
            <td colSpan={2}>
              <CommentThread
                comment={comment}
                allowDelete={allowDeleteComment}
                onDelete={onDeleteComment ? () => onDeleteComment(comment.id) : undefined}
                focused={focusedCommentId === comment.id}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

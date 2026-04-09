import type { Comment, ParsedFile } from '../../../../shared/types'
import DiffLine from './DiffLine'
import CommentThread from '../CommentThread'
import styles from './UnifiedDiff.module.css'

interface Props {
  file: ParsedFile
  comments: Comment[]
  language: string | null
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  onHoverLine: (lineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
  selectionEnd: number | null
  hoverLine: number | null
}

export default function UnifiedDiff({
  file, comments, language,
  onStartComment, onExtendComment, onHoverLine,
  isSelecting, selectionStart, selectionEnd, hoverLine,
}: Props): JSX.Element {
  const commentsByEndLine = new Map<number, Comment[]>()
  for (const comment of comments) {
    const existing = commentsByEndLine.get(comment.end_line) ?? []
    commentsByEndLine.set(comment.end_line, [...existing, comment])
  }

  return (
    <table className={styles.table}>
      <tbody>
        {file.lines.map((line) => (
          <>
            <DiffLine
              key={`line-${line.diffLineNumber}`}
              line={line}
              language={language}
              comments={comments.filter((c) => c.start_line <= line.diffLineNumber && c.end_line >= line.diffLineNumber)}
              onStartComment={onStartComment}
              onExtendComment={onExtendComment}
              onHoverLine={onHoverLine}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
              selectionEnd={selectionEnd}
              hoverLine={hoverLine}
              side="right"
            />
            {(commentsByEndLine.get(line.diffLineNumber) ?? []).map((comment) => (
              <tr key={`comment-${comment.id}`}>
                <td colSpan={4}>
                  <CommentThread comment={comment} />
                </td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  )
}

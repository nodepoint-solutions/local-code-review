import type { Comment, ParsedLine } from '../../../../shared/types'
import { highlightLine } from '../../utils/syntax'
import styles from './DiffLine.module.css'

interface Props {
  line: ParsedLine
  comments: Comment[]
  language: string | null
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  onHoverLine: (lineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
  selectionEnd: number | null
  hoverLine: number | null
  side?: 'left' | 'right'
}

export default function DiffLine({
  line,
  comments,
  language,
  onStartComment,
  onExtendComment,
  onHoverLine,
  isSelecting,
  selectionStart,
  selectionEnd,
  hoverLine,
  side = 'right',
}: Props): JSX.Element | null {
  if (line.type === 'hunk-header') {
    return (
      <tr className={styles.hunkHeader}>
        <td colSpan={4} className={styles.hunkHeaderContent}>{line.content}</td>
      </tr>
    )
  }

  // Active range: during drag use hoverLine, after drag use selectionEnd
  const activeEnd = isSelecting ? hoverLine : selectionEnd
  const isInSelection =
    selectionStart !== null &&
    activeEnd !== null &&
    line.diffLineNumber >= Math.min(selectionStart, activeEnd) &&
    line.diffLineNumber <= Math.max(selectionStart, activeEnd)

  const hasComments = comments.length > 0

  function handleMouseEnter(): void {
    if (isSelecting) onHoverLine(line.diffLineNumber)
  }
  function handleMouseDown(): void {
    if (!isSelecting) onStartComment(line.diffLineNumber, side)
  }
  function handleMouseUp(): void {
    if (isSelecting) onExtendComment(line.diffLineNumber)
  }

  const lineClass = [
    styles.line,
    styles[line.type],
    isInSelection ? styles.inSelection : '',
    hasComments ? styles.hasComment : '',
  ].filter(Boolean).join(' ')

  // Strip prefix char from content for syntax highlighting
  const rawContent = line.content
  const highlightedHtml = highlightLine(rawContent, language)
  const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '\u00a0'

  return (
    <tr
      className={lineClass}
      onMouseEnter={handleMouseEnter}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <td className={styles.lineNumOld}>{line.oldLineNumber ?? ''}</td>
      <td className={styles.lineNumNew}>{line.newLineNumber ?? ''}</td>
      <td className={styles.gutter}>
        <button
          className={styles.gutterBtn}
          title="Add comment"
          onMouseDown={(e) => { e.stopPropagation(); onStartComment(line.diffLineNumber, side) }}
        >
          +
        </button>
      </td>
      <td className={styles.code}>
        <span className={styles.prefix}>{prefix}</span>
        <span dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </td>
    </tr>
  )
}

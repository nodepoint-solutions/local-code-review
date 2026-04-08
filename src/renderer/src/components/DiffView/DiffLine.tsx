import { useState } from 'react'
import type { Comment, ParsedLine } from '../../../../shared/types'
import styles from './DiffLine.module.css'

interface Props {
  line: ParsedLine
  comments: Comment[]
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
  side?: 'left' | 'right'
}

export default function DiffLine({
  line,
  comments,
  onStartComment,
  onExtendComment,
  isSelecting,
  selectionStart,
  side = 'right',
}: Props): JSX.Element | null {
  const [hovered, setHovered] = useState(false)

  if (line.type === 'hunk-header') {
    return (
      <tr className={styles.hunkHeader}>
        <td colSpan={4} className={styles.hunkHeaderContent}>{line.content}</td>
      </tr>
    )
  }

  const isInSelection =
    isSelecting &&
    selectionStart !== null &&
    line.diffLineNumber >= Math.min(selectionStart, line.diffLineNumber) &&
    line.diffLineNumber <= Math.max(selectionStart, line.diffLineNumber)

  function handleMouseEnter(): void { setHovered(true) }
  function handleMouseLeave(): void { setHovered(false) }
  function handleMouseDown(): void {
    if (!isSelecting) onStartComment(line.diffLineNumber, side)
  }
  function handleMouseUp(): void {
    if (isSelecting) onExtendComment(line.diffLineNumber)
  }

  const lineClass = `${styles.line} ${styles[line.type]} ${isInSelection ? styles.selecting : ''}`

  return (
    <tr
      role="row"
      className={lineClass}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <td className={styles.lineNumOld}>{line.oldLineNumber ?? ''}</td>
      <td className={styles.lineNumNew}>{line.newLineNumber ?? ''}</td>
      <td className={styles.gutter}>
        {(hovered || isSelecting) && (
          <button
            title="Add comment"
            className={styles.gutterBtn}
            onMouseDown={(e) => { e.stopPropagation(); onStartComment(line.diffLineNumber, side) }}
          >+</button>
        )}
      </td>
      <td className={styles.code}>
        <span className={styles.prefix}>
          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
        </span>
        <span>{line.content}</span>
      </td>
    </tr>
  )
}

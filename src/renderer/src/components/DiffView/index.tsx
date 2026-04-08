import { useState } from 'react'
import type { AddCommentPayload, Comment, ParsedFile } from '../../../../shared/types'
import { extractContext } from '../../../../shared/diff-utils'
import UnifiedDiff from './UnifiedDiff'
import SplitDiff from './SplitDiff'
import CommentBox from '../CommentBox'
import styles from './DiffView.module.css'

interface Props {
  file: ParsedFile
  comments: Comment[]
  view: 'unified' | 'split'
  onAddComment: (payload: Omit<AddCommentPayload, 'prId'>) => Promise<void>
}

export default function DiffView({ file, comments, view, onAddComment }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const [selectionSide, setSelectionSide] = useState<'left' | 'right'>('right')
  const [showCommentBox, setShowCommentBox] = useState(false)

  function handleStartComment(diffLineNumber: number, side: 'left' | 'right'): void {
    setIsSelecting(true)
    setSelectionStart(diffLineNumber)
    setSelectionEnd(diffLineNumber)
    setSelectionSide(side)
  }

  function handleExtendComment(diffLineNumber: number): void {
    if (!isSelecting) return
    setSelectionEnd(diffLineNumber)
    setIsSelecting(false)
    setShowCommentBox(true)
  }

  async function handleSubmitComment(body: string): Promise<void> {
    if (selectionStart === null || selectionEnd === null) return
    const start = Math.min(selectionStart, selectionEnd)
    const end = Math.max(selectionStart, selectionEnd)
    const contextRaw = extractContext(file.lines, start, end)
    const contextLines = contextRaw.map((l) => ({
      line_number: l.diffLineNumber,
      type: l.type as 'added' | 'removed' | 'context',
      content: l.content,
    }))
    await onAddComment({
      filePath: file.newPath,
      startLine: start,
      endLine: end,
      side: selectionSide,
      body,
      contextLines,
    })
    setShowCommentBox(false)
    setSelectionStart(null)
    setSelectionEnd(null)
    setIsSelecting(false)
  }

  function handleCancelComment(): void {
    setShowCommentBox(false)
    setSelectionStart(null)
    setSelectionEnd(null)
    setIsSelecting(false)
  }

  return (
    <div className={styles.container}>
      <div className={styles.fileHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.toggle}>{expanded ? '▼' : '▶'}</span>
        <span className={styles.filePath}>{file.newPath}</span>
        {file.isNew && <span className={styles.badge} style={{ color: 'var(--added-text)' }}>Added</span>}
        {file.isDeleted && <span className={styles.badge} style={{ color: 'var(--removed-text)' }}>Deleted</span>}
        {file.isRenamed && <span className={styles.badge} style={{ color: '#d29922' }}>Renamed from {file.oldPath}</span>}
      </div>
      {expanded && (
        <div className={styles.body}>
          {view === 'unified' ? (
            <UnifiedDiff
              file={file}
              comments={comments}
              onStartComment={handleStartComment}
              onExtendComment={handleExtendComment}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
            />
          ) : (
            <SplitDiff
              file={file}
              comments={comments}
              onStartComment={handleStartComment}
              onExtendComment={handleExtendComment}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
            />
          )}
          {showCommentBox && (
            <CommentBox
              onSubmit={handleSubmitComment}
              onCancel={handleCancelComment}
              startLine={Math.min(selectionStart ?? 0, selectionEnd ?? 0)}
              endLine={Math.max(selectionStart ?? 0, selectionEnd ?? 0)}
            />
          )}
        </div>
      )}
    </div>
  )
}

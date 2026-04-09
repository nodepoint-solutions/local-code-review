import { useState } from 'react'
import type { AddCommentPayload, ReviewComment, ParsedFile } from '../../../../shared/types'
import { extractContext } from '../../../../shared/diff-utils'
import { getLanguageForFile } from '../../utils/syntax'
import UnifiedDiff from './UnifiedDiff'
import SplitDiff from './SplitDiff'
import CommentBox from '../CommentBox'
import styles from './DiffView.module.css'

interface Props {
  file: ParsedFile
  comments: ReviewComment[]
  view: 'unified' | 'split'
  onAddComment: (payload: Omit<AddCommentPayload, 'repoPath' | 'prId' | 'reviewId'>) => Promise<void>
}

function ChevronDownIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function DiffView({ file, comments, view, onAddComment }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const [hoverLine, setHoverLine] = useState<number | null>(null)
  const [selectionSide, setSelectionSide] = useState<'left' | 'right'>('right')
  const [showCommentBox, setShowCommentBox] = useState(false)

  const language = getLanguageForFile(file.newPath)

  const addedCount = file.lines.filter((l) => l.type === 'added').length
  const removedCount = file.lines.filter((l) => l.type === 'removed').length

  function handleStartComment(diffLineNumber: number, side: 'left' | 'right'): void {
    setIsSelecting(true)
    setSelectionStart(diffLineNumber)
    setSelectionEnd(null)
    setHoverLine(diffLineNumber)
    setSelectionSide(side)
    setShowCommentBox(false)
  }

  function handleExtendComment(diffLineNumber: number): void {
    if (!isSelecting) return
    setSelectionEnd(diffLineNumber)
    setIsSelecting(false)
    setShowCommentBox(true)
  }

  function handleHoverLine(lineNumber: number): void {
    setHoverLine(lineNumber)
  }

  async function handleSubmitComment(body: string): Promise<void> {
    if (selectionStart === null || selectionEnd === null) return
    const start = Math.min(selectionStart, selectionEnd)
    const end = Math.max(selectionStart, selectionEnd)
    const contextRaw = extractContext(file.lines, start, end)
    const context = contextRaw.map((l) => ({
      line: l.diffLineNumber,
      type: l.type as 'added' | 'removed' | 'context',
      content: l.content,
    }))
    await onAddComment({
      file: file.newPath,
      startLine: start,
      endLine: end,
      side: selectionSide,
      body,
      context,
    })
    setShowCommentBox(false)
    setSelectionStart(null)
    setSelectionEnd(null)
    setHoverLine(null)
    setIsSelecting(false)
  }

  function handleCancelComment(): void {
    setShowCommentBox(false)
    setSelectionStart(null)
    setSelectionEnd(null)
    setHoverLine(null)
    setIsSelecting(false)
  }

  function getFileName(path: string): string {
    return path.split('/').pop() ?? path
  }

  function getDirName(path: string): string {
    const parts = path.split('/')
    if (parts.length <= 1) return ''
    return parts.slice(0, -1).join('/') + '/'
  }

  return (
    <div className={styles.container}>
      <div className={styles.fileHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.chevron}>
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
        <span className={styles.filePath}>
          {getDirName(file.newPath) && (
            <span className={styles.fileDir}>{getDirName(file.newPath)}</span>
          )}
          <span className={styles.fileName}>{getFileName(file.newPath)}</span>
        </span>
        <div className={styles.fileStats}>
          {file.isNew && <span className={`${styles.badge} ${styles.badgeAdded}`}>Added</span>}
          {file.isDeleted && <span className={`${styles.badge} ${styles.badgeDeleted}`}>Deleted</span>}
          {file.isRenamed && (
            <span className={`${styles.badge} ${styles.badgeRenamed}`}>
              Renamed from {file.oldPath}
            </span>
          )}
          {!file.isNew && !file.isDeleted && (
            <span className={styles.diffStat}>
              {addedCount > 0 && <span className={styles.additions}>+{addedCount}</span>}
              {removedCount > 0 && <span className={styles.deletions}>−{removedCount}</span>}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className={styles.body}>
          {view === 'unified' ? (
            <UnifiedDiff
              file={file}
              comments={comments}
              language={language}
              onStartComment={handleStartComment}
              onExtendComment={handleExtendComment}
              onHoverLine={handleHoverLine}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
              selectionEnd={selectionEnd}
              hoverLine={hoverLine}
            />
          ) : (
            <SplitDiff
              file={file}
              comments={comments}
              language={language}
              onStartComment={handleStartComment}
              onExtendComment={handleExtendComment}
              onHoverLine={handleHoverLine}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
              selectionEnd={selectionEnd}
              hoverLine={hoverLine}
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

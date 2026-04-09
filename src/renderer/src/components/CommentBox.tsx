import { useState } from 'react'
import styles from './CommentBox.module.css'

interface Props {
  startLine: number
  endLine: number
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
}

export default function CommentBox({ startLine, endLine, onSubmit, onCancel }: Props): JSX.Element {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const lineLabel = startLine === endLine
    ? `Line ${startLine}`
    : `Lines ${startLine}–${endLine}`

  async function handleSubmit(): Promise<void> {
    if (!body.trim()) return
    setSubmitting(true)
    await onSubmit(body.trim())
    setSubmitting(false)
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') onCancel()
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
  }

  return (
    <div className={styles.box}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Comment on {lineLabel}</span>
        </div>
        <button className={styles.closeBtn} onClick={onCancel} title="Cancel (Esc)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Leave a comment…"
        rows={4}
        autoFocus
      />
      <div className={styles.footer}>
        <span className={styles.hint}>
          <kbd>⌘ Enter</kbd> to submit · <kbd>Esc</kbd> to cancel
        </span>
        <div className={styles.actions}>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={handleSubmit} disabled={submitting || !body.trim()}>
            {submitting ? 'Adding…' : 'Add comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

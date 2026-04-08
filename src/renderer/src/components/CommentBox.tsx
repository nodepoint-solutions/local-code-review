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

  async function handleSubmit(): Promise<void> {
    if (!body.trim()) return
    setSubmitting(true)
    await onSubmit(body.trim())
    setSubmitting(false)
  }

  return (
    <div className={styles.box}>
      <div className={styles.header}>
        Comment on lines {startLine}{startLine !== endLine ? `–${endLine}` : ''}
      </div>
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment…"
        rows={4}
        autoFocus
      />
      <div className={styles.actions}>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={handleSubmit} disabled={submitting || !body.trim()}>
          {submitting ? 'Saving…' : 'Add Comment'}
        </button>
      </div>
    </div>
  )
}

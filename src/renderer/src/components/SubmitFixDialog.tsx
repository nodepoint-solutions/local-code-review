import { useState } from 'react'
import type { PrDetail } from '../../../shared/types'
import styles from './SubmitFixDialog.module.css'

interface Props {
  assignee: 'claude' | 'copilot'
  commentCount: number
  repoPath: string
  prId: string
  reviewId: string
  onClose: () => void
  onUpdated: (detail: PrDetail | null) => void
}

const AGENT_LABEL = { claude: 'Claude Code', copilot: 'Copilot CLI' } as const

export default function SubmitFixDialog({
  assignee,
  commentCount,
  repoPath,
  prId,
  reviewId,
  onClose,
  onUpdated,
}: Props): JSX.Element {
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    // The launch/copy itself already succeeded by the time this runs, so a
    // failed or missing refresh just leaves the parent's PR detail as-is
    // rather than wiping it out from under the success UI.
    const updated = await window.api.getPr(repoPath, prId)
    if (updated && !('error' in updated)) {
      onUpdated(updated)
    }
  }

  async function handleStart(): Promise<void> {
    setStarting(true)
    setError('')
    const result = await window.api.launchFix(assignee, repoPath, prId, reviewId)
    if (result.error) {
      setError(result.error)
      setStarting(false)
      return
    }
    await refresh()
    onClose()
  }

  async function handleCopy(): Promise<void> {
    setError('')
    const result = await window.api.copyFixPrompt(repoPath, prId, reviewId)
    if (result.error) {
      setError(result.error)
      return
    }
    await refresh()
    setCopiedPrompt(result.prompt ?? '')
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label="Start fixing review comments">
      <div className={styles.dialog}>
        {copiedPrompt === null ? (
          <>
            <h3 className={styles.title}>Review submitted</h3>
            <p className={styles.body}>
              {AGENT_LABEL[assignee]} is assigned to fix {commentCount} comment
              {commentCount !== 1 ? 's' : ''}.
            </p>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <button onClick={onClose}>Later</button>
              <button onClick={handleCopy}>Copy prompt</button>
              <button className="primary" onClick={handleStart} disabled={starting}>
                {starting ? 'Starting…' : 'Start fix'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className={styles.title}>Prompt copied to clipboard</h3>
            <p className={styles.body}>
              Paste it into an agent session running in this repository to start the fix.
            </p>
            <div className={styles.actions}>
              <button onClick={() => navigator.clipboard.writeText(copiedPrompt)}>
                Copy again
              </button>
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

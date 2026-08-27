import { useState } from 'react'
import type { PrDetail } from '../../../shared/types'
import styles from './SubmitFixDialog.module.css'

interface Props {
  assignee: 'claude' | 'vscode'
  commentCount: number
  repoPath: string
  prId: string
  reviewId: string
  onClose: () => void
  onUpdated: (detail: PrDetail | null) => void
}

const AGENT_LABEL = { claude: 'Claude Code', vscode: 'Copilot (VS Code)' } as const

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
    const updated = await window.api.getPr(repoPath, prId)
    onUpdated(updated && 'error' in updated ? null : updated)
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
    if (result.prompt) {
      // VS Code path: the launch copies the prompt for pasting into the
      // agent tab, so the dialog stays open with the instructions.
      setCopiedPrompt(result.prompt)
      setStarting(false)
      return
    }
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
              {assignee === 'vscode'
                ? 'VS Code is opening. Switch to the Copilot agent tab and paste the prompt to start the fix.'
                : 'Paste it into a Claude Code session running in this repository to start the fix.'}
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

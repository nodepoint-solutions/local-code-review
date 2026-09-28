import type { PRListItem } from '../../../shared/types'
import type { WorkflowPhase } from '../../../shared/pr-workflow'
import styles from './PhaseChip.module.css'

// Shown for open PRs whose review has started, so a PR list answers "where
// does this PR sit in the cycle" without opening it
const PHASE_CHIPS: Partial<Record<WorkflowPhase, { label: string; className: string }>> = {
  reviewing: { label: 'Review in progress', className: styles.reviewing },
  reviewed: { label: 'Review submitted', className: styles.reviewed },
  in_fix: { label: 'Agent fixing', className: styles.reviewed },
  fix_complete: { label: 'Comments addressed', className: styles.complete },
}

interface Props {
  pr: Pick<PRListItem, 'status' | 'workflowPhase' | 'openComments'>
}

export default function PhaseChip({ pr }: Props): JSX.Element | null {
  const chip = PHASE_CHIPS[pr.workflowPhase]
  if (pr.status !== 'open' || !chip) return null
  return (
    <span className={`${styles.chip} ${chip.className}`}>
      {chip.label}
      {pr.openComments > 0 && <span className={styles.count}>{pr.openComments}</span>}
    </span>
  )
}

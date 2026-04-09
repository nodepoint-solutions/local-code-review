import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import type { PRFile } from '../../../shared/types'
import styles from './Repo.module.css'

function TrashIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function PRIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  )
}

function statusLabel(status: PRFile['status']): string {
  if (status === 'open') return 'Open'
  if (status === 'closed') return 'Closed'
  return status
}

export default function Repo(): JSX.Element {
  const { repoId } = useParams<{ repoId: string }>()
  const navigate = useNavigate()
  const { repos, setSelectedRepo } = useStore()
  const [prs, setPrs] = useState<PRFile[]>([])

  const repo = repos.find((r) => r.id === repoId)

  useEffect(() => {
    if (repo) {
      setSelectedRepo(repo)
      window.api.listPrs(repo.path).then(setPrs)
    }
  }, [repo?.id])

  async function handleClose(pr: PRFile): Promise<void> {
    if (!repo) return
    await window.api.closePr(repo.path, pr.id)
    setPrs(await window.api.listPrs(repo.path))
  }

  async function handleReopen(pr: PRFile): Promise<void> {
    if (!repo) return
    await window.api.reopenPr(repo.path, pr.id)
    setPrs(await window.api.listPrs(repo.path))
  }

  async function handleDelete(pr: PRFile): Promise<void> {
    if (!repo) return
    if (!window.confirm(`Delete "${pr.title}"?\n\nThis will permanently remove all review data for this PR and cannot be undone.`)) return
    await window.api.deletePr(repo.path, pr.id)
    setPrs(await window.api.listPrs(repo.path))
  }

  if (!repo) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Repository not found.</div>

  return (
    <div className={styles.page}>
      <NavBar
        crumbs={[{ label: repo.name }]}
        right={
          <button className="primary" onClick={() => navigate(`/repo/${repo.id}/open-pr`)}>
            <PlusIcon />
            New pull request
          </button>
        }
      />

      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <h2 className={styles.heading}>Pull Requests</h2>
          <span className={styles.count}>{prs.length}</span>
        </div>

        {prs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <PRIcon />
            </div>
            <h3 className={styles.emptyTitle}>No pull requests yet</h3>
            <p className={styles.emptyText}>Create a pull request to start reviewing changes between branches.</p>
            <button className="primary" onClick={() => navigate(`/repo/${repo.id}/open-pr`)}>
              <PlusIcon />
              New pull request
            </button>
          </div>
        ) : (
          <div className={styles.prList}>
            {prs.map((pr) => (
              <div
                key={pr.id}
                className={`${styles.prItem} ${pr.status === 'closed' ? styles.prItemClosed : ''}`}
              >
                <button
                  className={styles.prItemMain}
                  onClick={() => navigate(`/repo/${repo.id}/pr/${pr.id}`)}
                >
                  <div className={styles.prLeft}>
                    <div className={`${styles.prIconWrap} ${pr.status === 'closed' ? styles.prIconWrapClosed : ''}`}>
                      <PRIcon />
                    </div>
                  </div>
                  <div className={styles.prBody}>
                    <span className={styles.prTitle}>{pr.title}</span>
                    <div className={styles.prMeta}>
                      <code className={styles.branch}>{pr.compare_branch}</code>
                      <span className={styles.arrow}>→</span>
                      <code className={styles.branch}>{pr.base_branch}</code>
                    </div>
                  </div>
                </button>
                <div className={styles.prActions}>
                  <span className={`${styles.statusBadge} ${pr.status === 'open' ? styles.in_progress : styles.submitted}`}>
                    {statusLabel(pr.status)}
                  </span>
                  {pr.status === 'open' ? (
                    <button className={styles.prActionBtn} onClick={() => handleClose(pr)}>Close</button>
                  ) : (
                    <button className={styles.prActionBtn} onClick={() => handleReopen(pr)}>Reopen</button>
                  )}
                  <button className={`${styles.prActionBtn} ${styles.prActionDanger}`} onClick={() => handleDelete(pr)}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

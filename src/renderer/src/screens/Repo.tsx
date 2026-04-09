import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import type { PullRequest } from '../../../../shared/types'
import styles from './Repo.module.css'

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

function statusLabel(status: PullRequest['status']): string {
  if (status === 'in_progress') return 'In review'
  if (status === 'submitted') return 'Submitted'
  return status
}

export default function Repo(): JSX.Element {
  const { repoId } = useParams<{ repoId: string }>()
  const navigate = useNavigate()
  const { repos, setSelectedRepo } = useStore()
  const [prs, setPrs] = useState<PullRequest[]>([])

  const repo = repos.find((r) => r.id === repoId)

  useEffect(() => {
    if (repo) {
      setSelectedRepo(repo)
      window.api.listPrs(repo.id).then(setPrs)
    }
  }, [repo?.id])

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
              <button
                key={pr.id}
                className={styles.prItem}
                onClick={() => navigate(`/repo/${repo.id}/pr/${pr.id}`)}
              >
                <div className={styles.prLeft}>
                  <div className={styles.prIconWrap}>
                    <PRIcon />
                  </div>
                </div>
                <div className={styles.prBody}>
                  <div className={styles.prTop}>
                    <span className={styles.prTitle}>{pr.title}</span>
                    <span className={`${styles.statusBadge} ${styles[pr.status]}`}>
                      {statusLabel(pr.status)}
                    </span>
                  </div>
                  <div className={styles.prMeta}>
                    <code className={styles.branch}>{pr.compare_branch}</code>
                    <span className={styles.arrow}>→</span>
                    <code className={styles.branch}>{pr.base_branch}</code>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

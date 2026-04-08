import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import type { PullRequest } from '../../../../shared/types'
import styles from './Repo.module.css'

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
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/')}>← Repositories</button>
        <h2>{repo.name}</h2>
        <button className="primary" onClick={() => navigate(`/repo/${repo.id}/open-pr`)}>Open PR</button>
      </div>
      {prs.length === 0 ? (
        <div className={styles.empty}>No pull requests yet.</div>
      ) : (
        <ul className={styles.prList}>
          {prs.map((pr) => (
            <li key={pr.id} className={styles.prItem} onClick={() => navigate(`/repo/${repo.id}/pr/${pr.id}`)}>
              <span className={styles.prTitle}>{pr.title}</span>
              <span className={styles.prBranches}>
                <code>{pr.compare_branch}</code> → <code>{pr.base_branch}</code>
              </span>
              <span className={`${styles.prStatus} ${styles[pr.status]}`}>{pr.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

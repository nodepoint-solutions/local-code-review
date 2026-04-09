import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import styles from './Home.module.css'

function FolderIcon(): JSX.Element {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function RepoIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
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

function ChevronRightIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function Home(): JSX.Element {
  const navigate = useNavigate()
  const { repos, setRepos, setSelectedRepo } = useStore()

  useEffect(() => {
    window.api.listRepos().then(setRepos)
  }, [])

  async function handleOpenRepo(): Promise<void> {
    const result = await window.api.openRepo()
    if (result.error === 'not-a-git-repo') {
      alert('Selected folder is not a git repository.')
      return
    }
    if (result.repo) {
      const updated = await window.api.listRepos()
      setRepos(updated)
    }
  }

  function handleSelectRepo(repo: typeof repos[0]): void {
    setSelectedRepo(repo)
    navigate(`/repo/${repo.id}`)
  }

  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.heading}>Repositories</h1>
            <p className={styles.subheading}>Select a local git repository to start reviewing pull requests.</p>
          </div>
          <button className="primary" onClick={handleOpenRepo}>
            <PlusIcon />
            Add repository
          </button>
        </div>

        {repos.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <FolderIcon />
            </div>
            <h3 className={styles.emptyTitle}>No repositories yet</h3>
            <p className={styles.emptyText}>
              Add a local git repository to start reviewing pull requests offline.
            </p>
            <button className="primary" onClick={handleOpenRepo}>
              <PlusIcon />
              Add repository
            </button>
          </div>
        ) : (
          <div className={styles.repoList}>
            {repos.map((repo) => (
              <button
                key={repo.id}
                className={styles.repoItem}
                onClick={() => handleSelectRepo(repo)}
              >
                <div className={styles.repoIcon}>
                  <RepoIcon />
                </div>
                <div className={styles.repoInfo}>
                  <span className={styles.repoName}>{repo.name}</span>
                  <span className={styles.repoPath}>{repo.path}</span>
                </div>
                <ChevronRightIcon />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import styles from './Home.module.css'

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
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Local PR Reviewer</h1>
        <button className="primary" onClick={handleOpenRepo}>Open Repository</button>
      </div>
      {repos.length === 0 ? (
        <div className={styles.empty}>
          <p>No repositories yet. Open a local git repository to get started.</p>
        </div>
      ) : (
        <ul className={styles.repoList}>
          {repos.map((repo) => (
            <li key={repo.id} className={styles.repoItem} onClick={() => handleSelectRepo(repo)}>
              <span className={styles.repoName}>{repo.name}</span>
              <span className={styles.repoPath}>{repo.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

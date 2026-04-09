import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import type { RepositoryWithMeta, DiscoveredRepo } from '../../../../shared/types'
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

function SearchIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function matches(item: { name: string; path: string }, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
}

export default function Home(): JSX.Element {
  const navigate = useNavigate()
  const {
    repos, setRepos, setSelectedRepo,
    scanResults, setScanResults,
    scanInProgress, setScanInProgress,
  } = useStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [onboardingComplete, setOnboardingComplete] = useState(true)
  const [baseDirSet, setBaseDirSet] = useState(false)

  useEffect(() => {
    window.api.listRepos().then(setRepos)

    window.api.getSetting('onboarding_complete').then((val) => {
      setOnboardingComplete(val === 'true')
    })

    window.api.getSetting('scan_base_dir').then((baseDir) => {
      const hasDir = !!baseDir
      setBaseDirSet(hasDir)
      if (hasDir && !scanInProgress) {
        setScanInProgress(true)
        window.api.scanRepos().then((results) => {
          setScanResults(results)
          setScanInProgress(false)
        })
      }
    })
  }, [])

  const knownPaths = new Set(repos.map((r) => r.path))
  const q = searchQuery

  const myRepos = repos.filter((r) => r.pr_count > 0 && matches(r, q))
  const recentRepos = repos
    .filter((r) => r.pr_count === 0 && r.last_visited_at && matches(r, q))
    .slice(0, 5)
  const discoveredRepos = scanResults
    .filter((r) => !knownPaths.has(r.path) && matches(r, q))
    .sort((a, b) => a.name.localeCompare(b.name))

  const showOnboarding = !onboardingComplete && repos.length === 0 && !baseDirSet
  const showScanHint = !baseDirSet && repos.length > 0 && onboardingComplete
  const hasAnyContent = myRepos.length > 0 || recentRepos.length > 0 || discoveredRepos.length > 0

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

  async function handleConfigureScanDir(): Promise<void> {
    const result = await window.api.openScanDirPicker()
    if (!result) return
    await window.api.setSetting('scan_base_dir', result)
    await window.api.setSetting('onboarding_complete', 'true')
    setBaseDirSet(true)
    setOnboardingComplete(true)
    setScanInProgress(true)
    const results = await window.api.scanRepos()
    setScanResults(results)
    setScanInProgress(false)
    const updated = await window.api.listRepos()
    setRepos(updated)
  }

  async function dismissed(): Promise<void> {
    await window.api.setSetting('onboarding_complete', 'true')
    setOnboardingComplete(true)
  }

  async function handleDiscoveredRepo(discovered: DiscoveredRepo): Promise<void> {
    const result = await window.api.addRepoByPath(discovered.path)
    if (result.error === 'not-a-git-repo') {
      alert('This directory is no longer a valid git repository.')
      return
    }
    if (result.repo) {
      const updated = await window.api.listRepos()
      setRepos(updated)
      setSelectedRepo(updated.find((r) => r.id === result.repo!.id) ?? null)
      navigate(`/repo/${result.repo.id}`)
    }
  }

  function handleSelectRepo(repo: RepositoryWithMeta): void {
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
          <button onClick={handleOpenRepo}>
            <PlusIcon />
            Add repository
          </button>
        </div>

        {showOnboarding && (
          <div className={styles.onboardingCard}>
            <h2 className={styles.onboardingTitle}>Auto-discover your repositories</h2>
            <p className={styles.onboardingText}>
              Set a scan directory and we'll find your local git repos automatically.
              This is optional — you can always add repos manually instead.
            </p>
            <div className={styles.onboardingActions}>
              <button className="primary" onClick={handleConfigureScanDir}>
                Set scan directory
              </button>
              <button onClick={dismissed}>Skip, add manually</button>
            </div>
          </div>
        )}

        {showScanHint && (
          <div className={styles.scanHint}>
            <span>Set a scan directory to auto-discover repos</span>
            <button onClick={handleConfigureScanDir}>Configure</button>
          </div>
        )}

        {(repos.length > 0 || scanResults.length > 0) && (
          <div className={styles.searchBar}>
            <span className={styles.searchIcon}><SearchIcon /></span>
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {!showOnboarding && repos.length === 0 && scanResults.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><FolderIcon /></div>
            <h3 className={styles.emptyTitle}>No repositories yet</h3>
            <p className={styles.emptyText}>
              Add a local git repository to start reviewing pull requests offline.
            </p>
            <button className="primary" onClick={handleOpenRepo}>
              <PlusIcon />
              Add repository
            </button>
          </div>
        )}

        {searchQuery && !hasAnyContent && (repos.length > 0 || scanResults.length > 0) && (
          <div className={styles.noResults}>No repositories match &ldquo;{searchQuery}&rdquo;</div>
        )}

        {myRepos.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeadingRow}>
              <span className={styles.sectionHeading}>My Repos</span>
            </div>
            <div className={styles.repoList}>
              {myRepos.map((repo) => (
                <button
                  key={repo.id}
                  className={styles.repoItem}
                  onClick={() => handleSelectRepo(repo)}
                >
                  <div className={styles.repoIcon}><RepoIcon /></div>
                  <div className={styles.repoInfo}>
                    <span className={styles.repoName}>{repo.name}</span>
                    <span className={styles.repoPath}>{repo.path}</span>
                  </div>
                  <span className={styles.repoBadge}>{repo.pr_count} PR{repo.pr_count !== 1 ? 's' : ''}</span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </div>
        )}

        {recentRepos.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeadingRow}>
              <span className={styles.sectionHeading}>Recent</span>
            </div>
            <div className={styles.repoList}>
              {recentRepos.map((repo) => (
                <button
                  key={repo.id}
                  className={styles.repoItem}
                  onClick={() => handleSelectRepo(repo)}
                >
                  <div className={styles.repoIcon}><RepoIcon /></div>
                  <div className={styles.repoInfo}>
                    <span className={styles.repoName}>{repo.name}</span>
                    <span className={styles.repoPath}>{repo.path}</span>
                  </div>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </div>
        )}

        {(discoveredRepos.length > 0 || scanInProgress) && (
          <div className={styles.section}>
            <div className={styles.sectionHeadingRow}>
              <span className={styles.sectionHeading}>Discovered</span>
              {scanInProgress && <span className={styles.spinner} />}
            </div>
            {discoveredRepos.length > 0 && (
              <div className={styles.repoList}>
                {discoveredRepos.map((repo) => (
                  <button
                    key={repo.path}
                    className={`${styles.repoItem} ${styles.repoItemDiscovered}`}
                    onClick={() => handleDiscoveredRepo(repo)}
                  >
                    <div className={`${styles.repoIcon} ${styles.repoIconDiscovered}`}><RepoIcon /></div>
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
        )}
      </div>
    </div>
  )
}

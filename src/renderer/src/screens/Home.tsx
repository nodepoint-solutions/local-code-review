import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import type { DiscoveredRepo, RepoActivity, Repository } from '../../../shared/types'
import styles from './Home.module.css'

function FolderIcon(): JSX.Element {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function RepoIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function SearchIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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

interface RepoRowProps {
  name: string
  path: string
  discovered?: boolean
  badge?: string
  onOpen: () => void
}

function RepoRow({ name, path, discovered, badge, onOpen }: RepoRowProps): JSX.Element {
  return (
    <button
      className={`${styles.repoItem} ${discovered ? styles.repoItemDiscovered : ''}`}
      onClick={onOpen}
    >
      <div className={`${styles.repoIcon} ${discovered ? styles.repoIconDiscovered : ''}`}>
        <RepoIcon />
      </div>
      <div className={styles.repoInfo}>
        <span className={styles.repoName}>{name}</span>
        <span className={styles.repoPath}>{path}</span>
      </div>
      {badge && <span className={styles.repoBadge}>{badge}</span>}
      <ChevronRightIcon />
    </button>
  )
}

export default function Home(): JSX.Element {
  const navigate = useNavigate()
  const {
    setRepos,
    setSelectedRepo,
    scanResults,
    setScanResults,
    scanInProgress,
    setScanInProgress,
  } = useStore()

  // Repositories and their PR activity update as one snapshot, so that a
  // repository never renders under Discovered before its activity arrives
  const [{ repos, repoActivity }, setSnapshot] = useState<{
    repos: Repository[]
    repoActivity: RepoActivity[]
  }>({ repos: [], repoActivity: [] })
  const [searchQuery, setSearchQuery] = useState('')
  const [onboardingComplete, setOnboardingComplete] = useState(true)
  const [baseDirSet, setBaseDirSet] = useState(false)

  async function reloadActivity(): Promise<void> {
    const activity = await window.api.listRepoActivity()
    setSnapshot((current) => ({ ...current, repoActivity: activity }))
  }

  // repos:list registers scanned and agent-adopted repositories first, so the
  // activity loads after it and includes theirs
  async function reload(): Promise<Repository[]> {
    const updated = await window.api.listRepos()
    const activity = await window.api.listRepoActivity()
    setSnapshot({ repos: updated, repoActivity: activity })
    setRepos(updated)
    return updated
  }

  useEffect(() => {
    reload()

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

    // A repository an agent opened its first PR in appears here straight away
    const offReposChanged = window.api.onReposChanged(reload)
    // Agents open, close and review PRs through MCP, so the list reloads on
    // their events rather than only on mount
    const offPrUpdated = window.api.onPrUpdated(reloadActivity)
    return () => {
      offReposChanged()
      offPrUpdated()
    }
  }, [])

  const knownPaths = new Set(repos.map((r) => r.path))
  const reviewedIds = new Set(repoActivity.map((r) => r.id))
  const q = searchQuery

  // Each repository sits on one list: with an open PR under Active, with only
  // closed PRs under Recent, and without PRs under Discovered
  const activeRepos = repoActivity.filter((r) => r.open_pr_count > 0 && matches(r, q))
  const recentRepos = repoActivity.filter((r) => r.open_pr_count === 0 && matches(r, q))
  const discoveredRepos: Array<{ name: string; path: string; repo?: Repository }> = [
    ...repos.filter((r) => !reviewedIds.has(r.id)).map((r) => ({ ...r, repo: r })),
    ...scanResults.filter((r) => !knownPaths.has(r.path)),
  ]
    .filter((r) => matches(r, q))
    .sort((a, b) => a.name.localeCompare(b.name))

  const showOnboarding = !onboardingComplete && repos.length === 0 && !baseDirSet
  const showScanHint = !baseDirSet && repos.length > 0
  const hasAnyContent =
    activeRepos.length > 0 || recentRepos.length > 0 || discoveredRepos.length > 0

  async function handleOpenRepo(): Promise<void> {
    const result = await window.api.openRepo()
    if (result.error === 'not-a-git-repo') {
      alert('Selected folder is not a git repository.')
      return
    }
    if (result.repo) {
      await reload()
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
    await reload()
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
      const updated = await reload()
      setSelectedRepo(updated.find((r) => r.id === result.repo!.id) ?? null)
      navigate(`/repo/${result.repo.id}`)
    }
  }

  function handleSelectRepo(repo: Repository): void {
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
            <p className={styles.subheading}>
              Select a local git repository to start reviewing pull requests.
            </p>
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
              Set a scan directory and we'll find your local git repos automatically. This is
              optional — you can always add repos manually instead.
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
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
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
        )}

        {searchQuery && !hasAnyContent && (repos.length > 0 || scanResults.length > 0) && (
          <div className={styles.noResults}>Nothing matches &ldquo;{searchQuery}&rdquo;</div>
        )}

        {activeRepos.length > 0 && (
          <section className={styles.section} aria-labelledby="home-active">
            <div className={styles.sectionHeadingRow}>
              <h2 id="home-active" className={styles.sectionHeading}>
                Active repositories
              </h2>
            </div>
            <div className={styles.repoList}>
              {activeRepos.map((repo) => (
                <RepoRow
                  key={repo.id}
                  name={repo.name}
                  path={repo.path}
                  badge={`${repo.open_pr_count} open PR${repo.open_pr_count !== 1 ? 's' : ''}`}
                  onOpen={() => handleSelectRepo(repo)}
                />
              ))}
            </div>
          </section>
        )}

        {recentRepos.length > 0 && (
          <section className={styles.section} aria-labelledby="home-recent">
            <div className={styles.sectionHeadingRow}>
              <h2 id="home-recent" className={styles.sectionHeading}>
                Recent
              </h2>
            </div>
            <div className={styles.repoList}>
              {recentRepos.map((repo) => (
                <RepoRow
                  key={repo.id}
                  name={repo.name}
                  path={repo.path}
                  onOpen={() => handleSelectRepo(repo)}
                />
              ))}
            </div>
          </section>
        )}

        {(discoveredRepos.length > 0 || scanInProgress) && (
          <section className={styles.section} aria-labelledby="home-discovered">
            <div className={styles.sectionHeadingRow}>
              <h2 id="home-discovered" className={styles.sectionHeading}>
                Discovered
              </h2>
              {scanInProgress && <span className={styles.spinner} />}
            </div>
            {discoveredRepos.length > 0 && (
              <div className={styles.repoList}>
                {discoveredRepos.map(({ name, path, repo }) => (
                  <RepoRow
                    key={path}
                    name={name}
                    path={path}
                    discovered
                    onOpen={() =>
                      repo ? handleSelectRepo(repo) : handleDiscoveredRepo({ name, path })
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

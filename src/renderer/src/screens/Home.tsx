import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import PhaseChip from '../components/PhaseChip'
import { formatRelativeTime } from '../utils/formatTime'
import type { ActivePrItem, DiscoveredRepo, Repository, ReviewedRepo } from '../../../shared/types'
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

function PRIcon(): JSX.Element {
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
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
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

function XIcon(): JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

function prMatches(pr: ActivePrItem, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return pr.title.toLowerCase().includes(q) || pr.repoName.toLowerCase().includes(q)
}

interface RepoRowProps {
  name: string
  path: string
  discovered?: boolean
  onOpen: () => void
  onRemove?: () => void
}

function RepoRow({ name, path, discovered, onOpen, onRemove }: RepoRowProps): JSX.Element {
  return (
    <div className={`${styles.repoItem} ${discovered ? styles.repoItemDiscovered : ''}`}>
      <button className={styles.repoItemMain} onClick={onOpen}>
        <div className={`${styles.repoIcon} ${discovered ? styles.repoIconDiscovered : ''}`}>
          <RepoIcon />
        </div>
        <div className={styles.repoInfo}>
          <span className={styles.repoName}>{name}</span>
          <span className={styles.repoPath}>{path}</span>
        </div>
        <ChevronRightIcon />
      </button>
      {onRemove && (
        <button
          className={styles.repoRemoveBtn}
          title="Remove from list"
          aria-label={`Remove ${name} from list`}
          onClick={onRemove}
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}

export default function Home(): JSX.Element {
  const navigate = useNavigate()
  const {
    repos,
    setRepos,
    setSelectedRepo,
    scanResults,
    setScanResults,
    scanInProgress,
    setScanInProgress,
  } = useStore()

  const [activePrs, setActivePrs] = useState<ActivePrItem[]>([])
  const [reviewedRepos, setReviewedRepos] = useState<ReviewedRepo[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [onboardingComplete, setOnboardingComplete] = useState(true)
  const [baseDirSet, setBaseDirSet] = useState(false)

  async function reloadPrLists(): Promise<void> {
    const [active, reviewed] = await Promise.all([
      window.api.listActivePrs(),
      window.api.listReviewedRepos(),
    ])
    setActivePrs(active)
    setReviewedRepos(reviewed)
  }

  // repos:list registers scanned and agent-adopted repositories first, so the
  // PR lists load after it and include theirs
  async function reload(): Promise<Repository[]> {
    const updated = await window.api.listRepos()
    setRepos(updated)
    await reloadPrLists()
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
    const offPrUpdated = window.api.onPrUpdated(reloadPrLists)
    return () => {
      offReposChanged()
      offPrUpdated()
    }
  }, [])

  const knownPaths = new Set(repos.map((r) => r.path))
  const reviewedIds = new Set([
    ...activePrs.map((pr) => pr.repoId),
    ...reviewedRepos.map((r) => r.id),
  ])
  const q = searchQuery

  // Each repository sits on one list: with an open PR it shows through its
  // PRs, with only closed PRs under Recent, and without PRs under Discovered
  const visibleActivePrs = activePrs.filter((pr) => prMatches(pr, q))
  const recentRepos = reviewedRepos.filter((r) => matches(r, q))
  const discoveredRepos: Array<{ name: string; path: string; repo?: Repository }> = [
    ...repos.filter((r) => !reviewedIds.has(r.id)).map((r) => ({ ...r, repo: r })),
    ...scanResults.filter((r) => !knownPaths.has(r.path)),
  ]
    .filter((r) => matches(r, q))
    .sort((a, b) => a.name.localeCompare(b.name))

  const showOnboarding = !onboardingComplete && repos.length === 0 && !baseDirSet
  const showScanHint = !baseDirSet && repos.length > 0
  const hasAnyContent =
    visibleActivePrs.length > 0 || recentRepos.length > 0 || discoveredRepos.length > 0

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

  async function handleRemoveRepo(repo: Repository): Promise<void> {
    const confirmed = window.confirm(
      `Remove "${repo.name}" from Local Code Review?\n\nReview data in ${repo.path}/.reviews stays on disk, and you can add the repository again at any time.`
    )
    if (!confirmed) return
    const result = await window.api.removeRepo(repo.path)
    if (result.error) {
      alert(`Could not remove repository: ${result.error}`)
      return
    }
    await reload()
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
              placeholder="Search pull requests and repositories..."
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

        {visibleActivePrs.length > 0 && (
          <section className={styles.section} aria-labelledby="home-active">
            <div className={styles.sectionHeadingRow}>
              <h2 id="home-active" className={styles.sectionHeading}>
                Active pull requests
              </h2>
            </div>
            <div className={styles.repoList}>
              {visibleActivePrs.map((pr) => (
                <button
                  key={`${pr.repoId}/${pr.id}`}
                  className={styles.repoItem}
                  onClick={() => navigate(`/repo/${pr.repoId}/pr/${pr.id}`)}
                >
                  <div className={styles.repoIcon}>
                    <PRIcon />
                  </div>
                  <div className={styles.repoInfo}>
                    <span className={styles.repoName}>{pr.title}</span>
                    <span className={styles.prMeta}>
                      <span className={styles.prRepo}>{pr.repoName}</span>
                      <code className={styles.branch}>{pr.compare_branch}</code>
                      <span className={styles.arrow}>→</span>
                      <code className={styles.branch}>{pr.base_branch}</code>
                      <span>· opened {formatRelativeTime(pr.created_at)}</span>
                    </span>
                  </div>
                  <PhaseChip pr={pr} />
                  <ChevronRightIcon />
                </button>
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
                  onRemove={() => handleRemoveRepo(repo)}
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
                    onRemove={repo && (() => handleRemoveRepo(repo))}
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

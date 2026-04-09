import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import StaleBanner from '../components/StaleBanner'
import FileTree from '../components/FileTree'
import DiffView from '../components/DiffView'
import ReviewPanel from '../components/ReviewPanel'
import type { AddCommentPayload, Commit, ParsedFile } from '../../../shared/types'
import styles from './PR.module.css'

type Tab = 'overview' | 'commits' | 'files'

function UnifiedIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function SplitIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  )
}

function ReviewIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCommitTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = Date.now()
  const diff = now - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function PR(): JSX.Element {
  const { repoId, prId } = useParams<{ repoId: string; prId: string }>()
  const navigate = useNavigate()
  const { repos, prDetail, setPrDetail, diffView, setDiffView, reviewPanelOpen, setReviewPanelOpen } = useStore()
  const repo = repos.find((r) => r.id === repoId)
  const [tab, setTab] = useState<Tab>('overview')
  const [refreshing, setRefreshing] = useState(false)
  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null)
  const [commitDiff, setCommitDiff] = useState<ParsedFile[] | null>(null)
  const [commitDiffLoading, setCommitDiffLoading] = useState(false)
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (repo && prId) {
      window.api.getPr(prId, repo.path).then((result) => {
        if (result && 'error' in result) return
        setPrDetail(result as any)
      })
    }
    return () => setPrDetail(null)
  }, [prId, repo?.path])

  useEffect(() => {
    if (tab === 'commits' && commits === null && repo && prId) {
      setCommitsLoading(true)
      window.api.listCommits(prId, repo.path).then((result) => {
        if (!Array.isArray(result)) { setCommits([]); return }
        setCommits(result)
        setCommitsLoading(false)
      })
    }
  }, [tab, prId, repo?.path])

  function handleSelectCommit(commit: Commit): void {
    if (selectedCommit?.hash === commit.hash) {
      setSelectedCommit(null)
      setCommitDiff(null)
      return
    }
    setSelectedCommit(commit)
    setCommitDiff(null)
    setCommitDiffLoading(true)
    window.api.showCommit(repo!.path, commit.hash).then((result) => {
      if ('error' in result) { setCommitDiffLoading(false); return }
      setCommitDiff(result.diff)
      setCommitDiffLoading(false)
    })
  }

  async function handleRefresh(): Promise<void> {
    if (!repo || !prId) return
    setRefreshing(true)
    const updated = await window.api.refreshPr(prId, repo.path)
    if (updated && 'error' in updated) { setRefreshing(false); return }
    setPrDetail(updated as any)
    setCommits(null) // invalidate commits cache on refresh
    setRefreshing(false)
  }

  async function handleAddComment(payload: Omit<AddCommentPayload, 'prId'>): Promise<void> {
    if (!repo || !prId || !prDetail) return
    await window.api.addComment({ ...payload, prId, repoPath: repo.path })
    const updated = await window.api.getPr(prId, repo.path)
    setPrDetail(updated)
  }

  function scrollToFile(filePath: string): void {
    fileRefs.current[filePath]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!prDetail) {
    return (
      <div className={styles.loadingPage}>
        <NavBar crumbs={repo ? [{ label: repo.name, to: `/repo/${repoId}` }] : []} />
        <div className={styles.loading}>Loading…</div>
      </div>
    )
  }

  const { pr, diff, review, comments, isStale } = prDetail
  const activeComments = comments.filter((c) => !c.is_stale)

  return (
    <div className={styles.page}>
      <NavBar
        crumbs={[
          { label: repo?.name ?? 'Repo', to: `/repo/${repoId}` },
          { label: pr.title },
        ]}
        right={
          <button
            className={`${styles.reviewBtn} ${reviewPanelOpen ? styles.reviewBtnActive : ''}`}
            onClick={() => setReviewPanelOpen(!reviewPanelOpen)}
          >
            <ReviewIcon />
            Review
            {activeComments.length > 0 && (
              <span className={styles.commentCount}>{activeComments.length}</span>
            )}
          </button>
        }
      />

      {isStale && <StaleBanner onRefresh={handleRefresh} loading={refreshing} />}

      {/* PR header */}
      <div className={styles.prHeader}>
        <div className={styles.prTitleRow}>
          <h1 className={styles.prTitle}>{pr.title}</h1>
          <span className={`${styles.statusBadge} ${styles[pr.status]}`}>{pr.status === 'in_progress' ? 'Open' : 'Submitted'}</span>
        </div>
        <div className={styles.prMeta}>
          <code className={styles.branch}>{pr.compare_branch}</code>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
          <code className={styles.branch}>{pr.base_branch}</code>
          <span className={styles.metaDot}>·</span>
          <span className={styles.metaText}>opened {formatRelativeTime(pr.created_at)}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        <div className={styles.tabs}>
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'commits', label: 'Commits' },
            { key: 'files', label: 'Files changed', count: diff.length },
          ] as { key: Tab; label: string; count?: number }[]).map(({ key, label, count }) => (
            <button
              key={key}
              className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
              {count !== undefined && <span className={styles.tabCount}>{count}</span>}
            </button>
          ))}
        </div>
        {tab === 'files' && (
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${diffView === 'unified' ? styles.toggleActive : ''}`}
              onClick={() => setDiffView('unified')}
              title="Unified diff"
            ><UnifiedIcon /></button>
            <button
              className={`${styles.toggleBtn} ${diffView === 'split' ? styles.toggleActive : ''}`}
              onClick={() => setDiffView('split')}
              title="Split diff"
            ><SplitIcon /></button>
          </div>
        )}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className={styles.overview}>
          <div className={styles.overviewMain}>
            <div className={styles.descriptionCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Description</span>
              </div>
              {pr.description ? (
                <div className={styles.descriptionBody}>{pr.description}</div>
              ) : (
                <div className={styles.descriptionEmpty}>No description provided.</div>
              )}
            </div>
          </div>

          <div className={styles.overviewSidebar}>
            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Status</div>
              <div className={styles.sidebarValue}>
                <span className={`${styles.statusBadge} ${styles[pr.status]}`}>
                  {pr.status === 'in_progress' ? 'Open' : 'Submitted'}
                </span>
              </div>
            </div>

            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Branches</div>
              <div className={styles.branchStack}>
                <div className={styles.branchRow}>
                  <span className={styles.branchLabel}>base</span>
                  <code className={styles.branchCode}>{pr.base_branch}</code>
                </div>
                <div className={styles.branchRow}>
                  <span className={styles.branchLabel}>compare</span>
                  <code className={styles.branchCode}>{pr.compare_branch}</code>
                </div>
              </div>
            </div>

            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Changes</div>
              <div className={styles.sidebarValue}>
                <span className={styles.filesChanged}>{diff.length} file{diff.length !== 1 ? 's' : ''} changed</span>
              </div>
              <div className={styles.diffStatBar}>
                {(() => {
                  const added = diff.reduce((n, f) => n + f.lines.filter((l) => l.type === 'added').length, 0)
                  const removed = diff.reduce((n, f) => n + f.lines.filter((l) => l.type === 'removed').length, 0)
                  const total = added + removed || 1
                  return (
                    <>
                      <span className={styles.diffStatAdded} style={{ width: `${(added / total) * 100}%` }} />
                      <span className={styles.diffStatRemoved} style={{ width: `${(removed / total) * 100}%` }} />
                      <span className={styles.diffStatNeutral} style={{ width: `${Math.max(0, 100 - (added / total) * 100 - (removed / total) * 100)}%` }} />
                    </>
                  )
                })()}
              </div>
              <div className={styles.diffStatNums}>
                <span className={styles.additions}>+{diff.reduce((n, f) => n + f.lines.filter((l) => l.type === 'added').length, 0)}</span>
                <span className={styles.deletions}>−{diff.reduce((n, f) => n + f.lines.filter((l) => l.type === 'removed').length, 0)}</span>
              </div>
            </div>

            {review && (
              <div className={styles.sidebarSection}>
                <div className={styles.sidebarLabel}>Review</div>
                <div className={styles.sidebarValue}>
                  <span className={`${styles.reviewStatus} ${review.status === 'submitted' ? styles.reviewSubmitted : styles.reviewInProgress}`}>
                    {review.status === 'submitted' ? 'Submitted' : 'In progress'}
                  </span>
                </div>
                {activeComments.length > 0 && (
                  <div className={styles.commentSummary}>{activeComments.length} comment{activeComments.length !== 1 ? 's' : ''}</div>
                )}
              </div>
            )}

            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Created</div>
              <div className={styles.sidebarValue}>
                <time className={styles.metaText}>{new Date(pr.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Commits tab ── */}
      {tab === 'commits' && (
        <div className={styles.commitsLayout}>
          <div className={styles.commitsPane}>
            {commitsLoading || commits === null ? (
              <div className={styles.loading}>Loading commits…</div>
            ) : commits.length === 0 ? (
              <div className={styles.emptyState}>No commits found in this range.</div>
            ) : (
              <div className={styles.commitList}>
                {commits.map((commit, idx) => (
                  <div
                    key={commit.hash}
                    className={`${styles.commitItem} ${selectedCommit?.hash === commit.hash ? styles.commitItemActive : ''}`}
                    onClick={() => handleSelectCommit(commit)}
                  >
                    <div className={styles.commitLeft}>
                      <div className={styles.commitAvatar}>{getInitials(commit.authorName)}</div>
                      {idx < commits.length - 1 && <div className={styles.commitLine} />}
                    </div>
                    <div className={styles.commitBody}>
                      <div className={styles.commitSubject}>{commit.subject}</div>
                      <div className={styles.commitMeta}>
                        <span className={styles.commitAuthor}>{commit.authorName}</span>
                        <span className={styles.metaDot}>·</span>
                        <span className={styles.commitTime}>{formatCommitTime(commit.timestamp)}</span>
                        <span className={styles.metaDot}>·</span>
                        <code className={styles.commitHash}>{commit.shortHash}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedCommit && (
            <div className={styles.commitSidebar}>
              <div className={styles.commitSidebarHeader}>
                <div className={styles.commitSidebarTitle}>
                  <code className={styles.commitHash}>{selectedCommit.shortHash}</code>
                  <span className={styles.commitSubjectSmall}>{selectedCommit.subject}</span>
                </div>
                <button className={styles.closeSidebarBtn} onClick={() => { setSelectedCommit(null); setCommitDiff(null) }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className={styles.commitSidebarBody}>
                {commitDiffLoading ? (
                  <div className={styles.loading}>Loading diff…</div>
                ) : commitDiff && commitDiff.length === 0 ? (
                  <div className={styles.emptyState}>No file changes in this commit.</div>
                ) : (
                  (commitDiff ?? []).map((file) => (
                    <DiffView
                      key={file.newPath}
                      file={file}
                      comments={[]}
                      view="unified"
                      onAddComment={async () => {}}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Files tab ── */}
      {tab === 'files' && (
        <div className={`${styles.filesBody} ${reviewPanelOpen ? styles.bodyShifted : ''}`}>
          <FileTree files={diff} onSelect={scrollToFile} />
          <div className={styles.diffPane}>
            {diff.map((file) => (
              <div key={file.newPath} ref={(el) => { fileRefs.current[file.newPath] = el }}>
                <DiffView
                  file={file}
                  comments={comments.filter((c) => c.file_path === file.newPath)}
                  view={diffView}
                  onAddComment={handleAddComment}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewPanelOpen && (
        <ReviewPanel
          review={review}
          comments={comments}
          prId={prId!}
          onClose={() => setReviewPanelOpen(false)}
          onSubmitted={(updated: typeof prDetail) => setPrDetail(updated)}
          repoPath={repo?.path ?? ''}
        />
      )}
    </div>
  )
}

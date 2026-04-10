import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import StaleBanner from '../components/StaleBanner'
import FileTree from '../components/FileTree'
import DiffView from '../components/DiffView'
import ReviewPanel from '../components/ReviewPanel'
import ReviewTimeline from '../components/ReviewTimeline'
import PreviousReviews from '../components/PreviousReviews'
import CommentNav from '../components/CommentNav'
import CommentOutline from '../components/CommentOutline'
import { sortCommentsByPosition } from '../utils/sortComments'
import type { AddCommentPayload, ReviewComment, Commit, ParsedFile, PrDetail, IntegrationStatus } from '../../../shared/types'
import { PRWorkflow } from '../../../shared/pr-workflow'
import { formatRelativeTime } from '../utils/formatTime'
import styles from './PR.module.css'

type Tab = 'overview' | 'commits' | 'files' | 'previous-reviews'

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

function getAssigneeStatus(
  integrations: IntegrationStatus[],
  ids: IntegrationStatus['id'][]
): 'configured' | 'not-configured' | 'not-installed' {
  const tools = integrations.filter((i) => ids.includes(i.id))
  if (tools.some((i) => i.detected && i.installed && i.skillInstalled)) return 'configured'
  if (tools.some((i) => i.detected && i.installed)) return 'not-configured'
  return 'not-installed'
}

const ASSIGNEE_OPTIONS: { key: 'claude' | 'vscode'; label: string; ids: IntegrationStatus['id'][] }[] = [
  { key: 'claude', label: 'Claude Code', ids: ['claudeCode', 'claudeDesktop'] },
  { key: 'vscode', label: 'Copilot (VS Code)', ids: ['vscode', 'cursor', 'windsurf'] },
]

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
  const [focusedCommentIndex, setFocusedCommentIndex] = useState(-1)
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = React.useState(false)
  const [integrations, setIntegrations] = React.useState<IntegrationStatus[]>([])
  const [notification, setNotification] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [treeWidth, setTreeWidth] = useState(() => {
    const saved = localStorage.getItem('fileTreeWidth')
    return saved ? parseInt(saved, 10) : 280
  })
  const treePanelRef = useRef<HTMLDivElement | null>(null)
  const diffPaneRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!dragging.current || !treePanelRef.current) return
      const delta = e.clientX - dragStartX.current
      const next = Math.max(160, Math.min(520, dragStartWidth.current + delta))
      treePanelRef.current.style.width = `${next}px`
    }
    function onMouseUp(): void {
      if (!dragging.current || !treePanelRef.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Unfreeze the diff pane — one reflow on release
      if (diffPaneRef.current) {
        diffPaneRef.current.style.flex = ''
        diffPaneRef.current.style.width = ''
        diffPaneRef.current.style.pointerEvents = ''
      }
      const finalWidth = parseInt(treePanelRef.current.style.width, 10)
      setTreeWidth(finalWidth)
      localStorage.setItem('fileTreeWidth', String(finalWidth))
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function handleResizeStart(e: React.MouseEvent): void {
    if (!treePanelRef.current || !diffPaneRef.current) return
    // Freeze the diff pane at its current pixel width so its content
    // never reflows during the drag — only the narrow tree panel moves.
    diffPaneRef.current.style.flex = 'none'
    diffPaneRef.current.style.width = `${diffPaneRef.current.offsetWidth}px`
    diffPaneRef.current.style.pointerEvents = 'none'
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = parseInt(treePanelRef.current.style.width, 10) || treeWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  React.useEffect(() => {
    window.api.getIntegrations().then(setIntegrations)
  }, [])

  React.useEffect(() => {
    window.api.onReviewUpdated(async ({ repoPath, prId: updatedPrId }) => {
      if (!repo || !prDetail?.pr) return
      if (repoPath !== repo.path) return
      if (updatedPrId && updatedPrId !== prDetail.pr.id) return
      const fresh = await window.api.getPr(repo.path, prDetail.pr.id)
      if (fresh && !('error' in fresh)) setPrDetail(fresh)
    })
    return () => window.api.offReviewUpdated()
  }, [repo?.path, prDetail?.pr?.id])

  useEffect(() => {
    window.api.onPrUpdated(async ({ prId: updatedPrId }) => {
      if (updatedPrId !== prId || !repo) return
      const updated = await window.api.getPr(repo.path, prId)
      if (updated && !('error' in updated)) setPrDetail(updated as any)
    })
    return () => window.api.offPrUpdated()
  }, [prId, repo?.path])

  async function handleAssign(tool: 'claude' | 'vscode'): Promise<void> {
    if (!repo || !prId) return
    setAssigneeDropdownOpen(false)
    await window.api.assignPr(repo.path, prId, tool)
    const updated = await window.api.getPr(repo.path, prId)
    if (updated && !('error' in updated)) setPrDetail(updated as any)
    if (prDetail?.review) {
      const result = await window.api.launchFix(tool, repo.path, prId, prDetail.review.id)
      if (result?.notification) {
        setNotification(result.notification)
        setTimeout(() => setNotification(null), 5000)
      }
    }
  }

  async function handleNudge(): Promise<void> {
    if (!repo || !prId || !prDetail?.pr.assignee || !prDetail?.review) return
    const result = await window.api.launchFix(
      prDetail.pr.assignee as 'claude' | 'vscode',
      repo.path,
      prId,
      prDetail.review.id
    )
    if (result?.notification) {
      setNotification(result.notification)
      setTimeout(() => setNotification(null), 5000)
    }
  }

  useEffect(() => {
    if (repo && prId) {
      window.api.getPr(repo.path, prId).then((result) => {
        if (result && 'error' in result) return
        setPrDetail(result as any)
      })
    }
    return () => setPrDetail(null)
  }, [prId, repo?.path])

  useEffect(() => {
    if (commits === null && repo && prId) {
      setCommitsLoading(true)
      window.api.listCommits(prId, repo.path).then((result) => {
        if (!Array.isArray(result)) { setCommits([]); return }
        setCommits(result)
        setCommitsLoading(false)
      })
    }
  }, [prId, repo?.path])

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

  async function handleClosePr(): Promise<void> {
    if (!repo || !prDetail) return
    const result = await window.api.closePr(repo.path, prDetail.pr.id)
    if (!('error' in result)) setPrDetail({ ...prDetail, pr: result })
  }

  async function handleReopenPr(): Promise<void> {
    if (!repo || !prDetail) return
    const result = await window.api.reopenPr(repo.path, prDetail.pr.id)
    if (!('error' in result)) setPrDetail({ ...prDetail, pr: result })
  }

  async function handleDeletePr(): Promise<void> {
    if (!repo || !prDetail) return
    if (!window.confirm(`Delete "${prDetail.pr.title}"?\n\nThis will permanently remove all review data for this PR and cannot be undone.`)) return
    await window.api.deletePr(repo.path, prDetail.pr.id)
    navigate(`/repo/${repoId}`)
  }

  async function handleRefresh(): Promise<void> {
    if (!repo || !prId) return
    setRefreshing(true)
    const updated = await window.api.refreshPr(repo.path, prId)
    if (updated && 'error' in updated) { setRefreshing(false); return }
    setPrDetail(updated as any)
    setCommits(null) // invalidate commits cache on refresh
    setRefreshing(false)
  }

  async function handleAddComment(payload: Omit<AddCommentPayload, 'repoPath' | 'prId' | 'reviewId'>): Promise<void> {
    if (!repo || !prId || !prDetail || !prDetail.review) return
    if (prDetail.review.status !== 'in_progress') return
    await window.api.addComment({ ...payload, prId, repoPath: repo.path, reviewId: prDetail.review.id })
    const updated = await window.api.getPr(repo.path, prId)
    if (updated && !('error' in updated)) setPrDetail(updated)
  }

  async function handleDeleteComment(commentId: string): Promise<void> {
    if (!repo || !prId || !review || review.status !== 'in_progress') return
    await window.api.deleteComment(repo.path, prId, review.id, commentId)
    const updated = await window.api.getPr(repo.path, prId)
    if (updated && !('error' in updated)) {
      setPrDetail(updated)
      setFocusedCommentIndex(-1)
    }
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

  const { pr, diff, review, isStale } = prDetail
  const comments: ReviewComment[] = review?.comments ?? []
  const activeComments = comments.filter((c) => !c.is_stale)
  const navComments = sortCommentsByPosition(comments.filter((c) => !c.is_stale))
  const workflow = new PRWorkflow(pr, review ?? null, prDetail.reviews)

  function handleCommentNav(index: number): void {
    setFocusedCommentIndex(index)
    const comment = navComments[index]
    if (!comment) return
    const el = document.querySelector(`[data-comment-id="${comment.id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

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

      {isStale && (
        <StaleBanner
          onRefresh={handleRefresh}
          loading={refreshing}
          midReview={review?.status === 'in_progress'}
        />
      )}

      {/* PR header */}
      <div className={styles.prHeader}>
        <div className={styles.prTitleRow}>
          <h1 className={styles.prTitle}>{pr.title}</h1>
          <span className={`${styles.statusBadge} ${pr.status === 'open' ? styles.in_progress : styles.submitted}`}>{pr.status === 'open' ? 'Open' : 'Closed'}</span>
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
            ...(prDetail.reviews.some((r) => r.status === 'complete')
              ? [{ key: 'previous-reviews' as Tab, label: 'Previous reviews' }]
              : []),
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
            <CommentNav
              total={navComments.length}
              current={focusedCommentIndex}
              onPrev={() => handleCommentNav(Math.max(0, focusedCommentIndex - 1))}
              onNext={() => handleCommentNav(Math.min(navComments.length - 1, focusedCommentIndex + 1))}
            />
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
            <div className={styles.descriptionCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Activity</span>
              </div>
              <ReviewTimeline
                  pr={pr}
                  reviews={prDetail.reviews}
                  reviewCommitCounts={prDetail.reviewCommitCounts}
                />
            </div>
          </div>

          <div className={styles.overviewSidebar}>
            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Status</div>
              <div className={styles.sidebarValue}>
                <span className={`${styles.statusBadge} ${pr.status === 'open' ? styles.in_progress : styles.submitted}`}>
                  {pr.status === 'open' ? 'Open' : 'Closed'}
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
                  <span className={`${styles.reviewStatus} ${review.status === 'submitted' ? styles.reviewSubmitted : review.status === 'complete' ? styles.reviewComplete : styles.reviewInProgress}`}>
                    {review.status === 'submitted' ? 'Submitted' : review.status === 'complete' ? 'Complete' : 'In progress'}
                  </span>
                </div>
                {activeComments.length > 0 && (
                  <div className={styles.commentSummary}>{activeComments.length} comment{activeComments.length !== 1 ? 's' : ''}</div>
                )}
              </div>
            )}

            {workflow.allowsAssignee() && (
              <div className={styles.sidebarSection}>
                <div className={styles.sidebarLabel}>Assignees</div>
                {!pr.assignee ? (
                  <div className={styles.assigneeDropdownWrap}>
                    <button
                      className={styles.assigneeUnset}
                      onClick={() => setAssigneeDropdownOpen((o) => !o)}
                    >
                      No one — assign…
                    </button>
                    {assigneeDropdownOpen && (
                      <div className={styles.assigneeDropdownMenu}>
                        {ASSIGNEE_OPTIONS.map(({ key, label, ids }) => {
                          const status = getAssigneeStatus(integrations, ids)
                          return (
                            <button
                              key={key}
                              className={styles.assigneeDropdownItem}
                              disabled={status !== 'configured'}
                              onClick={status === 'configured' ? () => handleAssign(key) : undefined}
                            >
                              <span className={styles.assigneeItemRow}>
                                <span>{label}</span>
                                {status === 'not-installed' && (
                                  <span className={styles.assigneeStatusLabel}>Not installed</span>
                                )}
                                {status === 'not-configured' && (
                                  <span className={styles.assigneeStatusLabel}>Not configured — see settings</span>
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className={styles.assigneeChip}>
                      <span className={styles.assigneeDot} />
                      <span>{pr.assignee === 'claude' ? 'Claude Code' : 'Copilot (VS Code)'}</span>
                    </div>
                    <button className={styles.nudgeBtn} onClick={handleNudge}>
                      Nudge
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Commits</div>
              <div className={styles.sidebarValue}>
                {commits === null ? '—' : `${commits.length} commit${commits.length !== 1 ? 's' : ''}`}
              </div>
            </div>

            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Created</div>
              <div className={styles.sidebarValue}>
                <time className={styles.metaText}>{new Date(pr.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time>
              </div>
            </div>

            <div className={styles.sidebarSection}>
              <div className={styles.sidebarLabel}>Actions</div>
              <div className={styles.sidebarActions}>
                {pr.status === 'open' ? (
                  <button className={styles.sidebarActionBtn} onClick={handleClosePr}>Close PR</button>
                ) : (
                  <button className={styles.sidebarActionBtn} onClick={handleReopenPr}>Reopen PR</button>
                )}
                <button className={`${styles.sidebarActionBtn} ${styles.sidebarActionDanger}`} onClick={handleDeletePr}>Delete PR</button>
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
          <div ref={treePanelRef} className={styles.treePanel} style={{ width: treeWidth }}>
            <FileTree files={diff} onSelect={scrollToFile} />
          </div>
          <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
          <div ref={diffPaneRef} className={styles.diffPane}>
            {diff.map((file) => (
              <div key={file.newPath} ref={(el) => { fileRefs.current[file.newPath] = el }}>
                <DiffView
                  file={file}
                  comments={comments.filter((c) => c.file === file.newPath)}
                  view={diffView}
                  onAddComment={handleAddComment}
                  readOnly={workflow.isReadOnly()}
                  allowDeleteComment={review?.status === 'in_progress'}
                  onDeleteComment={handleDeleteComment}
                  focusedCommentId={navComments[focusedCommentIndex]?.id}
                />
              </div>
            ))}
          </div>
          {!reviewPanelOpen && (
            <CommentOutline
              comments={navComments}
              focusedIndex={focusedCommentIndex}
              onSelect={handleCommentNav}
            />
          )}
        </div>
      )}

      {/* ── Previous reviews tab ── */}
      {tab === 'previous-reviews' && (
        <PreviousReviews
          reviews={prDetail.reviews.filter((r) => r.status === 'complete')}
          repoPath={repo?.path ?? ''}
        />
      )}

      {reviewPanelOpen && (
        <ReviewPanel
          pr={pr}
          review={review}
          reviews={prDetail.reviews}
          comments={comments}
          prId={prId!}
          onClose={() => setReviewPanelOpen(false)}
          onSubmitted={(updated: PrDetail | null) => setPrDetail(updated)}
          repoPath={repo?.path ?? ''}
        />
      )}

      {notification && (
        <div className={styles.notification}>{notification}</div>
      )}
    </div>
  )
}

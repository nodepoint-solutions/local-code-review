import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import StaleBanner from '../components/StaleBanner'
import FileTree from '../components/FileTree'
import DiffView from '../components/DiffView'
import ReviewPanel from '../components/ReviewPanel'
import type { AddCommentPayload } from '../../../shared/types'
import styles from './PR.module.css'

export default function PR(): JSX.Element {
  const { repoId, prId } = useParams<{ repoId: string; prId: string }>()
  const navigate = useNavigate()
  const { repos, prDetail, setPrDetail, diffView, setDiffView, reviewPanelOpen, setReviewPanelOpen } = useStore()
  const repo = repos.find((r) => r.id === repoId)
  const [tab, setTab] = useState<'files' | 'overview'>('files')
  const [refreshing, setRefreshing] = useState(false)
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

  async function handleRefresh(): Promise<void> {
    if (!repo || !prId) return
    setRefreshing(true)
    const updated = await window.api.refreshPr(prId, repo.path)
    if (updated && 'error' in updated) {
      setRefreshing(false)
      return
    }
    setPrDetail(updated as any)
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

  if (!prDetail) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>

  const { pr, diff, review, comments, isStale } = prDetail

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button onClick={() => navigate(`/repo/${repoId}`)}>← PRs</button>
        <div className={styles.headerMeta}>
          <h2 className={styles.prTitle}>{pr.title}</h2>
          <div className={styles.branches}>
            <code>{pr.compare_branch}</code>
            <span> → </span>
            <code>{pr.base_branch}</code>
          </div>
        </div>
        <button onClick={() => setReviewPanelOpen(!reviewPanelOpen)}>
          Review ({comments.filter((c) => !c.is_stale).length})
        </button>
      </div>

      {isStale && <StaleBanner onRefresh={handleRefresh} loading={refreshing} />}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={tab === 'files' ? styles.activeTab : ''} onClick={() => setTab('files')}>
          Files changed ({diff.length})
        </button>
        <button className={tab === 'overview' ? styles.activeTab : ''} onClick={() => setTab('overview')}>
          Overview
        </button>
        {tab === 'files' && (
          <div className={styles.viewToggle}>
            <button className={diffView === 'unified' ? styles.activeToggle : ''} onClick={() => setDiffView('unified')}>Unified</button>
            <button className={diffView === 'split' ? styles.activeToggle : ''} onClick={() => setDiffView('split')}>Split</button>
          </div>
        )}
      </div>

      {tab === 'overview' && (
        <div className={styles.overview}>
          <p>{pr.description ?? <span style={{ color: 'var(--text-muted)' }}>No description.</span>}</p>
        </div>
      )}

      {tab === 'files' && (
        <div className={styles.body}>
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

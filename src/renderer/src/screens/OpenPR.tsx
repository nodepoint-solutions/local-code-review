import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import styles from './OpenPR.module.css'

export default function OpenPR(): JSX.Element {
  const { repoId } = useParams<{ repoId: string }>()
  const navigate = useNavigate()
  const { repos } = useStore()
  const repo = repos.find((r) => r.id === repoId)

  const [branches, setBranches] = useState<string[]>([])
  const [baseBranch, setBaseBranch] = useState('')
  const [compareBranch, setCompareBranch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (repo) window.api.listBranches(repo.path).then(setBranches)
  }, [repo?.path])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!repo || !baseBranch || !compareBranch || !title) return
    if (baseBranch === compareBranch) {
      setError('Base and compare branches must be different.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const pr = await window.api.createPr({
        repoPath: repo.path,
        title,
        description: description || null,
        baseBranch,
        compareBranch,
      })
      if ('error' in pr) {
        setError((pr as any).message ?? 'Failed to create pull request.')
        return
      }
      navigate(`/repo/${repo.id}/pr/${pr.id}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to create pull request.')
    } finally {
      setLoading(false)
    }
  }

  if (!repo) return <div style={{ padding: 32 }}>Repository not found.</div>

  return (
    <div className={styles.page}>
      <NavBar
        crumbs={[
          { label: repo.name, to: `/repo/${repoId}` },
          { label: 'New pull request' },
        ]}
      />

      <div className={styles.content}>
        <div className={styles.formCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.heading}>New pull request</h2>
            <p className={styles.subheading}>
              Compare changes between two branches in <strong>{repo.name}</strong>
            </p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {/* Branch selector */}
            <div className={styles.branchRow}>
              <div className={styles.branchField}>
                <label className={styles.label}>Base branch</label>
                <select value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} required>
                  <option value="">Select base…</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <span className={styles.fieldHint}>The branch you want to merge into</span>
              </div>

              <div className={styles.branchArrow}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>

              <div className={styles.branchField}>
                <label className={styles.label}>Compare branch</label>
                <select value={compareBranch} onChange={(e) => setCompareBranch(e.target.value)} required>
                  <option value="">Select compare…</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <span className={styles.fieldHint}>The branch with your changes</span>
              </div>
            </div>

            <div className={styles.divider} />

            {/* Title */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pr-title">Title</label>
              <input
                id="pr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Summarise the changes in this pull request"
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pr-desc">Description <span className={styles.optional}>(optional)</span></label>
              <textarea
                id="pr-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a more detailed description of the changes, motivation, or anything reviewers should know…"
                rows={5}
              />
            </div>

            {error && (
              <div className={styles.errorBanner}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <div className={styles.actions}>
              <button type="button" onClick={() => navigate(`/repo/${repoId}`)}>Cancel</button>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Creating…' : 'Create pull request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

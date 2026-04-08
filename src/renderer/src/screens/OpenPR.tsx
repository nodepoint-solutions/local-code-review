import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
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
        repoId: repo.id,
        repoPath: repo.path,
        title,
        description: description || null,
        baseBranch,
        compareBranch,
      })
      if ('error' in pr) {
        setError((pr as any).message ?? 'Failed to create PR.')
        return
      }
      navigate(`/repo/${repo.id}/pr/${pr.id}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to create PR.')
    } finally {
      setLoading(false)
    }
  }

  if (!repo) return <div style={{ padding: 32 }}>Repository not found.</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate(`/repo/${repoId}`)}>← Back</button>
        <h2>Open Pull Request</h2>
      </div>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.branches}>
          <label>
            Base branch
            <select value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} required>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <span className={styles.arrow}>←</span>
          <label>
            Compare branch
            <select value={compareBranch} onChange={(e) => setCompareBranch(e.target.value)} required>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PR title" required />
        </label>
        <label>
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this PR do?"
            rows={4}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Creating…' : 'Open Pull Request'}
        </button>
      </form>
    </div>
  )
}

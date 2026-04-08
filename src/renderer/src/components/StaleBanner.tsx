import styles from './StaleBanner.module.css'

interface Props {
  onRefresh: () => void
  loading: boolean
}

export default function StaleBanner({ onRefresh, loading }: Props): JSX.Element {
  return (
    <div className={styles.banner}>
      <span>⚠ This PR is out of sync with its branches.</span>
      <button onClick={onRefresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}

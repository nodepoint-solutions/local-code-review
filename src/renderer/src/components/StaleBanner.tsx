import styles from './StaleBanner.module.css'

interface Props {
  onRefresh: () => void
  loading: boolean
  midReview?: boolean
}

export default function StaleBanner({ onRefresh, loading, midReview }: Props): JSX.Element {
  const message = midReview
    ? 'The code has changed since you started this review. Your existing comments may be mispositioned — review them and delete any that no longer apply.'
    : 'This PR is out of sync — branches may have changed since last refresh.'

  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{message}</span>
      </div>
      <button onClick={onRefresh} disabled={loading}>
        {loading ? (
          <>
            <svg className={styles.spin} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refreshing…
          </>
        ) : 'Refresh'}
      </button>
    </div>
  )
}

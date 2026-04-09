import styles from './CommentNav.module.css'

interface Props {
  total: number
  current: number   // 0-based index, -1 when nothing focused
  onPrev: () => void
  onNext: () => void
}

export default function CommentNav({ total, current, onPrev, onNext }: Props): JSX.Element | null {
  if (total === 0) return null

  const label = current === -1 ? `${total}` : `${current + 1} / ${total}`

  return (
    <div className={styles.nav}>
      <button
        className={styles.btn}
        onClick={onPrev}
        disabled={total === 0 || current <= 0}
        title="Previous comment"
      >
        ← Prev
      </button>
      <span className={styles.counter}>{label}</span>
      <button
        className={styles.btn}
        onClick={onNext}
        disabled={total === 0 || current >= total - 1}
        title="Next comment"
      >
        Next →
      </button>
    </div>
  )
}

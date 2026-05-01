import { useEffect, useRef } from 'react'
import styles from './DiffSearchBar.module.css'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  activeIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

function SearchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export default function DiffSearchBar({
  query, onQueryChange, matchCount, activeIndex, onPrev, onNext, onClose,
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      if (e.shiftKey) onPrev()
      else onNext()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const matchLabel =
    query === '' ? '' :
    matchCount === 0 ? 'No results' :
    `${activeIndex + 1} of ${matchCount}`

  return (
    <div className={styles.bar}>
      <span className={styles.icon}><SearchIcon /></span>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in diff…"
      />
      {matchLabel && (
        <span className={`${styles.count} ${matchCount === 0 ? styles.noResults : ''}`}>
          {matchLabel}
        </span>
      )}
      <button className={styles.navBtn} onClick={onPrev} disabled={matchCount === 0} title="Previous match (Shift+Enter)">↑</button>
      <button className={styles.navBtn} onClick={onNext} disabled={matchCount === 0} title="Next match (Enter)">↓</button>
      <button className={styles.closeBtn} onClick={onClose} title="Close search">✕</button>
    </div>
  )
}

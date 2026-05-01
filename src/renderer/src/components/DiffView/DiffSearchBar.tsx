import { useEffect, useRef, useState } from 'react'
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
  const [inputValue, setInputValue] = useState(query)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Sync input when parent resets query (e.g. on close)
  useEffect(() => {
    setInputValue(query)
  }, [query])

  function commitSearch(): void {
    onQueryChange(inputValue)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inputValue === query && matchCount > 0) {
        if (e.shiftKey) onPrev()
        else onNext()
      } else {
        commitSearch()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const matchLabel =
    query === '' ? '' :
    matchCount === 0 ? 'No results' :
    `${activeIndex + 1} of ${matchCount}`

  return (
    <div className={styles.bar} role="search">
      <span className={styles.icon}><SearchIcon /></span>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in diff…"
      />
      <button className={styles.commitBtn} onClick={commitSearch} title="Search (Enter)" aria-label="Search">↵</button>
      {matchLabel && (
        <span className={`${styles.count} ${matchCount === 0 ? styles.noResults : ''}`}>
          {matchLabel}
        </span>
      )}
      <button className={styles.navBtn} onClick={onPrev} disabled={matchCount === 0} title="Previous match" aria-label="Previous match">↑</button>
      <button className={styles.navBtn} onClick={onNext} disabled={matchCount === 0} title="Next match" aria-label="Next match">↓</button>
      <button className={styles.closeBtn} onClick={onClose} title="Close search" aria-label="Close search">✕</button>
    </div>
  )
}

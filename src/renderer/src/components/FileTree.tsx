import type { ParsedFile } from '../../../shared/types'
import styles from './FileTree.module.css'

interface Props {
  files: ParsedFile[]
  onSelect: (filePath: string) => void
}

export default function FileTree({ files, onSelect }: Props): JSX.Element {
  return (
    <div className={styles.tree}>
      <div className={styles.heading}>Files changed ({files.length})</div>
      <ul>
        {files.map((f) => (
          <li key={f.newPath}>
            <button className={styles.fileBtn} onClick={() => onSelect(f.newPath)}>
              {f.isNew && <span className={styles.badge} style={{ color: 'var(--added-text)' }}>A</span>}
              {f.isDeleted && <span className={styles.badge} style={{ color: 'var(--removed-text)' }}>D</span>}
              {f.isRenamed && <span className={styles.badge} style={{ color: '#d29922' }}>R</span>}
              {!f.isNew && !f.isDeleted && !f.isRenamed && <span className={styles.badge} style={{ color: 'var(--accent-hover)' }}>M</span>}
              <span className={styles.path}>{f.newPath}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

import { useState } from 'react'
import type { ParsedFile } from '../../../shared/types'
import styles from './FileTree.module.css'

interface Props {
  files: ParsedFile[]
  onSelect: (filePath: string) => void
}

function getStatusChar(f: ParsedFile): { char: string; cls: string } {
  if (f.isNew) return { char: 'A', cls: styles.statusAdded }
  if (f.isDeleted) return { char: 'D', cls: styles.statusDeleted }
  if (f.isRenamed) return { char: 'R', cls: styles.statusRenamed }
  return { char: 'M', cls: styles.statusModified }
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path
}

function getDirName(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/') + '/'
}

export default function FileTree({ files, onSelect }: Props): JSX.Element {
  const [activeFile, setActiveFile] = useState<string | null>(null)

  function handleSelect(filePath: string): void {
    setActiveFile(filePath)
    onSelect(filePath)
  }

  return (
    <div className={styles.tree}>
      <div className={styles.heading}>
        <span>Files</span>
        <span className={styles.count}>{files.length}</span>
      </div>
      <ul className={styles.list}>
        {files.map((f) => {
          const { char, cls } = getStatusChar(f)
          const isActive = activeFile === f.newPath
          return (
            <li key={f.newPath}>
              <button
                className={`${styles.fileBtn} ${isActive ? styles.fileBtnActive : ''}`}
                onClick={() => handleSelect(f.newPath)}
                title={f.newPath}
              >
                <span className={`${styles.status} ${cls}`}>{char}</span>
                <span className={styles.fileInfo}>
                  <span className={styles.fileName}>{getFileName(f.newPath)}</span>
                  {getDirName(f.newPath) && (
                    <span className={styles.fileDir}>{getDirName(f.newPath)}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

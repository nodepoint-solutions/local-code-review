import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { ParsedFile } from '../../../shared/types'
import styles from './FileTree.module.css'

interface Props {
  files: ParsedFile[]
  onSelect: (filePath: string) => void
}

type FileNode = {
  type: 'file'
  name: string
  file: ParsedFile
}

type FolderNode = {
  type: 'folder'
  name: string
  path: string
  children: TreeNode[]
}

type TreeNode = FileNode | FolderNode

// Layout constants — keep in sync with CSS
const INDENT = 16   // px per depth level
const BASE   = 8    // base left padding
const CHEV   = 12   // chevron width
const GAP    = 4    // gap between chevron and icon

function getStatusChar(f: ParsedFile): { char: string; cls: string } {
  if (f.isNew) return { char: 'A', cls: styles.statusAdded }
  if (f.isDeleted) return { char: 'D', cls: styles.statusDeleted }
  if (f.isRenamed) return { char: 'R', cls: styles.statusRenamed }
  return { char: 'M', cls: styles.statusModified }
}

function buildTree(files: ParsedFile[]): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: '', path: '', children: [] }

  for (const file of files) {
    const parts = file.newPath.split('/')
    let current = root

    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]
      const path = parts.slice(0, i + 1).join('/')
      let folder = current.children.find(
        (c): c is FolderNode => c.type === 'folder' && c.name === name
      )
      if (!folder) {
        folder = { type: 'folder', name, path, children: [] }
        current.children.push(folder)
      }
      current = folder
    }

    current.children.push({ type: 'file', name: parts[parts.length - 1], file })
  }

  return root.children
}

function getAllFolderPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      paths.push(node.path)
      paths.push(...getAllFolderPaths(node.children))
    }
  }
  return paths
}

interface NodeProps {
  node: TreeNode
  depth: number
  activeFile: string | null
  openFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (filePath: string) => void
}

function TreeNodeItem({
  node,
  depth,
  activeFile,
  openFolders,
  onToggleFolder,
  onSelectFile
}: NodeProps): JSX.Element {
  // Icons for folders and files start at the same X for the same depth
  const folderPL = depth * INDENT + BASE          // chevron starts here
  const filePL   = depth * INDENT + BASE + CHEV + GAP  // icon starts here (matches folder icon)
  const lineX    = depth * INDENT + BASE + CHEV / 2    // center of chevron column

  if (node.type === 'file') {
    const { char, cls } = getStatusChar(node.file)
    const isActive = activeFile === node.file.newPath
    return (
      <button
        className={`${styles.fileBtn} ${isActive ? styles.fileBtnActive : ''}`}
        style={{ paddingLeft: filePL }}
        onClick={() => onSelectFile(node.file.newPath)}
        title={node.file.newPath}
      >
        <svg className={styles.fileIcon} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.75 1.5a.25.25 0 0 0-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6H9.75A1.75 1.75 0 0 1 8 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v8.586A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25V1.75z" />
        </svg>
        <span className={styles.fileName}>{node.name}</span>
        <span className={`${styles.status} ${cls}`}>{char}</span>
      </button>
    )
  }

  const isOpen = openFolders.has(node.path)
  return (
    <>
      <button
        className={styles.folderBtn}
        style={{ paddingLeft: folderPL }}
        onClick={() => onToggleFolder(node.path)}
      >
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z" />
        </svg>
        {isOpen ? (
          <svg className={styles.folderIcon} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13.5A1.75 1.75 0 0 1 15.25 4.75v8A1.75 1.75 0 0 1 13.5 14.5h-12A1.75 1.75 0 0 1 .25 12.75V2.75c0-.464.184-.909.513-1.237zM1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12a.25.25 0 0 0 .25-.25v-8a.25.25 0 0 0-.25-.25H7.75a1.75 1.75 0 0 1-1.4-.7l-.9-1.2a.25.25 0 0 0-.2-.1H1.75z" />
          </svg>
        ) : (
          <svg className={styles.folderIcon} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.75 1A1.75 1.75 0 0 0 .25 2.75v11.5C.25 15.216.784 16 1.75 16h12A1.75 1.75 0 0 0 15.5 14.25V4.75A1.75 1.75 0 0 0 13.75 3H7.75a.25.25 0 0 1-.2-.1l-.9-1.2A1.75 1.75 0 0 0 5.25 1H1.75z" />
          </svg>
        )}
        <span className={styles.folderName}>{node.name}</span>
      </button>
      {isOpen && (
        <div
          className={styles.children}
          style={{ '--line-x': `${lineX}px` } as CSSProperties}
        >
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.type === 'file' ? child.file.newPath : child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              openFolders={openFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </>
  )
}

export default function FileTree({ files, onSelect }: Props): JSX.Element {
  const tree = buildTree(files)
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(getAllFolderPaths(tree))
  )
  const [activeFile, setActiveFile] = useState<string | null>(null)

  function handleSelect(filePath: string): void {
    setActiveFile(filePath)
    onSelect(filePath)
  }

  function handleToggleFolder(path: string): void {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <div className={styles.tree}>
      <div className={styles.heading}>
        <span>Files</span>
        <span className={styles.count}>{files.length}</span>
      </div>
      <div className={styles.list}>
        {tree.map((node) => (
          <TreeNodeItem
            key={node.type === 'file' ? node.file.newPath : node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            openFolders={openFolders}
            onToggleFolder={handleToggleFolder}
            onSelectFile={handleSelect}
          />
        ))}
      </div>
    </div>
  )
}

// src/main/review-watcher.ts
import fs from 'fs'
import path from 'path'

type ChangeCallback = (repoPath: string) => void

export class ReviewWatcher {
  private watchers = new Map<string, fs.FSWatcher>()

  watch(repoPath: string, onChange: ChangeCallback): void {
    if (this.watchers.has(repoPath)) return

    const reviewsDir = path.join(repoPath, '.reviews')
    fs.mkdirSync(reviewsDir, { recursive: true })

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const watcher = fs.watch(reviewsDir, { recursive: true }, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => onChange(repoPath), 150)
    })

    watcher.on('error', () => {
      this.unwatch(repoPath)
    })

    this.watchers.set(repoPath, watcher)
  }

  unwatch(repoPath: string): void {
    this.watchers.get(repoPath)?.close()
    this.watchers.delete(repoPath)
  }

  unwatchAll(): void {
    for (const watcher of this.watchers.values()) watcher.close()
    this.watchers.clear()
  }
}

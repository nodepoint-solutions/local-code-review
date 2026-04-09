// src/main/ipc/prs.ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { listBranches, resolveSha } from '../git/branches'
import { execGit } from '../git/runner'
import { parseDiff } from '../git/diff-parser'
import type { Commit, CreatePrPayload, PrDetail } from '../../shared/types'

const store = new ReviewStore()

export function registerPrHandlers(_db: Database.Database): void {
  ipcMain.handle('prs:list', (_e, repoPath: string) => {
    try {
      return store.listPRs(repoPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('branches:list', async (_e, repoPath: string) => {
    try {
      return await listBranches(repoPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('prs:create', async (_e, payload: CreatePrPayload) => {
    try {
      await resolveSha(payload.repoPath, payload.baseBranch)
      await resolveSha(payload.repoPath, payload.compareBranch)
      return store.createPR(payload.repoPath, {
        title: payload.title,
        description: payload.description,
        base_branch: payload.baseBranch,
        compare_branch: payload.compareBranch,
      })
      // SHAs are resolved but stored on the first review, not on the PR itself
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:get', async (_e, repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> => {
    try {
      const pr = store.getPR(repoPath, prId)

      const currentBaseSha = await resolveSha(repoPath, pr.base_branch)
      const currentCompareSha = await resolveSha(repoPath, pr.compare_branch)

      const review = store.getOrCreateInProgressReview(repoPath, prId, {
        base_sha: currentBaseSha,
        compare_sha: currentCompareSha,
      })

      const isStale = currentBaseSha !== review.base_sha || currentCompareSha !== review.compare_sha

      const rawDiff = await execGit(repoPath, ['diff', `${review.base_sha}..${review.compare_sha}`, '--unified=3'])
      const diff = parseDiff(rawDiff)

      return { pr, diff, review, isStale }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:refresh', async (_e, repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> => {
    try {
      const pr = store.getPR(repoPath, prId)
      const baseSha = await resolveSha(repoPath, pr.base_branch)
      const compareSha = await resolveSha(repoPath, pr.compare_branch)

      const reviews = store.listReviews(repoPath, prId)
      const inProgress = reviews.find((r) => r.status === 'in_progress')

      if (inProgress) {
        const rawDiff = await execGit(repoPath, ['diff', `${baseSha}..${compareSha}`, '--unified=3'])
        const diff = parseDiff(rawDiff)

        for (const file of diff) {
          const validLineNums = new Set(file.lines.map((l) => l.diffLineNumber))
          const staleRanges = inProgress.comments
            .filter((c) => c.file === file.newPath && (!validLineNums.has(c.start_line) || !validLineNums.has(c.end_line)))
            .map((c) => ({ startLine: c.start_line, endLine: c.end_line }))
          if (staleRanges.length > 0) {
            store.markStale(repoPath, prId, inProgress.id, file.newPath, staleRanges)
          }
        }

        const freshReview = store.getReview(repoPath, prId, inProgress.id)
        return { pr, diff, review: freshReview, isStale: false }
      }

      // No in-progress review: create one for the new SHAs
      const newReview = store.createReview(repoPath, prId, { base_sha: baseSha, compare_sha: compareSha })
      const rawDiff = await execGit(repoPath, ['diff', `${baseSha}..${compareSha}`, '--unified=3'])
      const diff = parseDiff(rawDiff)
      return { pr, diff, review: newReview, isStale: false }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('commits:list', async (_e, prId: string, repoPath: string): Promise<Commit[] | { error: string }> => {
    try {
      const reviews = store.listReviews(repoPath, prId)
      const latest = reviews[0]
      if (!latest) return []
      const raw = await execGit(repoPath, [
        'log',
        '--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at',
        `${latest.base_sha}..${latest.compare_sha}`,
      ])
      return raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, shortHash, subject, authorName, authorEmail, ts] = line.split('\x00')
          return { hash, shortHash, subject, authorName, authorEmail, timestamp: parseInt(ts, 10) }
        })
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('commits:show', async (_e, repoPath: string, hash: string) => {
    try {
      const raw = await execGit(repoPath, ['diff-tree', '--no-commit-id', '-p', '-r', '--unified=3', hash])
      return { diff: parseDiff(raw) }
    } catch {
      try {
        const raw = await execGit(repoPath, ['show', '--format=', '-p', '--unified=3', hash])
        return { diff: parseDiff(raw.replace(/^[^\n]*\n/, '')) }
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  })
}

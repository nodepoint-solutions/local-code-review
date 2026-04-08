import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { insertPr, getPr, listPrs, updatePrShas } from '../db/prs'
import { getOrCreateInProgressReview, listComments, markCommentsStale } from '../db/reviews'
import { listBranches, resolveSha } from '../git/branches'
import { execGit } from '../git/runner'
import { parseDiff } from '../git/diff-parser'
import type { CreatePrPayload, PrDetail } from '../../shared/types'

export function registerPrHandlers(db: Database.Database): void {
  ipcMain.handle('prs:list', (_e, repoId: string) => listPrs(db, repoId))

  ipcMain.handle('branches:list', (_e, repoPath: string) => listBranches(repoPath))

  ipcMain.handle('prs:create', async (_e, payload: CreatePrPayload & { repoPath: string }) => {
    const baseSha = await resolveSha(payload.repoPath, payload.baseBranch)
    const compareSha = await resolveSha(payload.repoPath, payload.compareBranch)
    return insertPr(db, {
      repoId: payload.repoId,
      title: payload.title,
      description: payload.description,
      baseBranch: payload.baseBranch,
      compareBranch: payload.compareBranch,
      baseSha,
      compareSha,
    })
  })

  ipcMain.handle('prs:get', async (_e, prId: string, repoPath: string): Promise<PrDetail | null> => {
    const pr = getPr(db, prId)
    if (!pr) return null

    const currentBaseSha = await resolveSha(repoPath, pr.base_branch)
    const currentCompareSha = await resolveSha(repoPath, pr.compare_branch)
    const isStale = currentBaseSha !== pr.base_sha || currentCompareSha !== pr.compare_sha

    const rawDiff = await execGit(repoPath, ['diff', `${pr.base_sha}..${pr.compare_sha}`, '--unified=3'])
    const diff = parseDiff(rawDiff)

    const review = db.prepare(`SELECT * FROM reviews WHERE pr_id = ? AND status = 'in_progress' LIMIT 1`).get(prId) as any ?? null
    const comments = review ? listComments(db, review.id) : []

    return { pr, diff, review, comments, isStale }
  })

  ipcMain.handle('prs:refresh', async (_e, prId: string, repoPath: string): Promise<PrDetail | null> => {
    const pr = getPr(db, prId)
    if (!pr) return null

    const baseSha = await resolveSha(repoPath, pr.base_branch)
    const compareSha = await resolveSha(repoPath, pr.compare_branch)
    updatePrShas(db, prId, baseSha, compareSha)

    const rawDiff = await execGit(repoPath, ['diff', `${baseSha}..${compareSha}`, '--unified=3'])
    const diff = parseDiff(rawDiff)

    // Mark stale comments for each file
    const review = db.prepare(`SELECT * FROM reviews WHERE pr_id = ? AND status = 'in_progress' LIMIT 1`).get(prId) as any ?? null
    if (review) {
      for (const file of diff) {
        const validLineNums = new Set(file.lines.map((l) => l.diffLineNumber))
        const comments = listComments(db, review.id).filter((c) => c.file_path === file.newPath)
        const staleRanges = comments
          .filter((c) => !validLineNums.has(c.start_line) || !validLineNums.has(c.end_line))
          .map((c) => ({ startLine: c.start_line, endLine: c.end_line }))
        if (staleRanges.length > 0) {
          markCommentsStale(db, review.id, file.newPath, staleRanges)
        }
      }
    }

    const freshPr = getPr(db, prId)!
    const freshComments = review ? listComments(db, review.id) : []
    return { pr: freshPr, diff, review, comments: freshComments, isStale: false }
  })
}

// src/main/ipc/prs.ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { PRWorkflow } from '../../shared/pr-workflow'
import { deleteRepo } from '../db/repos'
import {
  listBranches,
  resolveSha,
  getRemoteOriginUrl,
  parseGithubRemote,
  isWorkingDirClean,
  isBranchPushed,
  pushBranch,
} from '../git/branches'
import { getDiff } from '../git/diff-parser'
import { getCommitDiff } from '../git/commits'
import {
  getPrDetail,
  refreshPrDetail,
  listPrsWithState,
  listPrCommits,
} from '../services/pr-service'
import type { CreatePrPayload, PrDetail } from '../../shared/types'
import { assertKnownRepo } from './_guard'

const store = new ReviewStore()

export function registerPrHandlers(db: Database.Database): void {
  ipcMain.handle('prs:list', (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return listPrsWithState(store, repoPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('branches:list', async (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return await listBranches(repoPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('prs:create', async (_e, payload: CreatePrPayload) => {
    try {
      assertKnownRepo(db, payload.repoPath)
      await resolveSha(payload.repoPath, payload.baseBranch)
      await resolveSha(payload.repoPath, payload.compareBranch)
      return store.createPR(payload.repoPath, {
        title: payload.title,
        description: payload.description,
        base_branch: payload.baseBranch,
        compare_branch: payload.compareBranch,
        assignee: payload.assignee ?? null,
      })
      // SHAs are resolved but stored on the first review, not on the PR itself
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'prs:get',
    async (_e, repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> => {
      try {
        assertKnownRepo(db, repoPath)
        return await getPrDetail(store, repoPath, prId)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'prs:refresh',
    async (_e, repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> => {
      try {
        assertKnownRepo(db, repoPath)
        return await refreshPrDetail(store, repoPath, prId)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('commits:list', async (_e, prId: string, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return await listPrCommits(store, repoPath, prId)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'prs:update',
    (
      _e,
      repoPath: string,
      prId: string,
      changes: { title?: string; description?: string | null }
    ) => {
      try {
        assertKnownRepo(db, repoPath)
        return store.updatePR(repoPath, prId, changes)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('prs:close', (_e, repoPath: string, prId: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return store.updatePRStatus(repoPath, prId, 'closed')
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:reopen', (_e, repoPath: string, prId: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return store.updatePRStatus(repoPath, prId, 'open')
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('prs:delete', (_e, repoPath: string, prId: string) => {
    try {
      assertKnownRepo(db, repoPath)
      store.deletePR(repoPath, prId)
      const openRemaining = store.listPRs(repoPath).filter((pr) => pr.status === 'open')
      if (openRemaining.length === 0) {
        deleteRepo(db, repoPath)
      }
      return {}
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('commits:show', async (_e, repoPath: string, hash: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return { diff: await getCommitDiff(repoPath, hash) }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'prs:assign',
    (_e, repoPath: string, prId: string, assignee: 'claude' | 'vscode' | null) => {
      try {
        assertKnownRepo(db, repoPath)
        if (assignee !== null) {
          const pr = store.getPR(repoPath, prId)
          const workflow = new PRWorkflow(pr, store.getActiveReview(repoPath, prId))
          if (!workflow.allowsAssignee()) {
            return { error: PRWorkflow.assignDeniedReason(workflow.phase) }
          }
        }
        return store.assignPR(repoPath, prId, assignee)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'git:diff-at-shas',
    async (_e, repoPath: string, baseSha: string, compareSha: string) => {
      try {
        assertKnownRepo(db, repoPath)
        return await getDiff(repoPath, baseSha, compareSha)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('git:remote-info', async (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      const url = await getRemoteOriginUrl(repoPath)
      if (!url) return null
      return parseGithubRemote(url)
    } catch {
      return null
    }
  })

  ipcMain.handle('git:working-dir-clean', async (_e, repoPath: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return { clean: await isWorkingDirClean(repoPath) }
    } catch {
      return { clean: false }
    }
  })

  ipcMain.handle('git:branch-pushed', async (_e, repoPath: string, branch: string) => {
    try {
      assertKnownRepo(db, repoPath)
      return { pushed: await isBranchPushed(repoPath, branch) }
    } catch {
      return { pushed: false }
    }
  })

  ipcMain.handle('git:push-branch', async (_e, repoPath: string, branch: string) => {
    try {
      assertKnownRepo(db, repoPath)
      await pushBranch(repoPath, branch)
      return {}
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
}

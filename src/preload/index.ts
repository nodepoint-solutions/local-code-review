// src/preload/index.ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Repository, RepositoryWithMeta, DiscoveredRepo,
  PRFile, ReviewFile,
  ParsedFile, PrDetail, CreatePrPayload, AddCommentPayload, Commit,
  IntegrationStatus,
} from '../shared/types'

const api = {
  // Repos
  listRepos: (): Promise<RepositoryWithMeta[]> =>
    ipcRenderer.invoke('repos:list'),
  openRepo: (): Promise<{ repo?: Repository; error?: string }> =>
    ipcRenderer.invoke('repos:open'),
  addRepoByPath: (repoPath: string): Promise<{ repo?: Repository; error?: string }> =>
    ipcRenderer.invoke('repos:add-by-path', repoPath),
  touchRepo: (repoId: string): Promise<void> =>
    ipcRenderer.invoke('repos:touch', repoId),
  getSetting: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('repos:get-setting', key),
  setSetting: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('repos:set-setting', key, value),
  scanRepos: (): Promise<DiscoveredRepo[]> =>
    ipcRenderer.invoke('repos:scan'),
  openScanDirPicker: (): Promise<string | null> =>
    ipcRenderer.invoke('repos:open-scan-dir-picker'),
  resetDb: (): Promise<void> =>
    ipcRenderer.invoke('repos:reset'),
  checkGlobalGitignore: (): Promise<{ installed: boolean; filePath: string }> =>
    ipcRenderer.invoke('gitignore:check-global'),
  installGlobalGitignore: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('gitignore:install-global'),

  // Branches
  listBranches: (repoPath: string): Promise<string[]> =>
    ipcRenderer.invoke('branches:list', repoPath),

  // PRs (repoPath replaces repoId)
  listPrs: (repoPath: string): Promise<PRFile[]> =>
    ipcRenderer.invoke('prs:list', repoPath),
  createPr: (payload: CreatePrPayload): Promise<PRFile | { error: string }> =>
    ipcRenderer.invoke('prs:create', payload),
  getPr: (repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> =>
    ipcRenderer.invoke('prs:get', repoPath, prId),
  refreshPr: (repoPath: string, prId: string): Promise<PrDetail | { error: string } | null> =>
    ipcRenderer.invoke('prs:refresh', repoPath, prId),
  updatePr: (repoPath: string, prId: string, changes: { title?: string; description?: string | null }): Promise<PRFile | { error: string }> =>
    ipcRenderer.invoke('prs:update', repoPath, prId, changes),
  closePr: (repoPath: string, prId: string): Promise<PRFile | { error: string }> =>
    ipcRenderer.invoke('prs:close', repoPath, prId),
  reopenPr: (repoPath: string, prId: string): Promise<PRFile | { error: string }> =>
    ipcRenderer.invoke('prs:reopen', repoPath, prId),
  deletePr: (repoPath: string, prId: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke('prs:delete', repoPath, prId),

  // Reviews & Comments
  addComment: (payload: AddCommentPayload): Promise<ReviewFile | { error: string }> =>
    ipcRenderer.invoke('comments:add', payload),
  submitReview: (repoPath: string, prId: string, reviewId: string): Promise<ReviewFile | { error: string }> =>
    ipcRenderer.invoke('reviews:submit', repoPath, prId, reviewId),
  newReview: (repoPath: string, prId: string): Promise<PrDetail | { error: string }> =>
    ipcRenderer.invoke('reviews:new', repoPath, prId),
  downloadMarkdown: (repoPath: string, prId: string, reviewId: string): Promise<{ path: string } | { error: string }> =>
    ipcRenderer.invoke('export:download-markdown', repoPath, prId, reviewId),

  getDiffAtShas: (repoPath: string, baseSha: string, compareSha: string): Promise<ParsedFile[] | { error: string }> =>
    ipcRenderer.invoke('git:diff-at-shas', repoPath, baseSha, compareSha),

  deleteComment: (repoPath: string, prId: string, reviewId: string, commentId: string): Promise<ReviewFile | { error: string }> =>
    ipcRenderer.invoke('comments:delete', repoPath, prId, reviewId, commentId),

  // Commits
  listCommits: (prId: string, repoPath: string): Promise<Commit[] | { error: string }> =>
    ipcRenderer.invoke('commits:list', prId, repoPath),
  showCommit: (repoPath: string, hash: string): Promise<{ diff: ParsedFile[] } | { error: string }> =>
    ipcRenderer.invoke('commits:show', repoPath, hash),

  // MCP controls
  getMcpStatus: (): Promise<{ running: boolean }> =>
    ipcRenderer.invoke('mcp:get-status'),
  toggleMcp: (): Promise<{ running: boolean }> =>
    ipcRenderer.invoke('mcp:toggle'),

  // Integrations
  getIntegrations: (): Promise<IntegrationStatus[]> =>
    ipcRenderer.invoke('integrations:get'),
  installIntegrations: (): Promise<void> =>
    ipcRenderer.invoke('integrations:install'),

  // "Fix with" launcher
  launchFix: (tool: 'claude' | 'vscode', repoPath: string, prId: string, reviewId: string): Promise<{ error?: string; notification?: string }> =>
    ipcRenderer.invoke('fix:launch', tool, repoPath, prId, reviewId),

  assignPr: (repoPath: string, prId: string, assignee: 'claude' | 'vscode' | null): Promise<import('../shared/types').PRFile | { error: string }> =>
    ipcRenderer.invoke('prs:assign', repoPath, prId, assignee),

  getRemoteInfo: (repoPath: string): Promise<{ owner: string; repo: string } | null> =>
    ipcRenderer.invoke('git:remote-info', repoPath),
  isWorkingDirClean: (repoPath: string): Promise<{ clean: boolean }> =>
    ipcRenderer.invoke('git:working-dir-clean', repoPath),
  isBranchPushed: (repoPath: string, branch: string): Promise<{ pushed: boolean }> =>
    ipcRenderer.invoke('git:branch-pushed', repoPath, branch),
  pushBranch: (repoPath: string, branch: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke('git:push-branch', repoPath, branch),

  // Push events from main to renderer.
  // Each `on*` returns a cleanup function that removes only this listener,
  // so multiple components can subscribe to the same channel independently.
  onMcpStatusChanged: (callback: (data: { running: boolean }) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, data: { running: boolean }) => callback(data)
    ipcRenderer.on('mcp:status-changed', listener)
    return () => ipcRenderer.removeListener('mcp:status-changed', listener)
  },

  onPrUpdated: (callback: (data: { repoPath: string; prId: string }) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, data: { repoPath: string; prId: string }) => callback(data)
    ipcRenderer.on('pr:updated', listener)
    return () => ipcRenderer.removeListener('pr:updated', listener)
  },

  onReviewUpdated: (callback: (data: { repoPath: string; prId: string; reviewId: string }) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, data: { repoPath: string; prId: string; reviewId: string }) => callback(data)
    ipcRenderer.on('review:updated', listener)
    return () => ipcRenderer.removeListener('review:updated', listener)
  },
}

const fullApi = { ...api, platform: process.platform as NodeJS.Platform }
contextBridge.exposeInMainWorld('api', fullApi)

export type Api = typeof fullApi

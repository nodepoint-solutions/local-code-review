import { contextBridge, ipcRenderer } from 'electron'
import type {
  Repository, PullRequest, Review, Comment,
  ParsedFile, PrDetail, CreatePrPayload, AddCommentPayload, ExportResult, Commit
} from '../shared/types'

const api = {
  // Repos
  listRepos: (): Promise<Repository[]> =>
    ipcRenderer.invoke('repos:list'),
  openRepo: (): Promise<{ repo?: Repository; error?: string }> =>
    ipcRenderer.invoke('repos:open'),

  // Branches
  listBranches: (repoPath: string): Promise<string[]> =>
    ipcRenderer.invoke('branches:list', repoPath),

  // PRs
  listPrs: (repoId: string): Promise<PullRequest[]> =>
    ipcRenderer.invoke('prs:list', repoId),
  createPr: (payload: CreatePrPayload & { repoPath: string }): Promise<PullRequest> =>
    ipcRenderer.invoke('prs:create', payload),
  getPr: (prId: string, repoPath: string): Promise<PrDetail | null> =>
    ipcRenderer.invoke('prs:get', prId, repoPath),
  refreshPr: (prId: string, repoPath: string): Promise<PrDetail | null> =>
    ipcRenderer.invoke('prs:refresh', prId, repoPath),

  // Reviews & Comments
  getCurrentReview: (prId: string): Promise<Review | null> =>
    ipcRenderer.invoke('reviews:get-current', prId),
  addComment: (payload: AddCommentPayload & { repoPath: string }): Promise<{ review: Review; comment: Comment }> =>
    ipcRenderer.invoke('comments:add', payload),
  listComments: (reviewId: string): Promise<Comment[]> =>
    ipcRenderer.invoke('comments:list', reviewId),

  // Commits
  listCommits: (prId: string, repoPath: string): Promise<Commit[] | { error: string }> =>
    ipcRenderer.invoke('commits:list', prId, repoPath),
  showCommit: (repoPath: string, hash: string): Promise<{ diff: ParsedFile[] } | { error: string }> =>
    ipcRenderer.invoke('commits:show', repoPath, hash),

  // Export
  submitAndExport: (reviewId: string, prId: string): Promise<ExportResult | { error: string }> =>
    ipcRenderer.invoke('export:submit', reviewId, prId),
}

contextBridge.exposeInMainWorld('api', api)

// Type augmentation for renderer TypeScript
export type Api = typeof api

// src/shared/types.ts
export type {
  PRFile,
  ReviewFile,
  ReviewComment,
  Resolution,
  ContextLineEntry,
} from './review-store'
export { PRWorkflow } from './pr-workflow'
export type { WorkflowPhase } from './pr-workflow'

// Install error the main process raises when the user dismisses the macOS
// authorization dialog. The renderer matches on it to show a calm
// cancellation banner rather than a failure.
export const UPDATE_AUTH_DECLINED = 'administrator authorization declined'

// ── Repository types (SQLite-backed) ─────────────────────────────────────────

export interface Repository {
  id: string
  path: string
  name: string
  created_at: string
  last_visited_at: string | null
}

export interface RepositoryWithMeta extends Repository {
  pr_count: number
}

export interface DiscoveredRepo {
  path: string
  name: string
}

// ── Diff types ───────────────────────────────────────────────────────────────

export type DiffLineType = 'added' | 'removed' | 'context' | 'hunk-header'

export interface ParsedLine {
  diffLineNumber: number
  type: DiffLineType
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
}

export interface ParsedFile {
  oldPath: string
  newPath: string
  isNew: boolean
  isDeleted: boolean
  isRenamed: boolean
  lines: ParsedLine[]
}

// ── IPC payload types ────────────────────────────────────────────────────────

export interface CreatePrPayload {
  repoPath: string
  title: string
  description: string | null
  baseBranch: string
  compareBranch: string
  assignee: 'claude' | 'copilot' | null
}

export interface AddCommentPayload {
  repoPath: string
  prId: string
  reviewId: string
  file: string
  startLine: number
  endLine: number
  side: 'left' | 'right'
  body: string
  context: Array<{ line: number; type: 'added' | 'removed' | 'context'; content: string }>
}

// ── Composite view types ──────────────────────────────────────────────────────

import type { PRFile, ReviewFile } from './review-store'
import type { WorkflowPhase } from './pr-workflow'

export interface PrDetail {
  pr: PRFile
  diff: ParsedFile[]
  review: ReviewFile | null
  reviews: ReviewFile[]
  reviewCommitCounts: Record<string, number>
  isStale: boolean
}

/** PR list row: the PR plus the review state the list surfaces at a glance. */
export type PRListItem = PRFile & {
  workflowPhase: WorkflowPhase
  openComments: number
}

// ── Commits ───────────────────────────────────────────────────────────────────

export interface Commit {
  hash: string
  shortHash: string
  subject: string
  authorName: string
  authorEmail: string
  timestamp: number
}

// ── MCP / Integrations ────────────────────────────────────────────────────────

export interface IntegrationStatus {
  id: 'claudeCode' | 'claudeDesktop' | 'copilotCli' | 'vscode' | 'cursor' | 'windsurf'
  name: string
  detected: boolean
  installed: boolean
  skillInstalled: boolean
}

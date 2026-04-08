// ── Entity types (mirror the SQLite schema) ─────────────────────────────────

export interface Repository {
  id: string
  path: string
  name: string
  created_at: string
}

export interface PullRequest {
  id: string
  repo_id: string
  title: string
  description: string | null
  base_branch: string
  compare_branch: string
  base_sha: string
  compare_sha: string
  status: 'open' | 'closed'
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  pr_id: string
  status: 'in_progress' | 'submitted'
  submitted_at: string | null
  created_at: string
}

export interface Comment {
  id: string
  review_id: string
  file_path: string
  start_line: number
  end_line: number
  side: 'left' | 'right'
  body: string
  is_stale: boolean
  created_at: string
}

export interface CommentContext {
  id: string
  comment_id: string
  context_lines: ContextLine[]
}

export interface ContextLine {
  line_number: number
  type: 'added' | 'removed' | 'context'
  content: string
}

// ── Diff types ───────────────────────────────────────────────────────────────

export type DiffLineType = 'added' | 'removed' | 'context' | 'hunk-header'

export interface ParsedLine {
  diffLineNumber: number    // 1-based sequential index within this file's diff
  type: DiffLineType
  content: string           // raw line content (no leading +/-/ prefix for code lines)
  oldLineNumber: number | null  // null for added lines and hunk-header
  newLineNumber: number | null  // null for removed lines and hunk-header
}

export interface ParsedFile {
  oldPath: string           // e.g. "src/foo.ts"
  newPath: string           // e.g. "src/foo.ts" (same unless renamed)
  isNew: boolean
  isDeleted: boolean
  isRenamed: boolean
  lines: ParsedLine[]       // all lines across all hunks, flattened
}

// ── IPC payload types ────────────────────────────────────────────────────────

export interface CreatePrPayload {
  repoId: string
  title: string
  description: string | null
  baseBranch: string
  compareBranch: string
}

export interface AddCommentPayload {
  prId: string
  filePath: string
  startLine: number
  endLine: number
  side: 'left' | 'right'
  body: string
  contextLines: ContextLine[]
}

export interface PrDetail {
  pr: PullRequest
  diff: ParsedFile[]
  review: Review | null
  comments: Comment[]
  isStale: boolean
}

export interface ExportResult {
  mdPath: string
  jsonPath: string
}

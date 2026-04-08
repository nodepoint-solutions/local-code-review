# Local PR Reviewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Electron desktop app that simulates GitHub-style PR review — branch vs branch diff, inline comments, staged review submission, and LLM-friendly export.

**Architecture:** Electron with electron-vite build tooling. Main process owns all business logic: SQLite via better-sqlite3, git ops via child_process, diff parsing, and IPC handlers. Preload exposes a typed `window.api` surface. Renderer is React + Zustand — purely presentational, no direct DB or git access.

**Tech Stack:** Electron, electron-vite, React 18, TypeScript, better-sqlite3, Zustand, react-router-dom, Vitest, @testing-library/react, CSS Modules.

---

## File Map

```
local-code-review/
├── electron.vite.config.ts
├── vitest.workspace.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── src/
│   ├── shared/
│   │   └── types.ts                     # All entity + diff TypeScript types
│   ├── main/
│   │   ├── index.ts                     # App entry, BrowserWindow, IPC registration
│   │   ├── db/
│   │   │   ├── index.ts                 # SQLite connection singleton + init
│   │   │   ├── schema.ts                # CREATE TABLE SQL strings
│   │   │   ├── repos.ts                 # Repository CRUD
│   │   │   ├── prs.ts                   # Pull request CRUD
│   │   │   └── reviews.ts              # Review + comment CRUD
│   │   ├── git/
│   │   │   ├── runner.ts                # execGit() — spawn git subprocess
│   │   │   ├── branches.ts              # listBranches(), resolveSha()
│   │   │   └── diff-parser.ts           # parseDiff() — unified diff → ParsedFile[]
│   │   ├── export/
│   │   │   ├── markdown.ts              # buildMarkdown()
│   │   │   └── json.ts                  # buildJson()
│   │   ├── ipc/
│   │   │   ├── repos.ts                 # registerRepoHandlers()
│   │   │   ├── prs.ts                   # registerPrHandlers()
│   │   │   ├── reviews.ts               # registerReviewHandlers()
│   │   │   └── export.ts                # registerExportHandlers()
│   │   └── __tests__/
│   │       ├── db.test.ts
│   │       ├── diff-parser.test.ts
│   │       ├── export-markdown.test.ts
│   │       └── export-json.test.ts
│   ├── preload/
│   │   └── index.ts                     # contextBridge: window.api
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx                 # React root
│           ├── App.tsx                  # HashRouter + routes
│           ├── store/
│           │   └── index.ts             # Zustand store
│           ├── screens/
│           │   ├── Home.tsx             # Repo list
│           │   ├── Repo.tsx             # PR list for a repo
│           │   ├── OpenPR.tsx           # Branch picker + PR form
│           │   └── PR.tsx               # Main PR review view
│           ├── components/
│           │   ├── FileTree.tsx         # Sidebar file list
│           │   ├── StaleBanner.tsx      # Out-of-sync warning
│           │   ├── DiffView/
│           │   │   ├── index.tsx        # Container + unified/split toggle
│           │   │   ├── UnifiedDiff.tsx  # Unified renderer
│           │   │   ├── SplitDiff.tsx    # Split renderer
│           │   │   └── DiffLine.tsx     # Single row + gutter button
│           │   ├── CommentThread.tsx    # Inline comment display
│           │   ├── CommentBox.tsx       # New comment input
│           │   └── ReviewPanel.tsx      # Staged comments + submit button
│           └── __tests__/
│               ├── DiffLine.test.tsx
│               ├── CommentThread.test.tsx
│               └── ReviewPanel.test.tsx
```

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `vitest.workspace.ts`, `tsconfig*.json` (via scaffold then modify)

- [ ] **Step 1: Scaffold electron-vite with react-ts template**

```bash
cd /Users/nodepoint/Development/nodepoint/local-code-review
npm create @quick-start/electron@latest . -- --template react-ts --skip-git
```

Expected: project files created, no errors.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install better-sqlite3 uuid zustand react-router-dom
npm install --save-dev @types/better-sqlite3 @types/uuid vitest @vitest/ui @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom electron-rebuild
```

- [ ] **Step 3: Rebuild better-sqlite3 for Electron's Node version**

```bash
npx electron-rebuild -f -w better-sqlite3
```

Expected: `better-sqlite3` rebuilt successfully. If it fails, check that Xcode CLT is installed: `xcode-select --install`.

- [ ] **Step 4: Create vitest workspace config**

Create `vitest.workspace.ts`:
```ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'main',
      include: ['src/main/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'renderer',
      include: ['src/renderer/src/__tests__/**/*.test.tsx'],
      environment: 'jsdom',
      setupFiles: ['src/renderer/src/test-setup.ts'],
    },
  },
])
```

- [ ] **Step 5: Create renderer test setup file**

Create `src/renderer/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Add test scripts to package.json**

Open `package.json` and add to the `"scripts"` section:
```json
"test": "vitest --workspace vitest.workspace.ts",
"test:main": "vitest --workspace vitest.workspace.ts --project main",
"test:renderer": "vitest --workspace vitest.workspace.ts --project renderer"
```

- [ ] **Step 7: Verify dev environment starts**

```bash
npm run dev
```

Expected: Electron window opens with Vite dev server. Close it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite project with react-ts template"
```

---

## Task 2: Shared TypeScript types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create shared types**

Create `src/shared/types.ts`:
```ts
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
```

- [ ] **Step 2: Update tsconfig files to include shared/**

Open `tsconfig.node.json` (used by main + preload). Add `"src/shared/**/*"` to the `include` array if not already covered by a wildcard. Verify `src/shared` is reachable from main imports.

Open `tsconfig.web.json` (used by renderer). Same — ensure `src/shared/**/*` is included.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts tsconfig.node.json tsconfig.web.json
git commit -m "feat: add shared TypeScript entity and diff types"
```

---

## Task 3: Database init and schema

**Files:**
- Create: `src/main/db/schema.ts`, `src/main/db/index.ts`
- Create: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `src/main/__tests__/db.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../db/schema'

describe('database schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('creates all five tables', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('repositories')
    expect(names).toContain('pull_requests')
    expect(names).toContain('reviews')
    expect(names).toContain('comments')
    expect(names).toContain('comment_context')
  })

  it('enforces foreign key on pull_requests.repo_id', () => {
    db.pragma('foreign_keys = ON')
    expect(() => {
      db.prepare(`INSERT INTO pull_requests VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        'pr1', 'nonexistent-repo', 'title', null, 'main', 'feat', 'sha1', 'sha2', 'open',
        new Date().toISOString(), new Date().toISOString()
      )
    }).toThrow()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:main
```

Expected: FAIL — `Cannot find module '../db/schema'`

- [ ] **Step 3: Create schema.ts**

Create `src/main/db/schema.ts`:
```ts
import type Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id         TEXT PRIMARY KEY,
      path       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pull_requests (
      id             TEXT PRIMARY KEY,
      repo_id        TEXT NOT NULL REFERENCES repositories(id),
      title          TEXT NOT NULL,
      description    TEXT,
      base_branch    TEXT NOT NULL,
      compare_branch TEXT NOT NULL,
      base_sha       TEXT NOT NULL,
      compare_sha    TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'open',
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id           TEXT PRIMARY KEY,
      pr_id        TEXT NOT NULL REFERENCES pull_requests(id),
      status       TEXT NOT NULL DEFAULT 'in_progress',
      submitted_at TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id         TEXT PRIMARY KEY,
      review_id  TEXT NOT NULL REFERENCES reviews(id),
      file_path  TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line   INTEGER NOT NULL,
      side       TEXT NOT NULL DEFAULT 'right',
      body       TEXT NOT NULL,
      is_stale   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comment_context (
      id            TEXT PRIMARY KEY,
      comment_id    TEXT NOT NULL REFERENCES comments(id),
      context_lines TEXT NOT NULL
    );
  `)
}
```

- [ ] **Step 4: Create db/index.ts**

Create `src/main/db/index.ts`:
```ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { applySchema } from './schema'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  const dbPath = path.join(app.getPath('userData'), 'pr-reviewer.sqlite')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  applySchema(_db)
  return _db
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm run test:main
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/db/ src/main/__tests__/db.test.ts
git commit -m "feat: add SQLite schema and DB connection singleton"
```

---

## Task 4: Repository DB operations

**Files:**
- Create: `src/main/db/repos.ts`
- Modify: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/main/__tests__/db.test.ts`:
```ts
import { insertRepo, listRepos, findRepoByPath } from '../db/repos'

describe('repos', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('inserts and retrieves a repo', () => {
    const repo = insertRepo(db, '/projects/my-app', 'my-app')
    const found = findRepoByPath(db, '/projects/my-app')
    expect(found).not.toBeNull()
    expect(found!.id).toBe(repo.id)
    expect(found!.name).toBe('my-app')
  })

  it('returns existing repo if path already registered', () => {
    const r1 = insertRepo(db, '/projects/my-app', 'my-app')
    const r2 = insertRepo(db, '/projects/my-app', 'my-app')
    expect(r1.id).toBe(r2.id)
  })

  it('lists all repos', () => {
    insertRepo(db, '/a', 'a')
    insertRepo(db, '/b', 'b')
    expect(listRepos(db)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:main
```

Expected: FAIL — `Cannot find module '../db/repos'`

- [ ] **Step 3: Implement repos.ts**

Create `src/main/db/repos.ts`:
```ts
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Repository } from '../../shared/types'

export function findRepoByPath(db: Database.Database, repoPath: string): Repository | null {
  return (db.prepare('SELECT * FROM repositories WHERE path = ?').get(repoPath) as Repository) ?? null
}

export function insertRepo(db: Database.Database, repoPath: string, name: string): Repository {
  const existing = findRepoByPath(db, repoPath)
  if (existing) return existing
  const repo: Repository = {
    id: uuidv4(),
    path: repoPath,
    name,
    created_at: new Date().toISOString(),
  }
  db.prepare('INSERT INTO repositories (id, path, name, created_at) VALUES (?,?,?,?)').run(
    repo.id, repo.path, repo.name, repo.created_at
  )
  return repo
}

export function listRepos(db: Database.Database): Repository[] {
  return db.prepare('SELECT * FROM repositories ORDER BY created_at DESC').all() as Repository[]
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:main
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/repos.ts src/main/__tests__/db.test.ts
git commit -m "feat: add repository DB operations"
```

---

## Task 5: Pull request DB operations

**Files:**
- Create: `src/main/db/prs.ts`
- Modify: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/main/__tests__/db.test.ts`:
```ts
import { insertPr, listPrs, getPr, updatePrShas } from '../db/prs'

describe('pull_requests', () => {
  let db: Database.Database
  let repoId: string

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    const repo = insertRepo(db, '/projects/app', 'app')
    repoId = repo.id
  })

  it('inserts and retrieves a PR', () => {
    const pr = insertPr(db, {
      repoId,
      title: 'My PR',
      description: null,
      baseBranch: 'main',
      compareBranch: 'feat/thing',
      baseSha: 'aaa',
      compareSha: 'bbb',
    })
    const found = getPr(db, pr.id)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('My PR')
    expect(found!.base_sha).toBe('aaa')
  })

  it('lists PRs for a repo', () => {
    insertPr(db, { repoId, title: 'PR1', description: null, baseBranch: 'main', compareBranch: 'a', baseSha: 'x', compareSha: 'y' })
    insertPr(db, { repoId, title: 'PR2', description: null, baseBranch: 'main', compareBranch: 'b', baseSha: 'x', compareSha: 'z' })
    expect(listPrs(db, repoId)).toHaveLength(2)
  })

  it('updates SHAs on refresh', () => {
    const pr = insertPr(db, { repoId, title: 'PR', description: null, baseBranch: 'main', compareBranch: 'f', baseSha: 'old1', compareSha: 'old2' })
    updatePrShas(db, pr.id, 'new1', 'new2')
    const updated = getPr(db, pr.id)!
    expect(updated.base_sha).toBe('new1')
    expect(updated.compare_sha).toBe('new2')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:main
```

Expected: FAIL — `Cannot find module '../db/prs'`

- [ ] **Step 3: Implement prs.ts**

Create `src/main/db/prs.ts`:
```ts
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { PullRequest } from '../../shared/types'

interface InsertPrArgs {
  repoId: string
  title: string
  description: string | null
  baseBranch: string
  compareBranch: string
  baseSha: string
  compareSha: string
}

export function insertPr(db: Database.Database, args: InsertPrArgs): PullRequest {
  const now = new Date().toISOString()
  const pr: PullRequest = {
    id: uuidv4(),
    repo_id: args.repoId,
    title: args.title,
    description: args.description,
    base_branch: args.baseBranch,
    compare_branch: args.compareBranch,
    base_sha: args.baseSha,
    compare_sha: args.compareSha,
    status: 'open',
    created_at: now,
    updated_at: now,
  }
  db.prepare(`
    INSERT INTO pull_requests
      (id, repo_id, title, description, base_branch, compare_branch, base_sha, compare_sha, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(pr.id, pr.repo_id, pr.title, pr.description, pr.base_branch, pr.compare_branch,
         pr.base_sha, pr.compare_sha, pr.status, pr.created_at, pr.updated_at)
  return pr
}

export function getPr(db: Database.Database, id: string): PullRequest | null {
  return (db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(id) as PullRequest) ?? null
}

export function listPrs(db: Database.Database, repoId: string): PullRequest[] {
  return db.prepare('SELECT * FROM pull_requests WHERE repo_id = ? ORDER BY created_at DESC').all(repoId) as PullRequest[]
}

export function updatePrShas(db: Database.Database, id: string, baseSha: string, compareSha: string): void {
  db.prepare('UPDATE pull_requests SET base_sha = ?, compare_sha = ?, updated_at = ? WHERE id = ?')
    .run(baseSha, compareSha, new Date().toISOString(), id)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:main
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/prs.ts src/main/__tests__/db.test.ts
git commit -m "feat: add pull request DB operations"
```

---

## Task 6: Review and comment DB operations

**Files:**
- Create: `src/main/db/reviews.ts`
- Modify: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/main/__tests__/db.test.ts`:
```ts
import {
  getOrCreateInProgressReview,
  submitReview,
  addComment,
  listComments,
  markCommentsStale,
} from '../db/reviews'
import type { ContextLine } from '../../shared/types'

describe('reviews and comments', () => {
  let db: Database.Database
  let prId: string

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    const repo = insertRepo(db, '/projects/app', 'app')
    const pr = insertPr(db, { repoId: repo.id, title: 'PR', description: null, baseBranch: 'main', compareBranch: 'f', baseSha: 'x', compareSha: 'y' })
    prId = pr.id
  })

  it('creates a new in-progress review if none exists', () => {
    const review = getOrCreateInProgressReview(db, prId)
    expect(review.status).toBe('in_progress')
    expect(review.pr_id).toBe(prId)
  })

  it('returns the existing in-progress review on subsequent calls', () => {
    const r1 = getOrCreateInProgressReview(db, prId)
    const r2 = getOrCreateInProgressReview(db, prId)
    expect(r1.id).toBe(r2.id)
  })

  it('adds a comment with context and retrieves it', () => {
    const review = getOrCreateInProgressReview(db, prId)
    const ctx: ContextLine[] = [
      { line_number: 1, type: 'context', content: 'before' },
      { line_number: 2, type: 'added', content: 'the line' },
      { line_number: 3, type: 'context', content: 'after' },
    ]
    addComment(db, { reviewId: review.id, filePath: 'src/foo.ts', startLine: 2, endLine: 2, side: 'right', body: 'Fix this', contextLines: ctx })
    const comments = listComments(db, review.id)
    expect(comments).toHaveLength(1)
    expect(comments[0].body).toBe('Fix this')
    expect(comments[0].file_path).toBe('src/foo.ts')
  })

  it('submits a review', () => {
    const review = getOrCreateInProgressReview(db, prId)
    const submitted = submitReview(db, review.id)
    expect(submitted.status).toBe('submitted')
    expect(submitted.submitted_at).not.toBeNull()
  })

  it('marks comments as stale by line range', () => {
    const review = getOrCreateInProgressReview(db, prId)
    addComment(db, { reviewId: review.id, filePath: 'src/a.ts', startLine: 5, endLine: 7, side: 'right', body: 'old', contextLines: [] })
    markCommentsStale(db, review.id, 'src/a.ts', [{ startLine: 5, endLine: 7 }])
    const comments = listComments(db, review.id)
    expect(comments[0].is_stale).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:main
```

Expected: FAIL — `Cannot find module '../db/reviews'`

- [ ] **Step 3: Implement reviews.ts**

Create `src/main/db/reviews.ts`:
```ts
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Comment, ContextLine, Review } from '../../shared/types'

interface AddCommentArgs {
  reviewId: string
  filePath: string
  startLine: number
  endLine: number
  side: 'left' | 'right'
  body: string
  contextLines: ContextLine[]
}

export function getOrCreateInProgressReview(db: Database.Database, prId: string): Review {
  const existing = db.prepare(
    `SELECT * FROM reviews WHERE pr_id = ? AND status = 'in_progress' LIMIT 1`
  ).get(prId) as Review | undefined
  if (existing) return existing

  const review: Review = {
    id: uuidv4(),
    pr_id: prId,
    status: 'in_progress',
    submitted_at: null,
    created_at: new Date().toISOString(),
  }
  db.prepare(`INSERT INTO reviews (id, pr_id, status, submitted_at, created_at) VALUES (?,?,?,?,?)`)
    .run(review.id, review.pr_id, review.status, review.submitted_at, review.created_at)
  return review
}

export function submitReview(db: Database.Database, reviewId: string): Review {
  const now = new Date().toISOString()
  db.prepare(`UPDATE reviews SET status = 'submitted', submitted_at = ? WHERE id = ?`).run(now, reviewId)
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as Review
}

export function addComment(db: Database.Database, args: AddCommentArgs): Comment {
  const comment: Comment = {
    id: uuidv4(),
    review_id: args.reviewId,
    file_path: args.filePath,
    start_line: args.startLine,
    end_line: args.endLine,
    side: args.side,
    body: args.body,
    is_stale: false,
    created_at: new Date().toISOString(),
  }
  db.prepare(`
    INSERT INTO comments (id, review_id, file_path, start_line, end_line, side, body, is_stale, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(comment.id, comment.review_id, comment.file_path, comment.start_line,
         comment.end_line, comment.side, comment.body, 0, comment.created_at)

  const contextId = uuidv4()
  db.prepare(`INSERT INTO comment_context (id, comment_id, context_lines) VALUES (?,?,?)`)
    .run(contextId, comment.id, JSON.stringify(args.contextLines))

  return comment
}

export function listComments(db: Database.Database, reviewId: string): Comment[] {
  const rows = db.prepare('SELECT * FROM comments WHERE review_id = ? ORDER BY created_at ASC').all(reviewId) as any[]
  return rows.map((r) => ({ ...r, is_stale: Boolean(r.is_stale) }))
}

export function getCommentContext(db: Database.Database, commentId: string): ContextLine[] {
  const row = db.prepare('SELECT context_lines FROM comment_context WHERE comment_id = ?').get(commentId) as { context_lines: string } | undefined
  if (!row) return []
  return JSON.parse(row.context_lines) as ContextLine[]
}

export function markCommentsStale(
  db: Database.Database,
  reviewId: string,
  filePath: string,
  staleRanges: { startLine: number; endLine: number }[]
): void {
  const comments = listComments(db, reviewId).filter((c) => c.file_path === filePath)
  const stmt = db.prepare('UPDATE comments SET is_stale = 1 WHERE id = ?')
  for (const comment of comments) {
    const isStale = staleRanges.some(
      (r) => comment.start_line >= r.startLine && comment.end_line <= r.endLine
    )
    if (isStale) stmt.run(comment.id)
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:main
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/reviews.ts src/main/__tests__/db.test.ts
git commit -m "feat: add review and comment DB operations"
```

---

## Task 7: Git runner

**Files:**
- Create: `src/main/git/runner.ts`

- [ ] **Step 1: Create runner.ts**

Create `src/main/git/runner.ts`:
```ts
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export class GitError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly code: number | null
  ) {
    super(message)
    this.name = 'GitError'
  }
}

export async function execGit(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      maxBuffer: 50 * 1024 * 1024, // 50MB — enough for large diffs
    })
    return stdout
  } catch (err: any) {
    throw new GitError(
      `git ${args[0]} failed: ${err.message}`,
      err.stderr ?? '',
      err.code ?? null
    )
  }
}

export function execGitSync(repoPath: string, args: string[]): string {
  const { execFileSync } = require('child_process') as typeof import('child_process')
  try {
    return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  } catch (err: any) {
    throw new GitError(
      `git ${args[0]} failed: ${err.message}`,
      err.stderr?.toString() ?? '',
      err.status ?? null
    )
  }
}
```

Note: `execGit` (async) is used for the IPC handlers. `execGitSync` is available for synchronous contexts if needed.

- [ ] **Step 2: Commit**

```bash
git add src/main/git/runner.ts
git commit -m "feat: add git subprocess runner"
```

---

## Task 8: Branch listing and SHA resolution

**Files:**
- Create: `src/main/git/branches.ts`

- [ ] **Step 1: Create branches.ts**

Create `src/main/git/branches.ts`:
```ts
import { execGit } from './runner'

export async function listBranches(repoPath: string): Promise<string[]> {
  const output = await execGit(repoPath, ['branch', '--format=%(refname:short)'])
  return output
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
}

export async function resolveSha(repoPath: string, ref: string): Promise<string> {
  const output = await execGit(repoPath, ['rev-parse', '--verify', ref])
  return output.trim()
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await execGit(dirPath, ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/git/branches.ts
git commit -m "feat: add branch listing and SHA resolution"
```

---

## Task 9: Unified diff parser

**Files:**
- Create: `src/main/git/diff-parser.ts`
- Create: `src/main/__tests__/diff-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/main/__tests__/diff-parser.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseDiff } from '../git/diff-parser'

const SIMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,4 +1,5 @@
 line one
-line two
+line two modified
+line two point five
 line three
 line four
`

const NEW_FILE_DIFF = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const x = 1
+export const y = 2
`

const DELETED_FILE_DIFF = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const x = 1
-export const y = 2
`

describe('parseDiff', () => {
  it('parses a simple modification', () => {
    const files = parseDiff(SIMPLE_DIFF)
    expect(files).toHaveLength(1)
    expect(files[0].oldPath).toBe('src/foo.ts')
    expect(files[0].newPath).toBe('src/foo.ts')
    expect(files[0].isNew).toBe(false)
    expect(files[0].isDeleted).toBe(false)
  })

  it('produces sequential diffLineNumbers starting at 1', () => {
    const files = parseDiff(SIMPLE_DIFF)
    const lineNums = files[0].lines.map((l) => l.diffLineNumber)
    expect(lineNums[0]).toBe(1)
    expect(lineNums).toEqual([...lineNums.keys()].map((i) => i + 1))
  })

  it('assigns correct types to lines', () => {
    const files = parseDiff(SIMPLE_DIFF)
    const types = files[0].lines.map((l) => l.type)
    expect(types).toContain('context')
    expect(types).toContain('removed')
    expect(types).toContain('added')
  })

  it('tracks old and new line numbers correctly', () => {
    const files = parseDiff(SIMPLE_DIFF)
    const removed = files[0].lines.find((l) => l.type === 'removed')!
    expect(removed.oldLineNumber).toBe(2)
    expect(removed.newLineNumber).toBeNull()
    const added = files[0].lines.find((l) => l.type === 'added')!
    expect(added.oldLineNumber).toBeNull()
    expect(added.newLineNumber).not.toBeNull()
  })

  it('detects new files', () => {
    const files = parseDiff(NEW_FILE_DIFF)
    expect(files[0].isNew).toBe(true)
    expect(files[0].isDeleted).toBe(false)
    const allAdded = files[0].lines.every((l) => l.type === 'added')
    expect(allAdded).toBe(true)
  })

  it('detects deleted files', () => {
    const files = parseDiff(DELETED_FILE_DIFF)
    expect(files[0].isDeleted).toBe(true)
    expect(files[0].isNew).toBe(false)
    const allRemoved = files[0].lines.every((l) => l.type === 'removed')
    expect(allRemoved).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(parseDiff('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:main
```

Expected: FAIL — `Cannot find module '../git/diff-parser'`

- [ ] **Step 3: Implement diff-parser.ts**

Create `src/main/git/diff-parser.ts`:
```ts
import type { ParsedFile, ParsedLine, DiffLineType } from '../../shared/types'

export function parseDiff(raw: string): ParsedFile[] {
  if (!raw.trim()) return []

  const files: ParsedFile[] = []
  const fileBlocks = raw.split(/^diff --git /m).filter(Boolean)

  for (const block of fileBlocks) {
    const lines = block.split('\n')
    const headerLine = lines[0] // "a/src/foo.ts b/src/foo.ts"
    const [aPath, bPath] = headerLine.trim().split(' ')
    const oldPath = aPath.replace(/^a\//, '')
    const newPath = bPath.replace(/^b\//, '')

    const isNew = block.includes('\nnew file mode')
    const isDeleted = block.includes('\ndeleted file mode')
    const isRenamed = oldPath !== newPath

    const parsedLines: ParsedLine[] = []
    let diffLineNumber = 0
    let oldLine = 0
    let newLine = 0
    let inHunk = false

    for (const rawLine of lines) {
      if (rawLine.startsWith('@@')) {
        inHunk = true
        // Parse @@ -oldStart[,count] +newStart[,count] @@
        const match = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match) {
          oldLine = parseInt(match[1], 10)
          newLine = parseInt(match[2], 10)
          // For new files, git uses @@ -0,0 +1,n @@
          if (isNew) oldLine = 0
          if (isDeleted) newLine = 0
        }
        diffLineNumber++
        parsedLines.push({
          diffLineNumber,
          type: 'hunk-header',
          content: rawLine,
          oldLineNumber: null,
          newLineNumber: null,
        })
        continue
      }

      if (!inHunk) continue

      // Skip meta-lines (index, ---, +++)
      if (
        rawLine.startsWith('index ') ||
        rawLine.startsWith('--- ') ||
        rawLine.startsWith('+++ ') ||
        rawLine.startsWith('Binary') ||
        rawLine.startsWith('new file') ||
        rawLine.startsWith('deleted file') ||
        rawLine.startsWith('rename ')
      ) {
        continue
      }

      // End of file block
      if (rawLine.startsWith('diff --git')) break

      let type: DiffLineType
      let content: string

      if (rawLine.startsWith('+')) {
        type = 'added'
        content = rawLine.slice(1)
        diffLineNumber++
        parsedLines.push({ diffLineNumber, type, content, oldLineNumber: null, newLineNumber: newLine })
        newLine++
      } else if (rawLine.startsWith('-')) {
        type = 'removed'
        content = rawLine.slice(1)
        diffLineNumber++
        parsedLines.push({ diffLineNumber, type, content, oldLineNumber: oldLine, newLineNumber: null })
        oldLine++
      } else if (rawLine.startsWith(' ')) {
        type = 'context'
        content = rawLine.slice(1)
        diffLineNumber++
        parsedLines.push({ diffLineNumber, type, content, oldLineNumber: oldLine, newLineNumber: newLine })
        oldLine++
        newLine++
      }
      // Blank line at end of hunk — skip
    }

    files.push({ oldPath, newPath, isNew, isDeleted, isRenamed, lines: parsedLines })
  }

  return files
}

/** Extract the context window for a comment (3 lines above + selected + 3 lines below). */
export function extractContext(
  fileLines: ParsedLine[],
  startLine: number,
  endLine: number
): ParsedLine[] {
  const codeLines = fileLines.filter((l) => l.type !== 'hunk-header')
  const startIdx = codeLines.findIndex((l) => l.diffLineNumber === startLine)
  const endIdx = codeLines.findIndex((l) => l.diffLineNumber === endLine)
  if (startIdx === -1 || endIdx === -1) return []
  const from = Math.max(0, startIdx - 3)
  const to = Math.min(codeLines.length - 1, endIdx + 3)
  return codeLines.slice(from, to + 1)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:main
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/git/diff-parser.ts src/main/__tests__/diff-parser.test.ts
git commit -m "feat: add unified diff parser with context extraction"
```

---

## Task 10: Markdown export generator

**Files:**
- Create: `src/main/export/markdown.ts`
- Create: `src/main/__tests__/export-markdown.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/main/__tests__/export-markdown.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildMarkdown } from '../export/markdown'
import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

const pr: PullRequest = {
  id: 'pr1', repo_id: 'r1', title: 'Fix auth bug', description: null,
  base_branch: 'main', compare_branch: 'feat/auth',
  base_sha: 'abc', compare_sha: 'def',
  status: 'open', created_at: '2026-04-08T10:00:00Z', updated_at: '2026-04-08T10:00:00Z',
}

const review: Review = {
  id: 'rev1', pr_id: 'pr1', status: 'submitted',
  submitted_at: '2026-04-08T12:00:00Z', created_at: '2026-04-08T10:00:00Z',
}

const comments: Comment[] = [
  {
    id: 'c1', review_id: 'rev1', file_path: 'src/auth.ts',
    start_line: 5, end_line: 5, side: 'right', body: 'Use httpOnly cookie', is_stale: false,
    created_at: '2026-04-08T11:00:00Z',
  },
]

const contextMap: Record<string, ContextLine[]> = {
  c1: [
    { line_number: 4, type: 'context', content: 'const token = sign(payload)' },
    { line_number: 5, type: 'added', content: 'res.send(token)' },
    { line_number: 6, type: 'context', content: 'res.end()' },
  ],
}

describe('buildMarkdown', () => {
  it('includes PR title and branches', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('Fix auth bug')
    expect(md).toContain('feat/auth')
    expect(md).toContain('main')
  })

  it('assigns sequential RVW- IDs', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('RVW-001')
  })

  it('includes file path and body', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('src/auth.ts')
    expect(md).toContain('Use httpOnly cookie')
  })

  it('includes code context with markers', () => {
    const md = buildMarkdown(pr, review, comments, contextMap)
    expect(md).toContain('[selected lines start]')
    expect(md).toContain('[selected lines end]')
    expect(md).toContain('res.send(token)')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:main
```

Expected: FAIL — `Cannot find module '../export/markdown'`

- [ ] **Step 3: Implement markdown.ts**

Create `src/main/export/markdown.ts`:
```ts
import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

export function buildMarkdown(
  pr: PullRequest,
  review: Review,
  comments: Comment[],
  contextMap: Record<string, ContextLine[]>
): string {
  const date = review.submitted_at
    ? new Date(review.submitted_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    `# Review: ${pr.title}`,
    `**PR:** \`${pr.compare_branch}\` → \`${pr.base_branch}\``,
    `**Submitted:** ${date}`,
    `**Review ID:** \`${review.id}\``,
    '',
    '---',
    '',
  ]

  const nonStale = comments.filter((c) => !c.is_stale)

  nonStale.forEach((comment, index) => {
    const id = `RVW-${String(index + 1).padStart(3, '0')}`
    const ctx = contextMap[comment.id] ?? []

    lines.push(`## Issue ${id}`)
    lines.push(`**File:** \`${comment.file_path}\``)
    lines.push(`**Lines:** ${comment.start_line}–${comment.end_line}`)
    lines.push('')

    // Determine file extension for syntax highlighting
    const ext = comment.file_path.split('.').pop() ?? ''
    lines.push('```' + ext)

    for (const ctxLine of ctx) {
      const isSelected = ctxLine.line_number >= comment.start_line && ctxLine.line_number <= comment.end_line
      if (ctxLine.line_number === comment.start_line) {
        lines.push('// [selected lines start]')
      }
      lines.push(ctxLine.content)
      if (ctxLine.line_number === comment.end_line) {
        lines.push('// [selected lines end]')
      }
    }

    lines.push('```')
    lines.push('')
    lines.push(`**Comment:**`)
    lines.push(comment.body)
    lines.push('')
    lines.push('---')
    lines.push('')
  })

  return lines.join('\n')
}

export function prTitleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:main
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/export/markdown.ts src/main/__tests__/export-markdown.test.ts
git commit -m "feat: add markdown export generator"
```

---

## Task 11: JSON export generator

**Files:**
- Create: `src/main/export/json.ts`
- Create: `src/main/__tests__/export-json.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/main/__tests__/export-json.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildJson } from '../export/json'
import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

const pr: PullRequest = {
  id: 'pr1', repo_id: 'r1', title: 'Fix auth bug', description: null,
  base_branch: 'main', compare_branch: 'feat/auth',
  base_sha: 'abc123', compare_sha: 'def456',
  status: 'open', created_at: '2026-04-08T10:00:00Z', updated_at: '2026-04-08T10:00:00Z',
}

const review: Review = {
  id: 'rev1', pr_id: 'pr1', status: 'submitted',
  submitted_at: '2026-04-08T12:00:00Z', created_at: '2026-04-08T10:00:00Z',
}

const comments: Comment[] = [
  {
    id: 'c1', review_id: 'rev1', file_path: 'src/auth.ts',
    start_line: 5, end_line: 5, side: 'right', body: 'Use httpOnly cookie', is_stale: false,
    created_at: '2026-04-08T11:00:00Z',
  },
]

const contextMap: Record<string, ContextLine[]> = {
  c1: [{ line_number: 5, type: 'added', content: 'res.send(token)' }],
}

describe('buildJson', () => {
  it('is valid JSON', () => {
    const output = buildJson(pr, review, comments, contextMap)
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it('includes PR metadata', () => {
    const obj = JSON.parse(buildJson(pr, review, comments, contextMap))
    expect(obj.pr.title).toBe('Fix auth bug')
    expect(obj.pr.base_sha).toBe('abc123')
    expect(obj.pr.compare_sha).toBe('def456')
  })

  it('assigns sequential RVW- IDs to comments', () => {
    const obj = JSON.parse(buildJson(pr, review, comments, contextMap))
    expect(obj.comments[0].id).toBe('RVW-001')
  })

  it('includes context with line numbers', () => {
    const obj = JSON.parse(buildJson(pr, review, comments, contextMap))
    expect(obj.comments[0].context[0].content).toBe('res.send(token)')
    expect(obj.comments[0].context[0].type).toBe('added')
  })

  it('excludes stale comments', () => {
    const staleComments: Comment[] = [
      { ...comments[0], is_stale: true },
    ]
    const obj = JSON.parse(buildJson(pr, review, staleComments, contextMap))
    expect(obj.comments).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:main
```

Expected: FAIL — `Cannot find module '../export/json'`

- [ ] **Step 3: Implement json.ts**

Create `src/main/export/json.ts`:
```ts
import type { Comment, ContextLine, PullRequest, Review } from '../../shared/types'

export function buildJson(
  pr: PullRequest,
  review: Review,
  comments: Comment[],
  contextMap: Record<string, ContextLine[]>
): string {
  const nonStale = comments.filter((c) => !c.is_stale)

  const output = {
    review_id: review.id,
    pr: {
      title: pr.title,
      base: pr.base_branch,
      compare: pr.compare_branch,
      base_sha: pr.base_sha,
      compare_sha: pr.compare_sha,
    },
    submitted_at: review.submitted_at,
    comments: nonStale.map((comment, index) => ({
      id: `RVW-${String(index + 1).padStart(3, '0')}`,
      file: comment.file_path,
      start_line: comment.start_line,
      end_line: comment.end_line,
      context: (contextMap[comment.id] ?? []).map((l) => ({
        line: l.line_number,
        type: l.type,
        content: l.content,
      })),
      body: comment.body,
    })),
  }

  return JSON.stringify(output, null, 2)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:main
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/export/json.ts src/main/__tests__/export-json.test.ts
git commit -m "feat: add JSON export generator"
```

---

## Task 12: IPC handlers — repositories

**Files:**
- Create: `src/main/ipc/repos.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create repo IPC handlers**

Create `src/main/ipc/repos.ts`:
```ts
import { ipcMain, dialog } from 'electron'
import path from 'path'
import type Database from 'better-sqlite3'
import { insertRepo, listRepos } from '../db/repos'
import { isGitRepo } from '../git/branches'

export function registerRepoHandlers(db: Database.Database): void {
  ipcMain.handle('repos:list', () => listRepos(db))

  ipcMain.handle('repos:open', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select a Git Repository',
    })
    if (result.canceled || !result.filePaths[0]) return { error: 'cancelled' }

    const repoPath = result.filePaths[0]
    const valid = await isGitRepo(repoPath)
    if (!valid) return { error: 'not-a-git-repo' }

    const name = path.basename(repoPath)
    const repo = insertRepo(db, repoPath, name)
    return { repo }
  })
}
```

- [ ] **Step 2: Wire IPC into main/index.ts**

Open `src/main/index.ts`. At the bottom of the existing `app.whenReady()` block (after the window is created), add:

```ts
import { getDb } from './db'
import { registerRepoHandlers } from './ipc/repos'

// inside app.whenReady():
const db = getDb()
registerRepoHandlers(db)
```

Ensure imports are at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/repos.ts src/main/index.ts
git commit -m "feat: add repos IPC handlers"
```

---

## Task 13: IPC handlers — pull requests

**Files:**
- Create: `src/main/ipc/prs.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create PR IPC handlers**

Create `src/main/ipc/prs.ts`:
```ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { insertPr, getPr, listPrs, updatePrShas } from '../db/prs'
import { getOrCreateInProgressReview, listComments, markCommentsStale } from '../db/reviews'
import { listBranches, resolveSha } from '../git/branches'
import { execGit } from '../git/runner'
import { parseDiff, extractContext } from '../git/diff-parser'
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
```

- [ ] **Step 2: Register in main/index.ts**

Add to `src/main/index.ts` (after `registerRepoHandlers`):
```ts
import { registerPrHandlers } from './ipc/prs'
// inside app.whenReady():
registerPrHandlers(db)
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/prs.ts src/main/index.ts
git commit -m "feat: add PR IPC handlers with diff and staleness"
```

---

## Task 14: IPC handlers — reviews and comments

**Files:**
- Create: `src/main/ipc/reviews.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create review IPC handlers**

Create `src/main/ipc/reviews.ts`:
```ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getOrCreateInProgressReview, addComment, listComments, getCommentContext } from '../db/reviews'
import type { AddCommentPayload } from '../../shared/types'

export function registerReviewHandlers(db: Database.Database): void {
  ipcMain.handle('reviews:get-current', (_e, prId: string) => {
    return db.prepare(`SELECT * FROM reviews WHERE pr_id = ? AND status = 'in_progress' LIMIT 1`).get(prId) ?? null
  })

  ipcMain.handle('comments:add', async (_e, payload: AddCommentPayload & { repoPath: string }) => {
    const review = getOrCreateInProgressReview(db, payload.prId)
    const comment = addComment(db, {
      reviewId: review.id,
      filePath: payload.filePath,
      startLine: payload.startLine,
      endLine: payload.endLine,
      side: payload.side,
      body: payload.body,
      contextLines: payload.contextLines,
    })
    return { review, comment }
  })

  ipcMain.handle('comments:list', (_e, reviewId: string) => listComments(db, reviewId))

  ipcMain.handle('comments:context', (_e, commentId: string) => getCommentContext(db, commentId))
}
```

- [ ] **Step 2: Register in main/index.ts**

Add to `src/main/index.ts`:
```ts
import { registerReviewHandlers } from './ipc/reviews'
// inside app.whenReady():
registerReviewHandlers(db)
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/reviews.ts src/main/index.ts
git commit -m "feat: add review and comment IPC handlers"
```

---

## Task 15: IPC handlers — export and submit

**Files:**
- Create: `src/main/ipc/export.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create export IPC handlers**

Create `src/main/ipc/export.ts`:
```ts
import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'
import { getPr } from '../db/prs'
import { submitReview, listComments, getCommentContext } from '../db/reviews'
import { buildMarkdown, prTitleSlug } from '../export/markdown'
import { buildJson } from '../export/json'
import type { ExportResult } from '../../shared/types'

export function registerExportHandlers(db: Database.Database): void {
  ipcMain.handle('export:submit', async (_e, reviewId: string, prId: string): Promise<ExportResult | { error: string }> => {
    const pr = getPr(db, prId)
    if (!pr) return { error: 'pr-not-found' }

    const review = submitReview(db, reviewId)
    const comments = listComments(db, reviewId)

    const contextMap: Record<string, any[]> = {}
    for (const comment of comments) {
      contextMap[comment.id] = getCommentContext(db, comment.id)
    }

    const md = buildMarkdown(pr, review, comments, contextMap)
    const json = buildJson(pr, review, comments, contextMap)

    const date = new Date().toISOString().slice(0, 10)
    const slug = prTitleSlug(pr.title)
    const defaultName = `review-${slug}-${date}`

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Review',
      defaultPath: defaultName + '.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })

    if (canceled || !filePath) return { error: 'cancelled' }

    const basePath = filePath.replace(/\.md$/, '')
    const mdPath = basePath + '.md'
    const jsonPath = basePath + '.json'

    fs.writeFileSync(mdPath, md, 'utf8')
    fs.writeFileSync(jsonPath, json, 'utf8')

    return { mdPath, jsonPath }
  })
}
```

- [ ] **Step 2: Register in main/index.ts**

Add to `src/main/index.ts`:
```ts
import { registerExportHandlers } from './ipc/export'
// inside app.whenReady():
registerExportHandlers(db)
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/export.ts src/main/index.ts
git commit -m "feat: add export/submit IPC handler"
```

---

## Task 16: Preload contextBridge API

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Replace preload with typed contextBridge**

Replace the contents of `src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Repository, PullRequest, Review, Comment, ContextLine,
  ParsedFile, PrDetail, CreatePrPayload, AddCommentPayload, ExportResult
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

  // Export
  submitAndExport: (reviewId: string, prId: string): Promise<ExportResult | { error: string }> =>
    ipcRenderer.invoke('export:submit', reviewId, prId),
}

contextBridge.exposeInMainWorld('api', api)

// Type augmentation for renderer TypeScript
export type Api = typeof api
```

- [ ] **Step 2: Add window.api type declaration for renderer**

Create `src/renderer/src/env.d.ts`:
```ts
import type { Api } from '../../../preload'

declare global {
  interface Window {
    api: Api
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat: add typed contextBridge preload API"
```

---

## Task 17: React app shell and routing

**Files:**
- Modify: `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Create: `src/renderer/src/store/index.ts`

- [ ] **Step 1: Create Zustand store**

Create `src/renderer/src/store/index.ts`:
```ts
import { create } from 'zustand'
import type { Repository, PullRequest, PrDetail } from '../../../shared/types'

interface AppState {
  repos: Repository[]
  setRepos: (repos: Repository[]) => void

  selectedRepo: Repository | null
  setSelectedRepo: (repo: Repository | null) => void

  prDetail: PrDetail | null
  setPrDetail: (detail: PrDetail | null) => void

  diffView: 'unified' | 'split'
  setDiffView: (view: 'unified' | 'split') => void

  reviewPanelOpen: boolean
  setReviewPanelOpen: (open: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  repos: [],
  setRepos: (repos) => set({ repos }),

  selectedRepo: null,
  setSelectedRepo: (repo) => set({ selectedRepo: repo }),

  prDetail: null,
  setPrDetail: (detail) => set({ prDetail: detail }),

  diffView: 'unified',
  setDiffView: (view) => set({ diffView: view }),

  reviewPanelOpen: false,
  setReviewPanelOpen: (open) => set({ reviewPanelOpen: open }),
}))
```

- [ ] **Step 2: Set up routing in App.tsx**

Replace `src/renderer/src/App.tsx`:
```tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './screens/Home'
import Repo from './screens/Repo'
import OpenPR from './screens/OpenPR'
import PR from './screens/PR'
import './app.css'

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/repo/:repoId" element={<Repo />} />
        <Route path="/repo/:repoId/open-pr" element={<OpenPR />} />
        <Route path="/repo/:repoId/pr/:prId" element={<PR />} />
      </Routes>
    </HashRouter>
  )
}
```

- [ ] **Step 3: Create global CSS**

Create `src/renderer/src/app.css`:
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0d1117;
  --bg-surface: #161b22;
  --bg-surface-2: #21262d;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #1f6feb;
  --accent-hover: #388bfd;
  --added: #2ea04326;
  --added-text: #3fb950;
  --removed: #f8514926;
  --removed-text: #f85149;
  --hunk: #1f2d3d;
  --comment-bg: #1c2128;
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px;
  height: 100vh;
  overflow: hidden;
}

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); }

button {
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 13px;
  background: var(--bg-surface-2);
  color: var(--text);
}
button:hover { background: var(--border); }
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
button.primary:hover { background: var(--accent-hover); }

select, input, textarea {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--font-sans);
}
textarea { font-family: var(--font-mono); resize: vertical; }
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/ src/renderer/src/App.tsx src/renderer/src/app.css
git commit -m "feat: add Zustand store and React router shell"
```

---

## Task 18: Home screen

**Files:**
- Create: `src/renderer/src/screens/Home.tsx`

- [ ] **Step 1: Create Home screen**

Create `src/renderer/src/screens/Home.tsx`:
```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import styles from './Home.module.css'

export default function Home(): JSX.Element {
  const navigate = useNavigate()
  const { repos, setRepos, setSelectedRepo } = useStore()

  useEffect(() => {
    window.api.listRepos().then(setRepos)
  }, [])

  async function handleOpenRepo(): Promise<void> {
    const result = await window.api.openRepo()
    if (result.error === 'not-a-git-repo') {
      alert('Selected folder is not a git repository.')
      return
    }
    if (result.repo) {
      const updated = await window.api.listRepos()
      setRepos(updated)
    }
  }

  function handleSelectRepo(repo: typeof repos[0]): void {
    setSelectedRepo(repo)
    navigate(`/repo/${repo.id}`)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Local PR Reviewer</h1>
        <button className="primary" onClick={handleOpenRepo}>Open Repository</button>
      </div>
      {repos.length === 0 ? (
        <div className={styles.empty}>
          <p>No repositories yet. Open a local git repository to get started.</p>
        </div>
      ) : (
        <ul className={styles.repoList}>
          {repos.map((repo) => (
            <li key={repo.id} className={styles.repoItem} onClick={() => handleSelectRepo(repo)}>
              <span className={styles.repoName}>{repo.name}</span>
              <span className={styles.repoPath}>{repo.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Create `src/renderer/src/screens/Home.module.css`:
```css
.container { display: flex; flex-direction: column; height: 100vh; padding: 32px; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.header h1 { font-size: 20px; font-weight: 600; }
.empty { color: var(--text-muted); margin-top: 48px; text-align: center; }
.repoList { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.repoItem {
  display: flex; flex-direction: column; gap: 2px;
  padding: 14px 16px; border: 1px solid var(--border);
  border-radius: 8px; cursor: pointer; background: var(--bg-surface);
}
.repoItem:hover { border-color: var(--accent); }
.repoName { font-weight: 500; }
.repoPath { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/screens/Home.tsx src/renderer/src/screens/Home.module.css
git commit -m "feat: add Home screen with repo list"
```

---

## Task 19: Repo screen and Open PR form

**Files:**
- Create: `src/renderer/src/screens/Repo.tsx`, `src/renderer/src/screens/OpenPR.tsx`

- [ ] **Step 1: Create Repo screen**

Create `src/renderer/src/screens/Repo.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import type { PullRequest } from '../../../../shared/types'
import styles from './Repo.module.css'

export default function Repo(): JSX.Element {
  const { repoId } = useParams<{ repoId: string }>()
  const navigate = useNavigate()
  const { repos, setSelectedRepo } = useStore()
  const [prs, setPrs] = useState<PullRequest[]>([])

  const repo = repos.find((r) => r.id === repoId)

  useEffect(() => {
    if (repo) {
      setSelectedRepo(repo)
      window.api.listPrs(repo.id).then(setPrs)
    }
  }, [repo?.id])

  if (!repo) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Repository not found.</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/')}>← Repositories</button>
        <h2>{repo.name}</h2>
        <button className="primary" onClick={() => navigate(`/repo/${repo.id}/open-pr`)}>Open PR</button>
      </div>
      {prs.length === 0 ? (
        <div className={styles.empty}>No pull requests yet.</div>
      ) : (
        <ul className={styles.prList}>
          {prs.map((pr) => (
            <li key={pr.id} className={styles.prItem} onClick={() => navigate(`/repo/${repo.id}/pr/${pr.id}`)}>
              <span className={styles.prTitle}>{pr.title}</span>
              <span className={styles.prBranches}>
                <code>{pr.compare_branch}</code> → <code>{pr.base_branch}</code>
              </span>
              <span className={`${styles.prStatus} ${styles[pr.status]}`}>{pr.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Create `src/renderer/src/screens/Repo.module.css`:
```css
.container { display: flex; flex-direction: column; height: 100vh; padding: 24px 32px; }
.header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.header h2 { flex: 1; font-size: 18px; font-weight: 600; }
.empty { color: var(--text-muted); margin-top: 48px; text-align: center; }
.prList { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.prItem {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border: 1px solid var(--border);
  border-radius: 8px; cursor: pointer; background: var(--bg-surface);
}
.prItem:hover { border-color: var(--accent); }
.prTitle { flex: 1; font-weight: 500; }
.prBranches { font-size: 12px; color: var(--text-muted); }
.prBranches code { background: var(--bg-surface-2); padding: 1px 5px; border-radius: 4px; }
.prStatus { font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 500; }
.open { background: #1a4a1a; color: var(--added-text); }
.closed { background: var(--bg-surface-2); color: var(--text-muted); }
```

- [ ] **Step 2: Create Open PR form**

Create `src/renderer/src/screens/OpenPR.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import styles from './OpenPR.module.css'

export default function OpenPR(): JSX.Element {
  const { repoId } = useParams<{ repoId: string }>()
  const navigate = useNavigate()
  const { repos } = useStore()
  const repo = repos.find((r) => r.id === repoId)

  const [branches, setBranches] = useState<string[]>([])
  const [baseBranch, setBaseBranch] = useState('')
  const [compareBranch, setCompareBranch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (repo) window.api.listBranches(repo.path).then(setBranches)
  }, [repo?.path])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!repo || !baseBranch || !compareBranch || !title) return
    if (baseBranch === compareBranch) {
      setError('Base and compare branches must be different.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const pr = await window.api.createPr({
        repoId: repo.id,
        repoPath: repo.path,
        title,
        description: description || null,
        baseBranch,
        compareBranch,
      })
      navigate(`/repo/${repo.id}/pr/${pr.id}`)
    } catch (err: any) {
      setError(err.message ?? 'Failed to create PR.')
    } finally {
      setLoading(false)
    }
  }

  if (!repo) return <div style={{ padding: 32 }}>Repository not found.</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate(`/repo/${repoId}`)}>← Back</button>
        <h2>Open Pull Request</h2>
      </div>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.branches}>
          <label>
            Base branch
            <select value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} required>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <span className={styles.arrow}>←</span>
          <label>
            Compare branch
            <select value={compareBranch} onChange={(e) => setCompareBranch(e.target.value)} required>
              <option value="">Select…</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PR title" required />
        </label>
        <label>
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this PR do?"
            rows={4}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Creating…' : 'Open Pull Request'}
        </button>
      </form>
    </div>
  )
}
```

Create `src/renderer/src/screens/OpenPR.module.css`:
```css
.container { display: flex; flex-direction: column; height: 100vh; padding: 24px 32px; max-width: 700px; }
.header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
.header h2 { font-size: 18px; font-weight: 600; }
.form { display: flex; flex-direction: column; gap: 16px; }
.form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; }
.form input, .form select, .form textarea { width: 100%; }
.branches { display: flex; align-items: flex-end; gap: 12px; }
.branches label { flex: 1; }
.arrow { font-size: 18px; color: var(--text-muted); padding-bottom: 6px; }
.error { color: var(--removed-text); font-size: 12px; }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/screens/Repo.tsx src/renderer/src/screens/Repo.module.css src/renderer/src/screens/OpenPR.tsx src/renderer/src/screens/OpenPR.module.css
git commit -m "feat: add Repo and OpenPR screens"
```

---

## Task 20: PR view layout and StaleBanner

**Files:**
- Create: `src/renderer/src/screens/PR.tsx`
- Create: `src/renderer/src/components/StaleBanner.tsx`
- Create: `src/renderer/src/components/FileTree.tsx`

- [ ] **Step 1: Create StaleBanner**

Create `src/renderer/src/components/StaleBanner.tsx`:
```tsx
import styles from './StaleBanner.module.css'

interface Props {
  onRefresh: () => void
  loading: boolean
}

export default function StaleBanner({ onRefresh, loading }: Props): JSX.Element {
  return (
    <div className={styles.banner}>
      <span>⚠ This PR is out of sync with its branches.</span>
      <button onClick={onRefresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}
```

Create `src/renderer/src/components/StaleBanner.module.css`:
```css
.banner {
  display: flex; align-items: center; justify-content: space-between;
  background: #3d2600; border-bottom: 1px solid #6e3c00;
  padding: 8px 16px; font-size: 13px; color: #f0a830;
}
```

- [ ] **Step 2: Create FileTree**

Create `src/renderer/src/components/FileTree.tsx`:
```tsx
import type { ParsedFile } from '../../../shared/types'
import styles from './FileTree.module.css'

interface Props {
  files: ParsedFile[]
  onSelect: (filePath: string) => void
}

export default function FileTree({ files, onSelect }: Props): JSX.Element {
  return (
    <div className={styles.tree}>
      <div className={styles.heading}>Files changed ({files.length})</div>
      <ul>
        {files.map((f) => (
          <li key={f.newPath}>
            <button className={styles.fileBtn} onClick={() => onSelect(f.newPath)}>
              {f.isNew && <span className={styles.badge} style={{ color: 'var(--added-text)' }}>A</span>}
              {f.isDeleted && <span className={styles.badge} style={{ color: 'var(--removed-text)' }}>D</span>}
              {f.isRenamed && <span className={styles.badge} style={{ color: '#d29922' }}>R</span>}
              {!f.isNew && !f.isDeleted && !f.isRenamed && <span className={styles.badge} style={{ color: 'var(--accent-hover)' }}>M</span>}
              <span className={styles.path}>{f.newPath}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Create `src/renderer/src/components/FileTree.module.css`:
```css
.tree { width: 260px; min-width: 260px; border-right: 1px solid var(--border); overflow-y: auto; padding: 12px 0; }
.heading { font-size: 12px; font-weight: 600; color: var(--text-muted); padding: 0 12px 8px; text-transform: uppercase; letter-spacing: 0.05em; }
ul { list-style: none; }
.fileBtn {
  display: flex; align-items: center; gap: 6px; width: 100%;
  border: none; border-radius: 0; background: transparent;
  padding: 4px 12px; text-align: left; font-size: 12px;
  color: var(--text); font-family: var(--font-mono);
}
.fileBtn:hover { background: var(--bg-surface-2); }
.badge { font-weight: 700; min-width: 12px; font-size: 11px; }
.path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 3: Create PR screen shell**

Create `src/renderer/src/screens/PR.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import StaleBanner from '../components/StaleBanner'
import FileTree from '../components/FileTree'
import DiffView from '../components/DiffView'
import ReviewPanel from '../components/ReviewPanel'
import type { AddCommentPayload } from '../../../../shared/types'
import styles from './PR.module.css'

export default function PR(): JSX.Element {
  const { repoId, prId } = useParams<{ repoId: string; prId: string }>()
  const navigate = useNavigate()
  const { repos, prDetail, setPrDetail, diffView, setDiffView, reviewPanelOpen, setReviewPanelOpen } = useStore()
  const repo = repos.find((r) => r.id === repoId)
  const [tab, setTab] = useState<'files' | 'overview'>('files')
  const [refreshing, setRefreshing] = useState(false)
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (repo && prId) {
      window.api.getPr(prId, repo.path).then(setPrDetail)
    }
  }, [prId, repo?.path])

  async function handleRefresh(): Promise<void> {
    if (!repo || !prId) return
    setRefreshing(true)
    const updated = await window.api.refreshPr(prId, repo.path)
    setPrDetail(updated)
    setRefreshing(false)
  }

  async function handleAddComment(payload: Omit<AddCommentPayload, 'prId'>): Promise<void> {
    if (!repo || !prId || !prDetail) return
    const result = await window.api.addComment({ ...payload, prId, repoPath: repo.path })
    // Reload PR detail to include the new comment
    const updated = await window.api.getPr(prId, repo.path)
    setPrDetail(updated)
  }

  function scrollToFile(filePath: string): void {
    fileRefs.current[filePath]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!prDetail) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>

  const { pr, diff, review, comments, isStale } = prDetail

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button onClick={() => navigate(`/repo/${repoId}`)}>← PRs</button>
        <div className={styles.headerMeta}>
          <h2 className={styles.prTitle}>{pr.title}</h2>
          <div className={styles.branches}>
            <code>{pr.compare_branch}</code>
            <span> → </span>
            <code>{pr.base_branch}</code>
          </div>
        </div>
        <button onClick={() => setReviewPanelOpen(!reviewPanelOpen)}>
          Review ({comments.filter((c) => !c.is_stale).length})
        </button>
      </div>

      {isStale && <StaleBanner onRefresh={handleRefresh} loading={refreshing} />}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={tab === 'files' ? styles.activeTab : ''} onClick={() => setTab('files')}>
          Files changed ({diff.length})
        </button>
        <button className={tab === 'overview' ? styles.activeTab : ''} onClick={() => setTab('overview')}>
          Overview
        </button>
        {tab === 'files' && (
          <div className={styles.viewToggle}>
            <button className={diffView === 'unified' ? styles.activeToggle : ''} onClick={() => setDiffView('unified')}>Unified</button>
            <button className={diffView === 'split' ? styles.activeToggle : ''} onClick={() => setDiffView('split')}>Split</button>
          </div>
        )}
      </div>

      {tab === 'overview' && (
        <div className={styles.overview}>
          <p>{pr.description ?? <span style={{ color: 'var(--text-muted)' }}>No description.</span>}</p>
        </div>
      )}

      {tab === 'files' && (
        <div className={styles.body}>
          <FileTree files={diff} onSelect={scrollToFile} />
          <div className={styles.diffPane}>
            {diff.map((file) => (
              <div key={file.newPath} ref={(el) => { fileRefs.current[file.newPath] = el }}>
                <DiffView
                  file={file}
                  comments={comments.filter((c) => c.file_path === file.newPath)}
                  view={diffView}
                  onAddComment={handleAddComment}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewPanelOpen && (
        <ReviewPanel
          review={review}
          comments={comments}
          prId={prId!}
          onClose={() => setReviewPanelOpen(false)}
          onSubmitted={(updated) => setPrDetail(updated)}
          repoPath={repo?.path ?? ''}
        />
      )}
    </div>
  )
}
```

Create `src/renderer/src/screens/PR.module.css`:
```css
.page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.header {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  background: var(--bg-surface); flex-shrink: 0;
}
.headerMeta { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.prTitle { font-size: 16px; font-weight: 600; }
.branches { font-size: 12px; color: var(--text-muted); }
.branches code { background: var(--bg-surface-2); padding: 1px 5px; border-radius: 4px; }
.tabs {
  display: flex; align-items: center; gap: 4px;
  padding: 0 16px; border-bottom: 1px solid var(--border);
  background: var(--bg-surface); flex-shrink: 0;
}
.tabs button { border: none; background: transparent; padding: 10px 12px; color: var(--text-muted); border-bottom: 2px solid transparent; border-radius: 0; }
.tabs button:hover { color: var(--text); background: transparent; }
.activeTab { color: var(--text) !important; border-bottom-color: var(--accent) !important; }
.viewToggle { margin-left: auto; display: flex; gap: 4px; }
.activeToggle { background: var(--bg-surface-2) !important; color: var(--text) !important; }
.body { display: flex; flex: 1; overflow: hidden; }
.diffPane { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.overview { padding: 24px; flex: 1; overflow-y: auto; }
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/PR.tsx src/renderer/src/screens/PR.module.css src/renderer/src/components/StaleBanner.tsx src/renderer/src/components/StaleBanner.module.css src/renderer/src/components/FileTree.tsx src/renderer/src/components/FileTree.module.css
git commit -m "feat: add PR view layout, file tree, and stale banner"
```

---

## Task 21: Unified diff renderer

**Files:**
- Create: `src/renderer/src/components/DiffView/index.tsx`
- Create: `src/renderer/src/components/DiffView/DiffLine.tsx`
- Create: `src/renderer/src/components/DiffView/UnifiedDiff.tsx`
- Create: `src/renderer/src/__tests__/DiffLine.test.tsx`

- [ ] **Step 1: Write failing DiffLine test**

Create `src/renderer/src/__tests__/DiffLine.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DiffLine from '../components/DiffView/DiffLine'
import type { ParsedLine } from '../../../../shared/types'

const addedLine: ParsedLine = {
  diffLineNumber: 3,
  type: 'added',
  content: 'const x = 1',
  oldLineNumber: null,
  newLineNumber: 5,
}

describe('DiffLine', () => {
  it('renders the line content', () => {
    render(<DiffLine line={addedLine} comments={[]} onStartComment={vi.fn()} onExtendComment={vi.fn()} isSelecting={false} selectionStart={null} />)
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })

  it('shows gutter button on mouse enter', () => {
    render(<DiffLine line={addedLine} comments={[]} onStartComment={vi.fn()} onExtendComment={vi.fn()} isSelecting={false} selectionStart={null} />)
    const row = screen.getByRole('row')
    fireEvent.mouseEnter(row)
    expect(screen.getByTitle('Add comment')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:renderer
```

Expected: FAIL — `Cannot find module '../components/DiffView/DiffLine'`

- [ ] **Step 3: Create DiffLine component**

Create `src/renderer/src/components/DiffView/DiffLine.tsx`:
```tsx
import { useState } from 'react'
import type { Comment, ParsedLine } from '../../../../shared/types'
import styles from './DiffLine.module.css'

interface Props {
  line: ParsedLine
  comments: Comment[]
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
  side?: 'left' | 'right'
}

export default function DiffLine({
  line,
  comments,
  onStartComment,
  onExtendComment,
  isSelecting,
  selectionStart,
  side = 'right',
}: Props): JSX.Element | null {
  const [hovered, setHovered] = useState(false)

  if (line.type === 'hunk-header') {
    return (
      <tr className={styles.hunkHeader}>
        <td colSpan={4} className={styles.hunkHeaderContent}>{line.content}</td>
      </tr>
    )
  }

  const isInSelection =
    isSelecting &&
    selectionStart !== null &&
    line.diffLineNumber >= Math.min(selectionStart, line.diffLineNumber) &&
    line.diffLineNumber <= Math.max(selectionStart, line.diffLineNumber)

  function handleMouseEnter(): void { setHovered(true) }
  function handleMouseLeave(): void { setHovered(false) }
  function handleMouseDown(): void {
    if (!isSelecting) onStartComment(line.diffLineNumber, side)
  }
  function handleMouseUp(): void {
    if (isSelecting) onExtendComment(line.diffLineNumber)
  }

  const lineClass = `${styles.line} ${styles[line.type]} ${isInSelection ? styles.selecting : ''}`

  return (
    <tr
      role="row"
      className={lineClass}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <td className={styles.lineNumOld}>{line.oldLineNumber ?? ''}</td>
      <td className={styles.lineNumNew}>{line.newLineNumber ?? ''}</td>
      <td className={styles.gutter}>
        {(hovered || isSelecting) && (
          <button
            title="Add comment"
            className={styles.gutterBtn}
            onMouseDown={(e) => { e.stopPropagation(); onStartComment(line.diffLineNumber, side) }}
          >+</button>
        )}
      </td>
      <td className={styles.code}>
        <span className={styles.prefix}>
          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
        </span>
        <span>{line.content}</span>
      </td>
    </tr>
  )
}
```

Create `src/renderer/src/components/DiffView/DiffLine.module.css`:
```css
.line { user-select: none; }
.added { background: var(--added); }
.removed { background: var(--removed); }
.context { background: transparent; }
.selecting { background: #1f3a5f; }
.hunkHeader { background: var(--hunk); }
.hunkHeaderContent { padding: 4px 8px; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
.lineNumOld, .lineNumNew {
  width: 48px; min-width: 48px; padding: 0 8px;
  font-family: var(--font-mono); font-size: 12px;
  color: var(--text-muted); text-align: right;
  border-right: 1px solid var(--border); user-select: none;
}
.gutter { width: 28px; min-width: 28px; padding: 0 4px; }
.gutterBtn {
  border: none; background: var(--accent); color: #fff;
  border-radius: 3px; width: 18px; height: 18px;
  font-size: 14px; line-height: 1; padding: 0;
  display: flex; align-items: center; justify-content: center;
}
.code { font-family: var(--font-mono); font-size: 13px; padding: 1px 8px; white-space: pre; }
.prefix { color: var(--text-muted); margin-right: 4px; user-select: none; }
.added .prefix { color: var(--added-text); }
.removed .prefix { color: var(--removed-text); }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:renderer
```

Expected: PASS

- [ ] **Step 5: Create UnifiedDiff component**

Create `src/renderer/src/components/DiffView/UnifiedDiff.tsx`:
```tsx
import type { Comment, ParsedFile } from '../../../../shared/types'
import DiffLine from './DiffLine'
import CommentThread from '../CommentThread'
import styles from './UnifiedDiff.module.css'

interface Props {
  file: ParsedFile
  comments: Comment[]
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
}

export default function UnifiedDiff({
  file, comments, onStartComment, onExtendComment, isSelecting, selectionStart,
}: Props): JSX.Element {
  // Build map: diffLineNumber → comments that END on that line
  const commentsByEndLine = new Map<number, Comment[]>()
  for (const comment of comments) {
    const existing = commentsByEndLine.get(comment.end_line) ?? []
    commentsByEndLine.set(comment.end_line, [...existing, comment])
  }

  return (
    <table className={styles.table}>
      <tbody>
        {file.lines.map((line) => (
          <>
            <DiffLine
              key={`line-${line.diffLineNumber}`}
              line={line}
              comments={comments.filter((c) => c.start_line <= line.diffLineNumber && c.end_line >= line.diffLineNumber)}
              onStartComment={onStartComment}
              onExtendComment={onExtendComment}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
              side="right"
            />
            {(commentsByEndLine.get(line.diffLineNumber) ?? []).map((comment) => (
              <tr key={`comment-${comment.id}`}>
                <td colSpan={4}>
                  <CommentThread comment={comment} />
                </td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  )
}
```

Create `src/renderer/src/components/DiffView/UnifiedDiff.module.css`:
```css
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/DiffView/DiffLine.tsx src/renderer/src/components/DiffView/DiffLine.module.css src/renderer/src/components/DiffView/UnifiedDiff.tsx src/renderer/src/components/DiffView/UnifiedDiff.module.css src/renderer/src/__tests__/DiffLine.test.tsx
git commit -m "feat: add DiffLine and UnifiedDiff renderer"
```

---

## Task 22: Split diff renderer, DiffView container, and view toggle

**Files:**
- Create: `src/renderer/src/components/DiffView/SplitDiff.tsx`
- Create: `src/renderer/src/components/DiffView/index.tsx`

- [ ] **Step 1: Create SplitDiff**

Create `src/renderer/src/components/DiffView/SplitDiff.tsx`:
```tsx
import type { Comment, ParsedFile, ParsedLine } from '../../../../shared/types'
import DiffLine from './DiffLine'
import CommentThread from '../CommentThread'
import styles from './SplitDiff.module.css'

interface Props {
  file: ParsedFile
  comments: Comment[]
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
}

/**
 * Pairs up left (old) and right (new) lines for side-by-side rendering.
 * Context lines appear on both sides. Removed lines appear only on left.
 * Added lines appear only on right. Hunk headers span both.
 */
function pairLines(lines: ParsedLine[]): Array<{ left: ParsedLine | null; right: ParsedLine | null }> {
  const pairs: Array<{ left: ParsedLine | null; right: ParsedLine | null }> = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.type === 'hunk-header' || line.type === 'context') {
      pairs.push({ left: line, right: line })
      i++
    } else if (line.type === 'removed') {
      const next = lines[i + 1]
      if (next?.type === 'added') {
        pairs.push({ left: line, right: next })
        i += 2
      } else {
        pairs.push({ left: line, right: null })
        i++
      }
    } else if (line.type === 'added') {
      pairs.push({ left: null, right: line })
      i++
    } else {
      i++
    }
  }
  return pairs
}

export default function SplitDiff({
  file, comments, onStartComment, onExtendComment, isSelecting, selectionStart,
}: Props): JSX.Element {
  const pairs = pairLines(file.lines)

  const commentsByEndLine = new Map<number, Comment[]>()
  for (const comment of comments) {
    const existing = commentsByEndLine.get(comment.end_line) ?? []
    commentsByEndLine.set(comment.end_line, [...existing, comment])
  }

  return (
    <table className={styles.table}>
      <tbody>
        {pairs.map((pair, idx) => {
          if (pair.left?.type === 'hunk-header') {
            return (
              <tr key={`hunk-${idx}`} className={styles.hunkHeader}>
                <td colSpan={6}>{pair.left.content}</td>
              </tr>
            )
          }

          const rightEndComments = pair.right ? (commentsByEndLine.get(pair.right.diffLineNumber) ?? []) : []
          const leftEndComments = pair.left ? (commentsByEndLine.get(pair.left.diffLineNumber) ?? []) : []

          // De-dup: don't show same comment twice if it ends on both sides
          const allEndComments = [...new Map([...rightEndComments, ...leftEndComments].map((c) => [c.id, c])).values()]

          return (
            <>
              <tr key={`pair-${idx}`} className={styles.pairRow}>
                {/* Left side */}
                <td className={styles.side}>
                  {pair.left ? (
                    <table className={styles.innerTable}><tbody>
                      <DiffLine
                        line={pair.left}
                        comments={[]}
                        onStartComment={onStartComment}
                        onExtendComment={onExtendComment}
                        isSelecting={isSelecting}
                        selectionStart={selectionStart}
                        side="left"
                      />
                    </tbody></table>
                  ) : <div className={styles.emptyCell} />}
                </td>
                {/* Right side */}
                <td className={styles.side}>
                  {pair.right ? (
                    <table className={styles.innerTable}><tbody>
                      <DiffLine
                        line={pair.right}
                        comments={[]}
                        onStartComment={onStartComment}
                        onExtendComment={onExtendComment}
                        isSelecting={isSelecting}
                        selectionStart={selectionStart}
                        side="right"
                      />
                    </tbody></table>
                  ) : <div className={styles.emptyCell} />}
                </td>
              </tr>
              {allEndComments.map((comment) => (
                <tr key={`comment-${comment.id}`}>
                  <td colSpan={2}>
                    <CommentThread comment={comment} />
                  </td>
                </tr>
              ))}
            </>
          )
        })}
      </tbody>
    </table>
  )
}
```

Create `src/renderer/src/components/DiffView/SplitDiff.module.css`:
```css
.table { width: 100%; border-collapse: collapse; }
.hunkHeader td { background: var(--hunk); padding: 4px 8px; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
.pairRow { vertical-align: top; }
.side { width: 50%; border-right: 1px solid var(--border); }
.innerTable { width: 100%; border-collapse: collapse; }
.emptyCell { background: var(--bg-surface); min-height: 22px; display: block; }
```

- [ ] **Step 2: Create DiffView container**

Create `src/renderer/src/components/DiffView/index.tsx`:
```tsx
import { useState } from 'react'
import type { AddCommentPayload, Comment, ParsedFile } from '../../../../shared/types'
import { extractContext } from '../../../../shared/diff-utils'
import UnifiedDiff from './UnifiedDiff'
import SplitDiff from './SplitDiff'
import CommentBox from '../CommentBox'
import styles from './DiffView.module.css'

interface Props {
  file: ParsedFile
  comments: Comment[]
  view: 'unified' | 'split'
  onAddComment: (payload: Omit<AddCommentPayload, 'prId'>) => Promise<void>
}

export default function DiffView({ file, comments, view, onAddComment }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const [selectionSide, setSelectionSide] = useState<'left' | 'right'>('right')
  const [showCommentBox, setShowCommentBox] = useState(false)

  function handleStartComment(diffLineNumber: number, side: 'left' | 'right'): void {
    setIsSelecting(true)
    setSelectionStart(diffLineNumber)
    setSelectionEnd(diffLineNumber)
    setSelectionSide(side)
  }

  function handleExtendComment(diffLineNumber: number): void {
    if (!isSelecting) return
    setSelectionEnd(diffLineNumber)
    setIsSelecting(false)
    setShowCommentBox(true)
  }

  async function handleSubmitComment(body: string): Promise<void> {
    if (selectionStart === null || selectionEnd === null) return
    const start = Math.min(selectionStart, selectionEnd)
    const end = Math.max(selectionStart, selectionEnd)
    const contextRaw = extractContext(file.lines, start, end)
    const contextLines = contextRaw.map((l) => ({
      line_number: l.diffLineNumber,
      type: l.type as 'added' | 'removed' | 'context',
      content: l.content,
    }))
    await onAddComment({
      filePath: file.newPath,
      startLine: start,
      endLine: end,
      side: selectionSide,
      body,
      contextLines,
    })
    setShowCommentBox(false)
    setSelectionStart(null)
    setSelectionEnd(null)
    setIsSelecting(false)
  }

  function handleCancelComment(): void {
    setShowCommentBox(false)
    setSelectionStart(null)
    setSelectionEnd(null)
    setIsSelecting(false)
  }

  return (
    <div className={styles.container}>
      <div className={styles.fileHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.toggle}>{expanded ? '▼' : '▶'}</span>
        <span className={styles.filePath}>{file.newPath}</span>
        {file.isNew && <span className={styles.badge} style={{ color: 'var(--added-text)' }}>Added</span>}
        {file.isDeleted && <span className={styles.badge} style={{ color: 'var(--removed-text)' }}>Deleted</span>}
        {file.isRenamed && <span className={styles.badge} style={{ color: '#d29922' }}>Renamed from {file.oldPath}</span>}
      </div>
      {expanded && (
        <div className={styles.body}>
          {view === 'unified' ? (
            <UnifiedDiff
              file={file}
              comments={comments}
              onStartComment={handleStartComment}
              onExtendComment={handleExtendComment}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
            />
          ) : (
            <SplitDiff
              file={file}
              comments={comments}
              onStartComment={handleStartComment}
              onExtendComment={handleExtendComment}
              isSelecting={isSelecting}
              selectionStart={selectionStart}
            />
          )}
          {showCommentBox && (
            <CommentBox
              onSubmit={handleSubmitComment}
              onCancel={handleCancelComment}
              startLine={Math.min(selectionStart ?? 0, selectionEnd ?? 0)}
              endLine={Math.max(selectionStart ?? 0, selectionEnd ?? 0)}
            />
          )}
        </div>
      )}
    </div>
  )
}
```

Create `src/renderer/src/components/DiffView/DiffView.module.css`:
```css
.container { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.fileHeader {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; background: var(--bg-surface);
  border-bottom: 1px solid var(--border); cursor: pointer;
}
.fileHeader:hover { background: var(--bg-surface-2); }
.toggle { font-size: 10px; color: var(--text-muted); }
.filePath { font-family: var(--font-mono); font-size: 13px; font-weight: 500; flex: 1; }
.badge { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: var(--bg-surface-2); }
.body { overflow-x: auto; }
```

The renderer cannot import from main, so `extractContext` lives in shared. Create `src/shared/diff-utils.ts`:
```ts
import type { ContextLine, ParsedLine } from './types'

export function extractContext(
  fileLines: ParsedLine[],
  startLine: number,
  endLine: number
): Array<{ diffLineNumber: number; type: 'added' | 'removed' | 'context'; content: string }> {
  const codeLines = fileLines.filter((l) => l.type !== 'hunk-header')
  const startIdx = codeLines.findIndex((l) => l.diffLineNumber === startLine)
  const endIdx = codeLines.findIndex((l) => l.diffLineNumber === endLine)
  if (startIdx === -1 || endIdx === -1) return []
  const from = Math.max(0, startIdx - 3)
  const to = Math.min(codeLines.length - 1, endIdx + 3)
  return codeLines.slice(from, to + 1).map((l) => ({
    diffLineNumber: l.diffLineNumber,
    type: l.type as 'added' | 'removed' | 'context',
    content: l.content,
  }))
}
```

Update `src/main/git/diff-parser.ts`: remove the `extractContext` export from it (it now lives in shared only). Update any existing tests that imported it from diff-parser to import from `../../shared/diff-utils` instead.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/DiffView/ src/shared/diff-utils.ts
git commit -m "feat: add SplitDiff renderer and DiffView container with view toggle"
```

---

## Task 23: CommentBox and CommentThread

**Files:**
- Create: `src/renderer/src/components/CommentBox.tsx`
- Create: `src/renderer/src/components/CommentThread.tsx`
- Create: `src/renderer/src/__tests__/CommentThread.test.tsx`

- [ ] **Step 1: Write failing CommentThread test**

Create `src/renderer/src/__tests__/CommentThread.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommentThread from '../components/CommentThread'
import type { Comment } from '../../../../shared/types'

const comment: Comment = {
  id: 'c1', review_id: 'r1', file_path: 'src/foo.ts',
  start_line: 3, end_line: 3, side: 'right',
  body: 'This needs a null check', is_stale: false,
  created_at: '2026-04-08T10:00:00Z',
}

describe('CommentThread', () => {
  it('renders the comment body', () => {
    render(<CommentThread comment={comment} />)
    expect(screen.getByText('This needs a null check')).toBeInTheDocument()
  })

  it('shows stale indicator for stale comments', () => {
    render(<CommentThread comment={{ ...comment, is_stale: true }} />)
    expect(screen.getByText(/stale/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:renderer
```

Expected: FAIL

- [ ] **Step 3: Create CommentThread**

Create `src/renderer/src/components/CommentThread.tsx`:
```tsx
import type { Comment } from '../../../shared/types'
import styles from './CommentThread.module.css'

interface Props {
  comment: Comment
}

export default function CommentThread({ comment }: Props): JSX.Element {
  return (
    <div className={`${styles.thread} ${comment.is_stale ? styles.stale : ''}`}>
      <div className={styles.header}>
        <span className={styles.lines}>Lines {comment.start_line}–{comment.end_line}</span>
        {comment.is_stale && <span className={styles.staleTag}>stale</span>}
      </div>
      <div className={styles.body}>{comment.body}</div>
    </div>
  )
}
```

Create `src/renderer/src/components/CommentThread.module.css`:
```css
.thread {
  margin: 4px 0 4px 80px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--comment-bg);
  overflow: hidden;
}
.stale { opacity: 0.5; border-style: dashed; }
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; border-bottom: 1px solid var(--border);
  font-size: 12px; color: var(--text-muted);
}
.staleTag { color: #d29922; font-size: 11px; }
.body { padding: 10px 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
```

- [ ] **Step 4: Create CommentBox**

Create `src/renderer/src/components/CommentBox.tsx`:
```tsx
import { useState } from 'react'
import styles from './CommentBox.module.css'

interface Props {
  startLine: number
  endLine: number
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
}

export default function CommentBox({ startLine, endLine, onSubmit, onCancel }: Props): JSX.Element {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(): Promise<void> {
    if (!body.trim()) return
    setSubmitting(true)
    await onSubmit(body.trim())
    setSubmitting(false)
  }

  return (
    <div className={styles.box}>
      <div className={styles.header}>
        Comment on lines {startLine}{startLine !== endLine ? `–${endLine}` : ''}
      </div>
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment…"
        rows={4}
        autoFocus
      />
      <div className={styles.actions}>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={handleSubmit} disabled={submitting || !body.trim()}>
          {submitting ? 'Saving…' : 'Add Comment'}
        </button>
      </div>
    </div>
  )
}
```

Create `src/renderer/src/components/CommentBox.module.css`:
```css
.box {
  margin: 4px 0 8px 80px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--comment-bg);
  overflow: hidden;
}
.header { padding: 6px 12px; font-size: 12px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.textarea { width: 100%; border: none; border-bottom: 1px solid var(--border); border-radius: 0; padding: 10px 12px; background: var(--comment-bg); resize: vertical; }
.actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; }
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm run test:renderer
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/CommentThread.tsx src/renderer/src/components/CommentThread.module.css src/renderer/src/components/CommentBox.tsx src/renderer/src/components/CommentBox.module.css src/renderer/src/__tests__/CommentThread.test.tsx
git commit -m "feat: add CommentThread and CommentBox components"
```

---

## Task 24: Review panel and submit flow

**Files:**
- Create: `src/renderer/src/components/ReviewPanel.tsx`
- Create: `src/renderer/src/__tests__/ReviewPanel.test.tsx`

- [ ] **Step 1: Write failing ReviewPanel test**

Create `src/renderer/src/__tests__/ReviewPanel.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReviewPanel from '../components/ReviewPanel'
import type { Comment, Review } from '../../../../shared/types'

const review: Review = {
  id: 'rev1', pr_id: 'pr1', status: 'in_progress', submitted_at: null, created_at: '2026-04-08T10:00:00Z',
}

const comments: Comment[] = [
  { id: 'c1', review_id: 'rev1', file_path: 'src/foo.ts', start_line: 3, end_line: 3, side: 'right', body: 'Fix null check', is_stale: false, created_at: '2026-04-08T11:00:00Z' },
  { id: 'c2', review_id: 'rev1', file_path: 'src/bar.ts', start_line: 10, end_line: 12, side: 'right', body: 'Rename this', is_stale: false, created_at: '2026-04-08T11:05:00Z' },
]

describe('ReviewPanel', () => {
  it('lists non-stale comments', () => {
    render(<ReviewPanel review={review} comments={comments} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.getByText('Fix null check')).toBeInTheDocument()
    expect(screen.getByText('Rename this')).toBeInTheDocument()
  })

  it('shows submit button when review is in_progress', () => {
    render(<ReviewPanel review={review} comments={comments} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument()
  })

  it('does not show submit button when review is null', () => {
    render(<ReviewPanel review={null} comments={[]} prId="pr1" repoPath="/repo" onClose={vi.fn()} onSubmitted={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /submit review/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test:renderer
```

Expected: FAIL

- [ ] **Step 3: Create ReviewPanel**

Create `src/renderer/src/components/ReviewPanel.tsx`:
```tsx
import { useState } from 'react'
import type { Comment, PrDetail, Review } from '../../../shared/types'
import styles from './ReviewPanel.module.css'

interface Props {
  review: Review | null
  comments: Comment[]
  prId: string
  repoPath: string
  onClose: () => void
  onSubmitted: (updated: PrDetail | null) => void
}

export default function ReviewPanel({ review, comments, prId, repoPath, onClose, onSubmitted }: Props): JSX.Element {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const nonStale = comments.filter((c) => !c.is_stale)

  async function handleSubmit(): Promise<void> {
    if (!review) return
    setSubmitting(true)
    setError('')
    const result = await window.api.submitAndExport(review.id, prId)
    if ('error' in result) {
      if (result.error !== 'cancelled') setError(result.error)
      setSubmitting(false)
      return
    }
    // Reload PR detail
    const updated = await window.api.getPr(prId, repoPath)
    onSubmitted(updated)
    setSubmitting(false)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Review ({nonStale.length} comment{nonStale.length !== 1 ? 's' : ''})</h3>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div className={styles.list}>
        {nonStale.length === 0 ? (
          <p className={styles.empty}>No comments yet. Click + on any diff line to add one.</p>
        ) : (
          nonStale.map((comment) => (
            <div key={comment.id} className={styles.commentItem}>
              <div className={styles.commentMeta}>
                <code>{comment.file_path}</code>
                <span className={styles.lines}>:{comment.start_line}{comment.start_line !== comment.end_line ? `–${comment.end_line}` : ''}</span>
              </div>
              <div className={styles.commentBody}>{comment.body}</div>
            </div>
          ))
        )}
      </div>
      {review?.status === 'in_progress' && (
        <div className={styles.footer}>
          {error && <p className={styles.error}>{error}</p>}
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={submitting || nonStale.length === 0}
          >
            {submitting ? 'Submitting…' : 'Submit Review'}
          </button>
        </div>
      )}
      {review?.status === 'submitted' && (
        <div className={styles.submitted}>Review submitted.</div>
      )}
    </div>
  )
}
```

Create `src/renderer/src/components/ReviewPanel.module.css`:
```css
.panel {
  position: fixed; right: 0; top: 0; bottom: 0;
  width: 360px; background: var(--bg-surface);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 100;
  box-shadow: -4px 0 16px rgba(0,0,0,0.4);
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.header h3 { font-size: 14px; font-weight: 600; }
.closeBtn { border: none; background: transparent; color: var(--text-muted); font-size: 16px; padding: 2px 6px; }
.closeBtn:hover { color: var(--text); }
.list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.empty { color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 24px; }
.commentItem { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.commentMeta { padding: 6px 10px; background: var(--bg-surface-2); font-size: 12px; border-bottom: 1px solid var(--border); }
.commentMeta code { font-family: var(--font-mono); color: var(--accent-hover); }
.lines { color: var(--text-muted); }
.commentBody { padding: 8px 10px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
.footer { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.error { color: var(--removed-text); font-size: 12px; }
.submitted { padding: 16px; text-align: center; color: var(--added-text); font-size: 13px; }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:renderer
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ReviewPanel.tsx src/renderer/src/components/ReviewPanel.module.css src/renderer/src/__tests__/ReviewPanel.test.tsx
git commit -m "feat: add ReviewPanel with submit and export flow"
```

---

## Task 25: Wire up main/index.ts and final integration check

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Finalize main/index.ts**

Replace `src/main/index.ts` with a clean, complete version wiring all IPC registrations:

```ts
import { app, BrowserWindow, shell } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb } from './db'
import { registerRepoHandlers } from './ipc/repos'
import { registerPrHandlers } from './ipc/prs'
import { registerReviewHandlers } from './ipc/reviews'
import { registerExportHandlers } from './ipc/export'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local-pr-reviewer')
  app.on('browser-window-created', (_, window) => optimizer.watchShortcuts(window))

  const db = getDb()
  registerRepoHandlers(db)
  registerPrHandlers(db)
  registerReviewHandlers(db)
  registerExportHandlers(db)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All main and renderer tests PASS.

- [ ] **Step 3: Run the app**

```bash
npm run dev
```

Smoke test manually:
1. App opens. Click "Open Repository" → select a local git repo with multiple branches.
2. Repo appears in list. Click it.
3. Click "Open PR" → pick two branches → enter a title → confirm.
4. PR view opens with the diff.
5. Hover a diff line → `+` button appears.
6. Click `+` → comment box appears → type a comment → "Add Comment".
7. Comment thread appears inline below the selection.
8. Click the "Review" button → ReviewPanel opens → comment listed.
9. Click "Submit Review" → save dialog → save files → both `.md` and `.json` written.
10. Toggle unified/split → comments remain in place.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire all IPC handlers in main entry — app functional end to end"
```

---

## Spec Coverage Check

| Spec requirement | Covered by task |
|---|---|
| Branch vs branch PR | Task 13 (`prs:create` with SHA resolution) |
| Persist PRs, reviews, comments | Tasks 3–6 |
| Stale detection on PR open | Task 13 (`prs:get` SHA comparison) |
| Stale banner + refresh | Task 20 (StaleBanner), Task 13 (`prs:refresh`) |
| Unified diff view | Task 21 |
| Split diff view | Task 22 |
| View toggle (purely visual) | Task 22 (DiffView container) |
| Gutter `+` button | Task 21 (DiffLine) |
| Line range selection | Task 22 (DiffView state) |
| Inline comment thread | Task 23 |
| Auto-create in_progress review | Task 6 (`getOrCreateInProgressReview`) |
| Staged review panel | Task 24 |
| Submit review + export trigger | Task 15, Task 24 |
| Markdown export with context | Task 10 |
| JSON export with context | Task 11 |
| RVW-001 sequential IDs | Tasks 10, 11 |
| 3 lines context in export | Tasks 10, 11 (`extractContext`) |
| Stale comments excluded from export | Tasks 10, 11 |
| Native save dialog | Task 15 |
| SQLite in userData | Task 3 |
| No cloud / no server | All — Electron only |

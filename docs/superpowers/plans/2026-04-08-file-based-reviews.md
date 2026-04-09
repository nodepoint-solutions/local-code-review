# File-Based Reviews & MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move review storage from SQLite into `.reviews/{pr-id}/` directories inside each repo, expose a standalone MCP server for agent read/write, and add tray lifecycle + "Fix with Claude/Copilot" buttons.

**Architecture:** ReviewStore (shared Node.js module) is the single file I/O layer used by both the Electron main process and the MCP child process. The MCP server communicates back to Electron via a Unix socket (named pipe on Windows). Files are source of truth; the socket carries events only.

**Tech Stack:** electron-vite, better-sqlite3, zod (new), @modelcontextprotocol/sdk (new), vitest

**Spec:** `docs/superpowers/specs/2026-04-08-file-based-reviews-design.md`

---

## File Map

### New files
- `src/shared/review-store/schema.ts` — Zod schemas + TypeScript types for PR and review files
- `src/shared/review-store/serializer.ts` — atomic read/write for `.reviews/` files
- `src/shared/review-store/index.ts` — ReviewStore class (public API)
- `src/main/__tests__/review-store.test.ts` — unit tests for ReviewStore
- `src/mcp-server/index.ts` — MCP server entry point (stdio transport + prompts)
- `src/mcp-server/tools.ts` — MCP tool handlers
- `src/mcp-server/socket-client.ts` — emits review:updated events to Electron via socket
- `src/main/mcp-manager.ts` — spawns/kills MCP child process, runs socket server
- `src/main/review-watcher.ts` — fs.watch wrapper for .reviews/ directories
- `vite.mcp.config.ts` — standalone Vite build for MCP server binary

### Modified files
- `package.json` — add zod, @modelcontextprotocol/sdk; add build:mcp script
- `src/shared/types.ts` — replace old SQLite-mirror types with file-based types; update PrDetail
- `src/main/db/schema.ts` — remove pull_requests, reviews, comments, comment_context tables
- `src/main/db/index.ts` — delete existing DB file on startup (preproduction reset)
- `src/main/db/repos.ts` — remove listReposWithMeta (JOIN broken; counting moved to IPC layer)
- `src/main/ipc/prs.ts` — rewrite to use ReviewStore
- `src/main/ipc/reviews.ts` — rewrite to use ReviewStore
- `src/main/ipc/export.ts` — submit → ReviewStore; keep markdown export
- `src/main/ipc/repos.ts` — update listRepos to count PRs from filesystem
- `src/main/index.ts` — add tray, window-hide-on-close, MCP manager, review watcher
- `src/preload/index.ts` — updated IPC bindings for new PR/review API + MCP controls
- `src/renderer/src/screens/Settings.tsx` — add MCP server toggle + integrations panel
- `src/renderer/src/screens/PR.tsx` — add "Fix with" buttons on submitted reviews
- `src/renderer/src/store/index.ts` — update prDetail type
- `src/main/__tests__/db.test.ts` — remove PR/review/comment tests; update schema test
- `electron-vite.config.ts` — no change needed (MCP server built separately)

### Deleted files
- `src/main/db/prs.ts`
- `src/main/db/reviews.ts`
- `src/main/export/json.ts`
- `src/main/__tests__/export-json.test.ts`

---

## Task 1: Install dependencies and MCP build config

**Files:**
- Modify: `package.json`
- Create: `vite.mcp.config.ts`

- [ ] **Step 1: Install zod and MCP SDK**

```bash
cd /Users/nodepoint/Development/nodepoint/local-code-review
npm install zod @modelcontextprotocol/sdk
```

Expected: both packages appear in `node_modules/`.

- [ ] **Step 2: Add build:mcp script to package.json**

In `package.json`, update the `"scripts"` section — add `"build:mcp"` and update `"build"`:

```json
"build:mcp": "vite build --config vite.mcp.config.ts",
"build": "npm run build:mcp && npm run typecheck && electron-vite build",
```

- [ ] **Step 3: Create vite.mcp.config.ts**

```typescript
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    lib: {
      entry: path.resolve(__dirname, 'src/mcp-server/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    outDir: 'dist/mcp-server',
    rollupOptions: {
      external: ['fs', 'path', 'net', 'os', 'crypto', 'events', 'stream', 'util', 'buffer'],
    },
    minify: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer/src'),
    },
  },
})
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.mcp.config.ts
git commit -m "feat: add zod, MCP SDK, and mcp-server build config"
```

---

## Task 2: ReviewStore — schema and types

**Files:**
- Create: `src/shared/review-store/schema.ts`

- [ ] **Step 1: Write the schema**

```typescript
// src/shared/review-store/schema.ts
import { z } from 'zod'

export const ContextLineSchema = z.object({
  line: z.number().int(),
  type: z.enum(['added', 'removed', 'context']),
  content: z.string(),
})

export const ResolutionSchema = z.object({
  comment: z.string().min(1),
  resolved_by: z.string(),
  resolved_at: z.string(),
})

export const ReviewCommentSchema = z.object({
  id: z.string(),           // "RVW-001" format
  file: z.string(),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  side: z.enum(['left', 'right']),
  body: z.string(),
  context: z.array(ContextLineSchema),
  is_stale: z.boolean(),
  status: z.enum(['open', 'resolved', 'wont_fix']),
  resolution: ResolutionSchema.nullable(),
  created_at: z.string(),
})

export const ReviewFileSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  status: z.enum(['in_progress', 'submitted']),
  base_sha: z.string(),
  compare_sha: z.string(),
  created_at: z.string(),
  submitted_at: z.string().nullable(),
  comments: z.array(ReviewCommentSchema),
})

export const PRFileSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  base_branch: z.string(),
  compare_branch: z.string(),
  status: z.enum(['open', 'closed']),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ContextLineEntry = z.infer<typeof ContextLineSchema>
export type Resolution = z.infer<typeof ResolutionSchema>
export type ReviewComment = z.infer<typeof ReviewCommentSchema>
export type ReviewFile = z.infer<typeof ReviewFileSchema>
export type PRFile = z.infer<typeof PRFileSchema>
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/review-store/schema.ts
git commit -m "feat: add review-store schema (Zod + TypeScript types)"
```

---

## Task 3: ReviewStore — serializer

**Files:**
- Create: `src/shared/review-store/serializer.ts`

- [ ] **Step 1: Write the serializer**

```typescript
// src/shared/review-store/serializer.ts
import fs from 'fs'
import path from 'path'
import { PRFileSchema, ReviewFileSchema } from './schema'
import type { PRFile, ReviewFile } from './schema'

export class InvalidReviewFileError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Invalid review file at ${filePath}: ${String(cause)}`)
    this.name = 'InvalidReviewFileError'
  }
}

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

export function prDir(repoPath: string, prId: string): string {
  return path.join(repoPath, '.reviews', prId)
}

export function reviewsDir(repoPath: string, prId: string): string {
  return path.join(prDir(repoPath, prId), 'reviews')
}

export function readPR(repoPath: string, prId: string): PRFile {
  const filePath = path.join(prDir(repoPath, prId), 'index.json')
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return PRFileSchema.parse(raw)
  } catch (err) {
    throw new InvalidReviewFileError(filePath, err)
  }
}

export function writePR(repoPath: string, pr: PRFile): void {
  const dir = prDir(repoPath, pr.id)
  ensureDir(path.join(dir, 'reviews'))
  atomicWrite(path.join(dir, 'index.json'), JSON.stringify(pr, null, 2))
}

export function readReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
  const filePath = path.join(reviewsDir(repoPath, prId), `${reviewId}.json`)
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return ReviewFileSchema.parse(raw)
  } catch (err) {
    throw new InvalidReviewFileError(filePath, err)
  }
}

export function writeReview(repoPath: string, prId: string, review: ReviewFile): void {
  const dir = reviewsDir(repoPath, prId)
  ensureDir(dir)
  atomicWrite(path.join(dir, `${review.id}.json`), JSON.stringify(review, null, 2))
}

export function listPRIds(repoPath: string): string[] {
  const reviewsRoot = path.join(repoPath, '.reviews')
  if (!fs.existsSync(reviewsRoot)) return []
  return fs.readdirSync(reviewsRoot).filter((name) => {
    try {
      return fs.statSync(path.join(reviewsRoot, name)).isDirectory()
    } catch {
      return false
    }
  })
}

export function listReviewIds(repoPath: string, prId: string): string[] {
  const dir = reviewsDir(repoPath, prId)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('.tmp'))
    .map((name) => name.slice(0, -5)) // strip .json
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/review-store/serializer.ts
git commit -m "feat: add review-store serializer (atomic read/write)"
```

---

## Task 4: ReviewStore — class

**Files:**
- Create: `src/shared/review-store/index.ts`

- [ ] **Step 1: Write the ReviewStore class**

```typescript
// src/shared/review-store/index.ts
import { v4 as uuidv4 } from 'uuid'
import {
  readPR, writePR, readReview, writeReview,
  listPRIds, listReviewIds,
} from './serializer'
import type { PRFile, ReviewFile, ReviewComment, Resolution, ContextLineEntry } from './schema'

export { InvalidReviewFileError } from './serializer'
export type { PRFile, ReviewFile, ReviewComment, Resolution, ContextLineEntry } from './schema'

export interface CreatePRArgs {
  title: string
  description: string | null
  base_branch: string
  compare_branch: string
}

export interface CreateReviewArgs {
  base_sha: string
  compare_sha: string
}

export interface AddCommentArgs {
  file: string
  start_line: number
  end_line: number
  side: 'left' | 'right'
  body: string
  context: ContextLineEntry[]
}

export interface LineRange {
  startLine: number
  endLine: number
}

export class ReviewStore {
  // ── PRs ──────────────────────────────────────────────────────────────────

  listPRs(repoPath: string): PRFile[] {
    return listPRIds(repoPath)
      .flatMap((prId) => {
        try { return [readPR(repoPath, prId)] } catch { return [] }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  createPR(repoPath: string, args: CreatePRArgs): PRFile {
    const now = new Date().toISOString()
    const pr: PRFile = {
      version: 1,
      id: uuidv4(),
      title: args.title,
      description: args.description,
      base_branch: args.base_branch,
      compare_branch: args.compare_branch,
      status: 'open',
      created_at: now,
      updated_at: now,
    }
    writePR(repoPath, pr)
    return pr
  }

  getPR(repoPath: string, prId: string): PRFile {
    return readPR(repoPath, prId)
  }

  updatePRStatus(repoPath: string, prId: string, status: 'open' | 'closed'): PRFile {
    const pr = readPR(repoPath, prId)
    const updated: PRFile = { ...pr, status, updated_at: new Date().toISOString() }
    writePR(repoPath, updated)
    return updated
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  listReviews(repoPath: string, prId: string): ReviewFile[] {
    return listReviewIds(repoPath, prId)
      .flatMap((reviewId) => {
        try { return [readReview(repoPath, prId, reviewId)] } catch { return [] }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  createReview(repoPath: string, prId: string, args: CreateReviewArgs): ReviewFile {
    const review: ReviewFile = {
      version: 1,
      id: uuidv4(),
      status: 'in_progress',
      base_sha: args.base_sha,
      compare_sha: args.compare_sha,
      created_at: new Date().toISOString(),
      submitted_at: null,
      comments: [],
    }
    writeReview(repoPath, prId, review)
    return review
  }

  getReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
    return readReview(repoPath, prId, reviewId)
  }

  getOrCreateInProgressReview(repoPath: string, prId: string, args: CreateReviewArgs): ReviewFile {
    const existing = this.listReviews(repoPath, prId).find((r) => r.status === 'in_progress')
    if (existing) return existing
    return this.createReview(repoPath, prId, args)
  }

  submitReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = {
      ...review,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }
    writeReview(repoPath, prId, updated)
    return updated
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  addComment(repoPath: string, prId: string, reviewId: string, args: AddCommentArgs): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const nextNum = review.comments.length + 1
    const comment: ReviewComment = {
      id: `RVW-${String(nextNum).padStart(3, '0')}`,
      file: args.file,
      start_line: args.start_line,
      end_line: args.end_line,
      side: args.side,
      body: args.body,
      context: args.context,
      is_stale: false,
      status: 'open',
      resolution: null,
      created_at: new Date().toISOString(),
    }
    const updated: ReviewFile = { ...review, comments: [...review.comments, comment] }
    writeReview(repoPath, prId, updated)
    return updated
  }

  resolveComment(
    repoPath: string,
    prId: string,
    reviewId: string,
    commentId: string,
    status: 'resolved' | 'wont_fix',
    resolution: Resolution,
  ): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = {
      ...review,
      comments: review.comments.map((c) =>
        c.id === commentId ? { ...c, status, resolution } : c
      ),
    }
    writeReview(repoPath, prId, updated)
    return updated
  }

  markStale(
    repoPath: string,
    prId: string,
    reviewId: string,
    filePath: string,
    staleRanges: LineRange[],
  ): void {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = {
      ...review,
      comments: review.comments.map((c) => {
        if (c.file !== filePath) return c
        const isStale = staleRanges.some(
          (r) => c.start_line >= r.startLine && c.end_line <= r.endLine
        )
        return isStale ? { ...c, is_stale: true } : c
      }),
    }
    writeReview(repoPath, prId, updated)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/review-store/index.ts
git commit -m "feat: add ReviewStore class"
```

---

## Task 5: ReviewStore — tests

**Files:**
- Create: `src/main/__tests__/review-store.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/main/__tests__/review-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ReviewStore, InvalidReviewFileError } from '../../shared/review-store'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'review-store-test-'))
}

describe('ReviewStore', () => {
  let store: ReviewStore
  let repoPath: string

  beforeEach(() => {
    store = new ReviewStore()
    repoPath = makeTmpDir()
    // Simulate a git repo directory
    fs.mkdirSync(path.join(repoPath, '.git'))
  })

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true })
  })

  describe('PRs', () => {
    it('creates a PR and lists it', () => {
      const pr = store.createPR(repoPath, {
        title: 'Add auth',
        description: null,
        base_branch: 'main',
        compare_branch: 'feature/auth',
      })
      expect(pr.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(pr.title).toBe('Add auth')
      expect(pr.status).toBe('open')

      const prs = store.listPRs(repoPath)
      expect(prs).toHaveLength(1)
      expect(prs[0].id).toBe(pr.id)
    })

    it('getPR reads from disk', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const fetched = store.getPR(repoPath, pr.id)
      expect(fetched.id).toBe(pr.id)
      expect(fetched.title).toBe('T')
    })

    it('updatePRStatus changes status and updated_at', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const updated = store.updatePRStatus(repoPath, pr.id, 'closed')
      expect(updated.status).toBe('closed')
      expect(updated.updated_at).not.toBe(pr.updated_at)
    })

    it('listPRs returns empty array when .reviews/ is absent', () => {
      expect(store.listPRs(repoPath)).toHaveLength(0)
    })

    it('listPRs silently skips corrupt files', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const indexPath = path.join(repoPath, '.reviews', pr.id, 'index.json')
      fs.writeFileSync(indexPath, 'not json')
      expect(store.listPRs(repoPath)).toHaveLength(0)
    })
  })

  describe('Reviews', () => {
    let prId: string

    beforeEach(() => {
      prId = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' }).id
    })

    it('creates a review and lists it', () => {
      const review = store.createReview(repoPath, prId, { base_sha: 'abc', compare_sha: 'def' })
      expect(review.status).toBe('in_progress')
      expect(review.comments).toHaveLength(0)

      const reviews = store.listReviews(repoPath, prId)
      expect(reviews).toHaveLength(1)
      expect(reviews[0].id).toBe(review.id)
    })

    it('getOrCreateInProgressReview returns existing review on second call', () => {
      const r1 = store.getOrCreateInProgressReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      const r2 = store.getOrCreateInProgressReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      expect(r1.id).toBe(r2.id)
    })

    it('submitReview sets status and submitted_at', () => {
      const review = store.createReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      const submitted = store.submitReview(repoPath, prId, review.id)
      expect(submitted.status).toBe('submitted')
      expect(submitted.submitted_at).not.toBeNull()
    })

    it('allows multiple review rounds per PR', () => {
      store.createReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' })
      store.createReview(repoPath, prId, { base_sha: 'c', compare_sha: 'd' })
      expect(store.listReviews(repoPath, prId)).toHaveLength(2)
    })
  })

  describe('Comments', () => {
    let prId: string
    let reviewId: string

    beforeEach(() => {
      prId = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' }).id
      reviewId = store.createReview(repoPath, prId, { base_sha: 'a', compare_sha: 'b' }).id
    })

    it('adds a comment and assigns sequential ID', () => {
      const updated = store.addComment(repoPath, prId, reviewId, {
        file: 'src/auth.ts',
        start_line: 10,
        end_line: 12,
        side: 'right',
        body: 'Use httpOnly cookie',
        context: [{ line: 10, type: 'added', content: 'res.send(token)' }],
      })
      expect(updated.comments).toHaveLength(1)
      expect(updated.comments[0].id).toBe('RVW-001')
      expect(updated.comments[0].status).toBe('open')
      expect(updated.comments[0].resolution).toBeNull()
    })

    it('assigns sequential IDs for multiple comments', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 1, end_line: 1, side: 'right', body: 'c1', context: [] })
      const updated = store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 2, end_line: 2, side: 'right', body: 'c2', context: [] })
      expect(updated.comments[1].id).toBe('RVW-002')
    })

    it('resolveComment marks as resolved with resolution', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 1, end_line: 1, side: 'right', body: 'Fix me', context: [] })
      const updated = store.resolveComment(repoPath, prId, reviewId, 'RVW-001', 'resolved', {
        comment: 'Fixed by using httpOnly',
        resolved_by: 'claude',
        resolved_at: new Date().toISOString(),
      })
      expect(updated.comments[0].status).toBe('resolved')
      expect(updated.comments[0].resolution?.comment).toBe('Fixed by using httpOnly')
    })

    it('resolveComment supports wont_fix status', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'a.ts', start_line: 1, end_line: 1, side: 'right', body: 'Fix me', context: [] })
      const updated = store.resolveComment(repoPath, prId, reviewId, 'RVW-001', 'wont_fix', {
        comment: 'Out of scope for this PR',
        resolved_by: 'claude',
        resolved_at: new Date().toISOString(),
      })
      expect(updated.comments[0].status).toBe('wont_fix')
    })

    it('markStale marks comments whose line range overlaps stale ranges', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'src/a.ts', start_line: 5, end_line: 7, side: 'right', body: 'old', context: [] })
      store.markStale(repoPath, prId, reviewId, 'src/a.ts', [{ startLine: 5, endLine: 7 }])
      const review = store.getReview(repoPath, prId, reviewId)
      expect(review.comments[0].is_stale).toBe(true)
    })

    it('markStale does not affect comments on other files', () => {
      store.addComment(repoPath, prId, reviewId, { file: 'src/b.ts', start_line: 5, end_line: 7, side: 'right', body: 'ok', context: [] })
      store.markStale(repoPath, prId, reviewId, 'src/a.ts', [{ startLine: 5, endLine: 7 }])
      const review = store.getReview(repoPath, prId, reviewId)
      expect(review.comments[0].is_stale).toBe(false)
    })
  })

  describe('InvalidReviewFileError', () => {
    it('getPR throws InvalidReviewFileError for corrupt file', () => {
      const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
      const indexPath = path.join(repoPath, '.reviews', pr.id, 'index.json')
      fs.writeFileSync(indexPath, '{"version":1,"id":"not-a-uuid"}')
      expect(() => store.getPR(repoPath, pr.id)).toThrow(InvalidReviewFileError)
    })
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/nodepoint/Development/nodepoint/local-code-review
npm run test:main -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|review-store)"
```

Expected: all review-store tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main/__tests__/review-store.test.ts
git commit -m "test: add ReviewStore unit tests"
```

---

## Task 6: Simplify DB — schema, index, repos

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/index.ts`
- Modify: `src/main/db/repos.ts`
- Modify: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Rewrite schema.ts — keep only repositories and settings**

```typescript
// src/main/db/schema.ts
import type Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id               TEXT PRIMARY KEY,
      path             TEXT NOT NULL UNIQUE,
      name             TEXT NOT NULL,
      created_at       TEXT NOT NULL,
      last_visited_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}
```

- [ ] **Step 2: Update db/index.ts — delete existing DB file on startup**

```typescript
// src/main/db/index.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { applySchema } from './schema'

let _db: Database.Database | null = null

function getNativeBinding(): string {
  const relPath = path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', relPath)
  }
  return path.join(app.getAppPath(), relPath)
}

export function getDb(): Database.Database {
  if (_db) return _db
  const dbPath = path.join(app.getPath('userData'), 'pr-reviewer.sqlite')

  // One-time preproduction reset: delete old DB that contains review tables.
  // Safe to remove once the app ships to real users.
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }

  _db = new Database(dbPath, { nativeBinding: getNativeBinding() })
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  applySchema(_db)
  return _db
}
```

- [ ] **Step 3: Update db/repos.ts — remove listReposWithMeta (JOIN no longer valid)**

```typescript
// src/main/db/repos.ts
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
    last_visited_at: null,
  }
  db.prepare('INSERT INTO repositories (id, path, name, created_at, last_visited_at) VALUES (?,?,?,?,?)')
    .run(repo.id, repo.path, repo.name, repo.created_at, repo.last_visited_at)
  return repo
}

export function listRepos(db: Database.Database): Repository[] {
  return db
    .prepare('SELECT * FROM repositories ORDER BY last_visited_at DESC NULLS LAST, created_at DESC')
    .all() as Repository[]
}

export function touchRepo(db: Database.Database, repoId: string): void {
  db.prepare('UPDATE repositories SET last_visited_at = ? WHERE id = ?')
    .run(new Date().toISOString(), repoId)
}
```

- [ ] **Step 4: Update db.test.ts — remove all PR/review/comment tests, fix schema test**

Replace the full content of `src/main/__tests__/db.test.ts`:

```typescript
// src/main/__tests__/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../db/schema'
import { insertRepo, listRepos, findRepoByPath, touchRepo } from '../db/repos'
import { getSetting, setSetting } from '../db/settings'

describe('database schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('creates repositories and settings tables', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('repositories')
    expect(names).toContain('settings')
    expect(names).not.toContain('pull_requests')
    expect(names).not.toContain('reviews')
    expect(names).not.toContain('comments')
  })
})

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
  })

  it('returns existing repo if path already registered', () => {
    const r1 = insertRepo(db, '/projects/my-app', 'my-app')
    const r2 = insertRepo(db, '/projects/my-app', 'my-app')
    expect(r1.id).toBe(r2.id)
  })

  it('lists all repos ordered by last_visited_at desc', () => {
    insertRepo(db, '/a', 'a')
    insertRepo(db, '/b', 'b')
    expect(listRepos(db)).toHaveLength(2)
  })

  it('touchRepo sets last_visited_at', () => {
    const repo = insertRepo(db, '/a', 'a')
    expect(listRepos(db)[0].last_visited_at).toBeNull()
    touchRepo(db, repo.id)
    expect(listRepos(db)[0].last_visited_at).not.toBeNull()
  })
})

describe('settings', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('returns null for unknown key', () => {
    expect(getSetting(db, 'nonexistent')).toBeNull()
  })

  it('sets and gets a value', () => {
    setSetting(db, 'scan_base_dir', '/home/user/dev')
    expect(getSetting(db, 'scan_base_dir')).toBe('/home/user/dev')
  })

  it('overwrites an existing value', () => {
    setSetting(db, 'scan_base_dir', '/old')
    setSetting(db, 'scan_base_dir', '/new')
    expect(getSetting(db, 'scan_base_dir')).toBe('/new')
  })
})
```

- [ ] **Step 5: Run tests to verify**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×)"
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/schema.ts src/main/db/index.ts src/main/db/repos.ts src/main/__tests__/db.test.ts
git commit -m "feat: simplify DB schema (repos + settings only), drop old DB on startup"
```

---

## Task 7: Delete old files and update shared types

**Files:**
- Delete: `src/main/db/prs.ts`
- Delete: `src/main/db/reviews.ts`
- Delete: `src/main/export/json.ts`
- Delete: `src/main/__tests__/export-json.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Delete old files**

```bash
rm src/main/db/prs.ts
rm src/main/db/reviews.ts
rm src/main/export/json.ts
rm src/main/__tests__/export-json.test.ts
```

- [ ] **Step 2: Update shared/types.ts**

Replace the full content. Keep diff types, IPC types, and Repository types. Remove old SQLite-mirror types. Add new file-based types re-exported from review-store.

```typescript
// src/shared/types.ts
export type { PRFile, ReviewFile, ReviewComment, Resolution, ContextLineEntry } from './review-store'

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

export interface PrDetail {
  pr: PRFile
  diff: ParsedFile[]
  review: ReviewFile | null
  isStale: boolean
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
  id: 'claudeCode' | 'claudeDesktop' | 'vscode' | 'cursor' | 'windsurf'
  name: string
  detected: boolean
  installed: boolean
}
```

- [ ] **Step 3: Run tests to confirm nothing broken**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|Error)"
```

Expected: passes. (export-json tests are gone, export-markdown tests may fail — fix in next task)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git rm src/main/db/prs.ts src/main/db/reviews.ts src/main/export/json.ts src/main/__tests__/export-json.test.ts
git commit -m "refactor: remove SQLite review types; use file-based types from review-store"
```

---

## Task 8: Rewrite IPC — prs

**Files:**
- Modify: `src/main/ipc/prs.ts`
- Modify: `src/main/ipc/repos.ts`

- [ ] **Step 1: Rewrite ipc/prs.ts to use ReviewStore**

```typescript
// src/main/ipc/prs.ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { listBranches, resolveSha } from '../git/branches'
import { execGit } from '../git/runner'
import { parseDiff } from '../git/diff-parser'
import type { Commit, CreatePrPayload, PrDetail } from '../../shared/types'

const store = new ReviewStore()

export function registerPrHandlers(db: Database.Database): void {
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
      const baseSha = await resolveSha(payload.repoPath, payload.baseBranch)
      const compareSha = await resolveSha(payload.repoPath, payload.compareBranch)
      return store.createPR(payload.repoPath, {
        title: payload.title,
        description: payload.description,
        base_branch: payload.baseBranch,
        compare_branch: payload.compareBranch,
      })
      // SHAs are resolved but stored on the first review, not on the PR itself
    } catch (err) {
      return { error: 'git-failed', message: (err as Error).message }
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
      return { error: 'git-failed', message: (err as Error).message }
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
      return { error: 'git-failed', message: (err as Error).message }
    }
  })

  ipcMain.handle('commits:list', async (_e, prId: string, repoPath: string): Promise<Commit[] | { error: string }> => {
    try {
      const pr = store.getPR(repoPath, prId)
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
```

- [ ] **Step 2: Update ipc/repos.ts — count PRs from filesystem**

Open `src/main/ipc/repos.ts`. Find the handler for `repos:list` and update it to add `pr_count`. The rest of the file is unchanged.

Locate the section that handles `repos:list` (look for `ipcMain.handle('repos:list'`) and replace just that handler:

```typescript
  ipcMain.handle('repos:list', () => {
    try {
      const repos = listRepos(db)
      return repos.map((repo) => ({
        ...repo,
        pr_count: store.listPRs(repo.path).length,
      }))
    } catch {
      return []
    }
  })
```

Also add `import { ReviewStore } from '../../shared/review-store'` and `const store = new ReviewStore()` near the top of `ipc/repos.ts`, after the existing imports.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/prs.ts src/main/ipc/repos.ts
git commit -m "feat: rewrite prs IPC and repos list to use ReviewStore"
```

---

## Task 9: Rewrite IPC — reviews and export

**Files:**
- Modify: `src/main/ipc/reviews.ts`
- Modify: `src/main/ipc/export.ts`
- Modify: `src/main/export/markdown.ts`
- Modify: `src/main/__tests__/export-markdown.test.ts`

- [ ] **Step 1: Rewrite ipc/reviews.ts**

```typescript
// src/main/ipc/reviews.ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import type { AddCommentPayload } from '../../shared/types'

const store = new ReviewStore()

export function registerReviewHandlers(_db: Database.Database): void {
  ipcMain.handle('comments:add', async (_e, payload: AddCommentPayload) => {
    try {
      const updated = store.addComment(payload.repoPath, payload.prId, payload.reviewId, {
        file: payload.file,
        start_line: payload.startLine,
        end_line: payload.endLine,
        side: payload.side,
        body: payload.body,
        context: payload.context,
      })
      return updated
    } catch (err) {
      return { error: 'store-failed', message: (err as Error).message }
    }
  })

  ipcMain.handle('reviews:submit', async (_e, repoPath: string, prId: string, reviewId: string) => {
    try {
      return store.submitReview(repoPath, prId, reviewId)
    } catch (err) {
      return { error: 'store-failed', message: (err as Error).message }
    }
  })
}
```

- [ ] **Step 2: Update export/markdown.ts to accept ReviewStore types**

Open `src/main/export/markdown.ts`. Update the imports and function signatures to use `PRFile` and `ReviewFile` instead of the old SQLite types. The rendering logic stays the same.

```typescript
// src/main/export/markdown.ts
import type { PRFile, ReviewFile } from '../../shared/review-store'

export function prTitleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

export function buildMarkdown(pr: PRFile, review: ReviewFile): string {
  const date = (review.submitted_at ?? review.created_at).slice(0, 10)
  const nonStale = review.comments.filter((c) => !c.is_stale)

  const lines: string[] = [
    `# Review: ${pr.title}`,
    `**PR:** \`${pr.compare_branch}\` → \`${pr.base_branch}\``,
    `**Submitted:** ${date}`,
    `**Review ID:** \`${review.id}\``,
    '',
    '---',
    '',
  ]

  for (const comment of nonStale) {
    lines.push(`## Issue ${comment.id}`)
    lines.push(`**File:** \`${comment.file}\``)
    lines.push(`**Lines:** ${comment.start_line}–${comment.end_line}`)
    lines.push('')

    if (comment.context.length > 0) {
      const ext = comment.file.split('.').pop() ?? ''
      lines.push('```' + ext)
      for (const l of comment.context) {
        const prefix = l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' '
        lines.push(`${prefix} ${l.content}`)
      }
      lines.push('```')
      lines.push('')
    }

    lines.push(`**Comment:**`)
    lines.push(comment.body)

    if (comment.resolution) {
      lines.push('')
      const statusLabel = comment.status === 'resolved' ? 'Resolved' : 'Won\'t Fix'
      lines.push(`**${statusLabel} by ${comment.resolution.resolved_by}:** ${comment.resolution.comment}`)
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}
```

- [ ] **Step 3: Rewrite ipc/export.ts**

```typescript
// src/main/ipc/export.ts
import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import type Database from 'better-sqlite3'
import { ReviewStore } from '../../shared/review-store'
import { buildMarkdown, prTitleSlug } from '../export/markdown'

const store = new ReviewStore()

export function registerExportHandlers(_db: Database.Database): void {
  ipcMain.handle(
    'export:download-markdown',
    async (_e, repoPath: string, prId: string, reviewId: string) => {
      try {
        const pr = store.getPR(repoPath, prId)
        const review = store.getReview(repoPath, prId, reviewId)

        const date = new Date().toISOString().slice(0, 10)
        const slug = prTitleSlug(pr.title)
        const defaultName = `review-${slug}-${date}.md`

        const { filePath, canceled } = await dialog.showSaveDialog({
          title: 'Save Review as Markdown',
          defaultPath: defaultName,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })

        if (canceled || !filePath) return { error: 'cancelled' }

        const md = buildMarkdown(pr, review)
        fs.writeFileSync(filePath, md, 'utf8')
        return { path: filePath }
      } catch (err) {
        return { error: 'export-failed', message: (err as Error).message }
      }
    }
  )
}
```

- [ ] **Step 4: Update export-markdown tests**

Open `src/main/__tests__/export-markdown.test.ts`. Update it to use the new function signature. The new `buildMarkdown` takes `(pr: PRFile, review: ReviewFile)` instead of the old signature.

```typescript
// src/main/__tests__/export-markdown.test.ts
import { describe, it, expect } from 'vitest'
import { buildMarkdown, prTitleSlug } from '../export/markdown'
import type { PRFile, ReviewFile } from '../../shared/review-store'

const pr: PRFile = {
  version: 1,
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Add user authentication',
  description: null,
  base_branch: 'main',
  compare_branch: 'feature/auth',
  status: 'open',
  created_at: '2026-04-08T10:00:00Z',
  updated_at: '2026-04-08T10:00:00Z',
}

const review: ReviewFile = {
  version: 1,
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  status: 'submitted',
  base_sha: 'abc',
  compare_sha: 'def',
  created_at: '2026-04-08T10:00:00Z',
  submitted_at: '2026-04-08T11:00:00Z',
  comments: [
    {
      id: 'RVW-001',
      file: 'src/auth.ts',
      start_line: 10,
      end_line: 12,
      side: 'right',
      body: 'Use httpOnly cookie',
      context: [{ line: 10, type: 'added', content: 'res.send(token)' }],
      is_stale: false,
      status: 'open',
      resolution: null,
      created_at: '2026-04-08T10:01:00Z',
    },
  ],
}

describe('buildMarkdown', () => {
  it('includes PR title and branches', () => {
    const md = buildMarkdown(pr, review)
    expect(md).toContain('Add user authentication')
    expect(md).toContain('feature/auth')
    expect(md).toContain('main')
  })

  it('includes issue ID and file', () => {
    const md = buildMarkdown(pr, review)
    expect(md).toContain('RVW-001')
    expect(md).toContain('src/auth.ts')
  })

  it('includes comment body', () => {
    const md = buildMarkdown(pr, review)
    expect(md).toContain('Use httpOnly cookie')
  })

  it('excludes stale comments', () => {
    const staleReview: ReviewFile = {
      ...review,
      comments: [{ ...review.comments[0], is_stale: true }],
    }
    const md = buildMarkdown(pr, staleReview)
    expect(md).not.toContain('RVW-001')
  })

  it('includes resolution when present', () => {
    const resolvedReview: ReviewFile = {
      ...review,
      comments: [
        {
          ...review.comments[0],
          status: 'resolved',
          resolution: {
            comment: 'Fixed with httpOnly',
            resolved_by: 'claude',
            resolved_at: '2026-04-08T12:00:00Z',
          },
        },
      ],
    }
    const md = buildMarkdown(pr, resolvedReview)
    expect(md).toContain('Fixed with httpOnly')
    expect(md).toContain('claude')
  })
})

describe('prTitleSlug', () => {
  it('converts title to kebab-case slug', () => {
    expect(prTitleSlug('Add user authentication')).toBe('add-user-authentication')
  })

  it('strips special characters', () => {
    expect(prTitleSlug('Fix: bug #123!')).toBe('fix-bug-123')
  })

  it('truncates to 50 characters', () => {
    expect(prTitleSlug('a'.repeat(60))).toHaveLength(50)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|Error)"
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/reviews.ts src/main/ipc/export.ts src/main/export/markdown.ts src/main/__tests__/export-markdown.test.ts
git commit -m "feat: rewrite reviews/export IPC to use ReviewStore; markdown export reads from file"
```

---

## Task 10: Update preload and main/index.ts

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Rewrite preload/index.ts**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
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

  // Reviews & Comments
  addComment: (payload: AddCommentPayload): Promise<ReviewFile | { error: string }> =>
    ipcRenderer.invoke('comments:add', payload),
  submitReview: (repoPath: string, prId: string, reviewId: string): Promise<ReviewFile | { error: string }> =>
    ipcRenderer.invoke('reviews:submit', repoPath, prId, reviewId),
  downloadMarkdown: (repoPath: string, prId: string, reviewId: string): Promise<{ path: string } | { error: string }> =>
    ipcRenderer.invoke('export:download-markdown', repoPath, prId, reviewId),

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
  launchFix: (tool: 'claude' | 'vscode', repoPath: string, prId: string, reviewId: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke('fix:launch', tool, repoPath, prId, reviewId),

  // Push events from main to renderer
  onReviewUpdated: (callback: (data: { repoPath: string; prId: string; reviewId: string }) => void) => {
    ipcRenderer.on('review:updated', (_e, data) => callback(data))
  },
  offReviewUpdated: () => {
    ipcRenderer.removeAllListeners('review:updated')
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 2: Update main/index.ts — remove old IPC registrations**

Replace `src/main/index.ts` with the following (tray and MCP wiring added in Task 13; this step just makes existing handlers compile):

```typescript
// src/main/index.ts
;(globalThis as any).__non_webpack_require__ = require

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb } from './db'
import { registerRepoHandlers } from './ipc/repos'
import { registerPrHandlers } from './ipc/prs'
import { registerReviewHandlers } from './ipc/reviews'
import { registerExportHandlers } from './ipc/export'

function createWindow(): BrowserWindow {
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

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local-code-review')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

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

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck 2>&1 | head -40
```

Fix any type errors before continuing. Common issues: renderer code still referencing removed types like `Comment` or `PullRequest` directly — update those imports to use `ReviewFile` and `PRFile`.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/main/index.ts
git commit -m "feat: update preload API and main process for file-based review IPC"
```

---

## Task 11: MCP server — socket client, tools, and entry point

**Files:**
- Create: `src/mcp-server/socket-client.ts`
- Create: `src/mcp-server/tools.ts`
- Create: `src/mcp-server/index.ts`

- [ ] **Step 1: Create socket-client.ts**

```typescript
// src/mcp-server/socket-client.ts
import net from 'net'

export interface ReviewUpdatedEvent {
  event: 'review:updated'
  repoPath: string
  prId: string
  reviewId: string
}

export class SocketClient {
  private client: net.Socket | null = null
  private socketPath: string | null = null

  connect(socketPath: string): void {
    this.socketPath = socketPath
    this.client = net.createConnection(socketPath)
    this.client.on('error', () => {
      // Silently ignore — Electron may not be listening (e.g. unit test context)
    })
  }

  emit(event: ReviewUpdatedEvent): void {
    if (!this.client || this.client.destroyed) return
    try {
      this.client.write(JSON.stringify(event) + '\n')
    } catch {
      // ignore write errors
    }
  }

  disconnect(): void {
    this.client?.destroy()
    this.client = null
  }
}
```

- [ ] **Step 2: Create tools.ts**

```typescript
// src/mcp-server/tools.ts
import { ReviewStore, InvalidReviewFileError } from '../shared/review-store'
import type { SocketClient, ReviewUpdatedEvent } from './socket-client'

const store = new ReviewStore()

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

export function buildTools() {
  return [
    {
      name: 'list_prs',
      description: 'List all pull requests in a repository\'s .reviews/ directory.',
      inputSchema: {
        type: 'object' as const,
        properties: { repo_path: { type: 'string', description: 'Absolute path to the repository' } },
        required: ['repo_path'],
      },
    },
    {
      name: 'get_pr',
      description: 'Get a pull request\'s metadata and review summary.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string', description: 'UUID of the PR' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
    {
      name: 'get_review',
      description: 'Get the full content of a review including all comments and their resolution state.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
        },
        required: ['repo_path', 'pr_id', 'review_id'],
      },
    },
    {
      name: 'get_open_issues',
      description: 'Get only open (unresolved) comments. Omit review_id to query the latest review.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string', description: 'Optional. Defaults to latest review.' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
    {
      name: 'mark_resolved',
      description: 'Mark a review comment as resolved. A resolution_comment explaining what was done is required.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
          comment_id: { type: 'string', description: 'e.g. "RVW-001"' },
          resolution_comment: { type: 'string', description: 'Required. Explain what fix was applied.' },
        },
        required: ['repo_path', 'pr_id', 'review_id', 'comment_id', 'resolution_comment'],
      },
    },
    {
      name: 'mark_wont_fix',
      description: 'Mark a review comment as won\'t fix. A resolution_comment explaining why is required.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
          comment_id: { type: 'string', description: 'e.g. "RVW-001"' },
          resolution_comment: { type: 'string', description: 'Required. Explain why this is not being fixed.' },
        },
        required: ['repo_path', 'pr_id', 'review_id', 'comment_id', 'resolution_comment'],
      },
    },
  ]
}

export async function callTool(
  name: string,
  args: Record<string, string>,
  socketClient: SocketClient,
  resolvedBy: string,
) {
  try {
    switch (name) {
      case 'list_prs': {
        const prs = store.listPRs(args.repo_path)
        return ok(prs)
      }

      case 'get_pr': {
        const pr = store.getPR(args.repo_path, args.pr_id)
        const reviews = store.listReviews(args.repo_path, args.pr_id)
        return ok({ pr, review_count: reviews.length, reviews: reviews.map((r) => ({ id: r.id, status: r.status, created_at: r.created_at, comment_count: r.comments.length })) })
      }

      case 'get_review': {
        const review = store.getReview(args.repo_path, args.pr_id, args.review_id)
        return ok(review)
      }

      case 'get_open_issues': {
        let reviewId = args.review_id
        if (!reviewId) {
          const reviews = store.listReviews(args.repo_path, args.pr_id)
          if (reviews.length === 0) return ok([])
          reviewId = reviews[0].id
        }
        const review = store.getReview(args.repo_path, args.pr_id, reviewId)
        const open = review.comments.filter((c) => c.status === 'open' && !c.is_stale)
        return ok({ review_id: reviewId, open_issues: open })
      }

      case 'mark_resolved': {
        if (!args.resolution_comment?.trim()) {
          return err('resolution_comment is required and cannot be empty')
        }
        const updated = store.resolveComment(
          args.repo_path, args.pr_id, args.review_id, args.comment_id,
          'resolved',
          { comment: args.resolution_comment, resolved_by: resolvedBy, resolved_at: new Date().toISOString() },
        )
        socketClient.emit({ event: 'review:updated', repoPath: args.repo_path, prId: args.pr_id, reviewId: args.review_id })
        return ok({ success: true, comment: updated.comments.find((c) => c.id === args.comment_id) })
      }

      case 'mark_wont_fix': {
        if (!args.resolution_comment?.trim()) {
          return err('resolution_comment is required and cannot be empty')
        }
        const updated = store.resolveComment(
          args.repo_path, args.pr_id, args.review_id, args.comment_id,
          'wont_fix',
          { comment: args.resolution_comment, resolved_by: resolvedBy, resolved_at: new Date().toISOString() },
        )
        socketClient.emit({ event: 'review:updated', repoPath: args.repo_path, prId: args.pr_id, reviewId: args.review_id })
        return ok({ success: true, comment: updated.comments.find((c) => c.id === args.comment_id) })
      }

      default:
        return err(`Unknown tool: ${name}`)
    }
  } catch (e) {
    if (e instanceof InvalidReviewFileError) return err(e.message)
    return err((e as Error).message)
  }
}
```

- [ ] **Step 3: Create mcp-server/index.ts**

```typescript
// src/mcp-server/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { SocketClient } from './socket-client'
import { buildTools, callTool } from './tools'

const SOCKET_PATH = process.env['LOCAL_REVIEW_SOCKET'] ?? ''
const RESOLVED_BY = process.env['LOCAL_REVIEW_IDENTITY'] ?? 'mcp'

const socketClient = new SocketClient()
if (SOCKET_PATH) socketClient.connect(SOCKET_PATH)

const server = new Server(
  { name: 'local-code-review', version: '1.0.0' },
  { capabilities: { tools: {}, prompts: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: buildTools(),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, string>
  return callTool(request.params.name, args, socketClient, RESOLVED_BY)
})

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'fix-review',
      description: 'Workflow prompt for implementing fixes from a local code review',
    },
  ],
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== 'fix-review') {
    throw new Error(`Unknown prompt: ${request.params.name}`)
  }
  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are implementing fixes from a local code review.

Use get_open_issues() to find open issues in this repository. For each open issue:
1. Read the context and understand what needs to change
2. Implement the fix in the codebase
3. Call mark_resolved() or mark_wont_fix() with a clear explanation of what you did or why you skipped it

Rules:
- Never mark an issue without a resolution_comment
- Work through all open issues before finishing
- If an issue is already fixed by the time you get to it, mark_resolved() and explain what you observed`,
        },
      },
    ],
  }
})

const transport = new StdioServerTransport()
server.connect(transport).then(() => {
  // Server is running; stdio is the transport
})
```

- [ ] **Step 4: Build the MCP server**

```bash
npm run build:mcp 2>&1 | tail -10
```

Expected: `dist/mcp-server/index.js` created with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server/ vite.mcp.config.ts
git commit -m "feat: add MCP server (stdio transport, 6 tools, fix-review prompt)"
```

---

## Task 12: MCP manager and review watcher

**Files:**
- Create: `src/main/mcp-manager.ts`
- Create: `src/main/review-watcher.ts`

- [ ] **Step 1: Create mcp-manager.ts**

```typescript
// src/main/mcp-manager.ts
import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import os from 'os'
import path from 'path'
import { app } from 'electron'

export interface McpEvent {
  event: string
  repoPath: string
  prId: string
  reviewId: string
}

export class McpManager {
  private child: ChildProcess | null = null
  private socketServer: net.Server | null = null
  private socketPath: string

  constructor(private onEvent: (event: McpEvent) => void) {
    const suffix = process.platform === 'win32' ? `local-review-${process.pid}` : `local-review-${process.pid}.sock`
    this.socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${suffix}`
        : path.join(os.tmpdir(), suffix)
  }

  get running(): boolean {
    return this.child !== null && !this.child.killed
  }

  start(): void {
    if (this.running) return
    this.startSocketServer()
    this.spawnChild()
  }

  stop(): void {
    this.child?.kill('SIGTERM')
    this.child = null
    this.socketServer?.close()
    this.socketServer = null
  }

  private mcpBinaryPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'mcp-server', 'index.js')
    }
    return path.join(app.getAppPath(), 'dist', 'mcp-server', 'index.js')
  }

  private spawnChild(): void {
    const env = {
      ...process.env,
      LOCAL_REVIEW_SOCKET: this.socketPath,
      LOCAL_REVIEW_IDENTITY: 'mcp',
    }

    this.child = spawn(process.execPath, [this.mcpBinaryPath()], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child.on('close', () => {
      this.child = null
    })

    this.child.stderr?.on('data', (data: Buffer) => {
      // Log MCP server stderr to main process stderr for debugging
      process.stderr.write(`[mcp-server] ${data.toString()}`)
    })
  }

  private startSocketServer(): void {
    this.socketServer = net.createServer((socket) => {
      let buf = ''
      socket.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as McpEvent
            this.onEvent(event)
          } catch {
            // ignore malformed lines
          }
        }
      })
    })

    this.socketServer.listen(this.socketPath)
  }
}
```

- [ ] **Step 2: Create review-watcher.ts**

```typescript
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

    // Debounce: coalesce rapid successive changes (e.g. atomic rename writes two events)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const watcher = fs.watch(reviewsDir, { recursive: true }, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => onChange(repoPath), 150)
    })

    watcher.on('error', () => {
      // Silently remove broken watcher
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
```

- [ ] **Step 3: Commit**

```bash
git add src/main/mcp-manager.ts src/main/review-watcher.ts
git commit -m "feat: add McpManager (spawn/kill + socket server) and ReviewWatcher (fs.watch)"
```

---

## Task 13: Main process — tray, window lifecycle, MCP wiring

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/repos.ts` — add MCP, integrations, and fix:launch handlers

- [ ] **Step 1: Replace src/main/index.ts with full tray + MCP version**

```typescript
// src/main/index.ts
;(globalThis as any).__non_webpack_require__ = require

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb } from './db'
import { registerRepoHandlers } from './ipc/repos'
import { registerPrHandlers } from './ipc/prs'
import { registerReviewHandlers } from './ipc/reviews'
import { registerExportHandlers } from './ipc/export'
import { McpManager } from './mcp-manager'
import { ReviewWatcher } from './review-watcher'
import { getSetting, setSetting } from './db/settings'
import { listRepos } from './db/repos'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let mcpManager: McpManager | null = null
let reviewWatcher: ReviewWatcher | null = null

function createTray(db: ReturnType<typeof getDb>): void {
  // Use a blank 16x16 image as placeholder — replace with real icon asset if available
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  function updateMenu(): void {
    const running = mcpManager?.running ?? false
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Interface',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      { type: 'separator' },
      {
        label: running ? 'MCP Server: Running ✓' : 'MCP Server: Stopped',
        click: () => {
          if (running) {
            mcpManager!.stop()
            setSetting(db, 'mcp_enabled', 'false')
          } else {
            mcpManager!.start()
            setSetting(db, 'mcp_enabled', 'true')
          }
          updateMenu()
          mainWindow?.webContents.send('mcp:status-changed', { running: mcpManager?.running ?? false })
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          mcpManager?.stop()
          reviewWatcher?.unwatchAll()
          app.quit()
        },
      },
    ])
    tray!.setContextMenu(menu)
    tray!.setToolTip('Local Code Review')
  }

  updateMenu()
}

function createWindow(db: ReturnType<typeof getDb>): BrowserWindow {
  const win = new BrowserWindow({
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

  win.on('ready-to-show', () => win.show())

  win.on('close', (e) => {
    if (mcpManager?.running) {
      // Hide to tray instead of closing when MCP is running
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local-code-review')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const db = getDb()

  reviewWatcher = new ReviewWatcher()
  mcpManager = new McpManager((event) => {
    // MCP agent wrote to a review file — push to renderer
    mainWindow?.webContents.send('review:updated', {
      repoPath: event.repoPath,
      prId: event.prId,
      reviewId: event.reviewId,
    })
  })

  // Start MCP server if it was enabled in a previous session
  if (getSetting(db, 'mcp_enabled') === 'true') {
    mcpManager.start()
  }

  // Watch .reviews/ dirs for all known repos (handles external edits / JSON fallback)
  for (const repo of listRepos(db)) {
    reviewWatcher.watch(repo.path, (repoPath) => {
      mainWindow?.webContents.send('review:updated', { repoPath, prId: null, reviewId: null })
    })
  }

  registerRepoHandlers(db)
  registerPrHandlers(db)
  registerReviewHandlers(db)
  registerExportHandlers(db)

  // MCP status handlers
  ipcMain.handle('mcp:get-status', () => ({ running: mcpManager?.running ?? false }))
  ipcMain.handle('mcp:toggle', () => {
    if (mcpManager!.running) {
      mcpManager!.stop()
      setSetting(db, 'mcp_enabled', 'false')
    } else {
      mcpManager!.start()
      setSetting(db, 'mcp_enabled', 'true')
    }
    const running = mcpManager!.running
    mainWindow?.webContents.send('mcp:status-changed', { running })
    return { running }
  })

  createTray(db)
  mainWindow = createWindow(db)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(db)
    } else {
      mainWindow?.show()
    }
  })
})

app.on('before-quit', () => {
  mcpManager?.stop()
  reviewWatcher?.unwatchAll()
})

app.on('window-all-closed', () => {
  // Don't quit on macOS when MCP is running — tray keeps it alive
  if (process.platform !== 'darwin' && !mcpManager?.running) {
    app.quit()
  }
})
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Fix any errors before committing.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add tray, window-hide-to-tray, MCP lifecycle wiring in main process"
```

---

## Task 14: Integration detection and installation

**Files:**
- Create: `src/main/integrations.ts`
- Modify: `src/main/index.ts` — register integrations IPC handlers and fix:launch handler

- [ ] **Step 1: Create src/main/integrations.ts**

```typescript
// src/main/integrations.ts
import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import type { IntegrationStatus } from '../shared/types'

const home = os.homedir()
const appdata = process.env['APPDATA'] ?? home
const platform = process.platform

function xdgConfig(): string {
  return process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config')
}

interface ToolConfig {
  id: IntegrationStatus['id']
  name: string
  configPath: string
  // How to upsert our MCP entry into this tool's config
  keyPath: string[]   // JSON path to the servers object (e.g. ['mcpServers'] or ['mcp', 'servers'])
  entryShape: 'claude' | 'vscode'
}

function resolveConfigs(): ToolConfig[] {
  return [
    {
      id: 'claudeCode',
      name: 'Claude Code',
      configPath: path.join(home, '.claude', 'settings.json'),
      keyPath: ['mcpServers'],
      entryShape: 'claude',
    },
    {
      id: 'claudeDesktop',
      name: 'Claude Desktop',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Claude', 'claude_desktop_config.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
          : path.join(xdgConfig(), 'Claude', 'claude_desktop_config.json'),
      keyPath: ['mcpServers'],
      entryShape: 'claude',
    },
    {
      id: 'vscode',
      name: 'VS Code',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Code', 'User', 'settings.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json')
          : path.join(xdgConfig(), 'Code', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
      entryShape: 'vscode',
    },
    {
      id: 'cursor',
      name: 'Cursor',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Cursor', 'User', 'settings.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json')
          : path.join(xdgConfig(), 'Cursor', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
      entryShape: 'vscode',
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Windsurf', 'User', 'settings.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'settings.json')
          : path.join(xdgConfig(), 'Windsurf', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
      entryShape: 'vscode',
    },
  ]
}

function mcpBinaryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-server', 'index.js')
  }
  return path.join(app.getAppPath(), 'dist', 'mcp-server', 'index.js')
}

function buildEntry(shape: 'claude' | 'vscode') {
  const command = process.execPath  // node binary that runs the mcp-server script
  const args = [mcpBinaryPath()]
  if (shape === 'claude') {
    return { command, args }
  }
  return { type: 'stdio', command, args }
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function deepGet(obj: Record<string, unknown>, keyPath: string[]): Record<string, unknown> {
  let cur: unknown = obj
  for (const key of keyPath) {
    if (typeof cur !== 'object' || cur === null) return {}
    cur = (cur as Record<string, unknown>)[key]
  }
  return (typeof cur === 'object' && cur !== null ? cur : {}) as Record<string, unknown>
}

function deepSet(obj: Record<string, unknown>, keyPath: string[], value: unknown): void {
  let cur = obj
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i]
    if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {}
    cur = cur[key] as Record<string, unknown>
  }
  cur[keyPath[keyPath.length - 1]] = value
}

function isInstalled(config: ToolConfig): boolean {
  const obj = readJson(config.configPath)
  const servers = deepGet(obj, config.keyPath)
  return 'local-code-review' in servers
}

export function getIntegrations(): IntegrationStatus[] {
  return resolveConfigs().map((config) => ({
    id: config.id,
    name: config.name,
    detected: fs.existsSync(path.dirname(config.configPath)),
    installed: fs.existsSync(config.configPath) && isInstalled(config),
  }))
}

export function installIntegrations(): void {
  for (const config of resolveConfigs()) {
    const dir = path.dirname(config.configPath)
    if (!fs.existsSync(dir)) continue  // Tool not installed — skip

    const obj = readJson(config.configPath)
    const servers = deepGet(obj, config.keyPath)
    servers['local-code-review'] = buildEntry(config.entryShape)
    deepSet(obj, config.keyPath, servers)

    fs.mkdirSync(dir, { recursive: true })
    const tmp = config.configPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    fs.renameSync(tmp, config.configPath)
  }
}
```

- [ ] **Step 2: Register integrations + fix:launch handlers in main/index.ts**

In `src/main/index.ts`, inside `app.whenReady().then(...)` after the MCP toggle handlers, add:

```typescript
  // Integrations
  ipcMain.handle('integrations:get', () => {
    const { getIntegrations } = require('./integrations') as typeof import('./integrations')
    return getIntegrations()
  })

  ipcMain.handle('integrations:install', () => {
    const { installIntegrations } = require('./integrations') as typeof import('./integrations')
    installIntegrations()
  })

  // "Fix with" launcher
  ipcMain.handle('fix:launch', async (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
    try {
      if (tool === 'claude') {
        const mcpFlag = mcpManager?.running ? ['--mcp-server', 'local-code-review'] : []
        const prompt = `Fix the open issues in .reviews/${prId}/reviews/${reviewId}.json`
        const { execFile } = await import('child_process')
        await new Promise<void>((res, rej) =>
          execFile('claude', [...mcpFlag, prompt], { cwd: repoPath }, (err) => (err ? rej(err) : res()))
        )
        return {}
      }
      if (tool === 'vscode') {
        const prompt = `Fix the open issues in .reviews/${prId}/reviews/${reviewId}.json`
        const { execFile } = await import('child_process')
        // Copy fix-review prompt to clipboard so user can paste into Copilot chat
        mainWindow?.webContents.executeJavaScript(`navigator.clipboard.writeText(${JSON.stringify(prompt)})`)
        await new Promise<void>((res, rej) =>
          execFile('code', [repoPath], (err) => (err ? rej(err) : res()))
        )
        return {}
      }
      return { error: `Unknown tool: ${tool}` }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
```

Also add the import at the top of `main/index.ts`:
```typescript
import { getIntegrations, installIntegrations } from './integrations'
```

(And remove the `require()` calls from step 2 above — use the direct imports instead.)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/main/integrations.ts src/main/index.ts
git commit -m "feat: add integration detection/install and fix:launch IPC handlers"
```

---

## Task 15: Settings UI — MCP section

**Files:**
- Modify: `src/renderer/src/screens/Settings.tsx`

- [ ] **Step 1: Read current Settings.tsx**

```bash
cat src/renderer/src/screens/Settings.tsx
```

- [ ] **Step 2: Add MCP state and IntegrationStatus import at the top of Settings.tsx**

After the existing imports, add:

```typescript
import type { IntegrationStatus } from '../../../../shared/types'
```

Add new state variables inside the Settings component (after existing state):

```typescript
  const [mcpRunning, setMcpRunning] = React.useState(false)
  const [mcpLoading, setMcpLoading] = React.useState(false)
  const [integrations, setIntegrations] = React.useState<IntegrationStatus[]>([])
  const [installing, setInstalling] = React.useState(false)

  React.useEffect(() => {
    window.api.getMcpStatus().then(({ running }) => setMcpRunning(running))
    window.api.getIntegrations().then(setIntegrations)
  }, [])

  React.useEffect(() => {
    window.api.onReviewUpdated(() => {})  // no-op; keep listener registration pattern consistent
    return () => window.api.offReviewUpdated()
  }, [])

  async function handleToggleMcp() {
    setMcpLoading(true)
    const { running } = await window.api.toggleMcp()
    setMcpRunning(running)
    setMcpLoading(false)
  }

  async function handleInstallIntegrations() {
    setInstalling(true)
    await window.api.installIntegrations()
    const updated = await window.api.getIntegrations()
    setIntegrations(updated)
    setInstalling(false)
  }
```

- [ ] **Step 3: Add MCP section to the Settings JSX**

Locate the return JSX and append the following sections before the closing element:

```tsx
      {/* MCP Server */}
      <section style={{ marginTop: 32 }}>
        <h2>MCP Server</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Expose a local MCP server so AI agents (Claude, Copilot) can read reviews and mark issues resolved.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={handleToggleMcp} disabled={mcpLoading}>
            {mcpRunning ? 'Stop MCP Server' : 'Start MCP Server'}
          </button>
          <span style={{ fontSize: 13, color: mcpRunning ? 'var(--green)' : 'var(--text-muted)' }}>
            {mcpRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
      </section>

      {/* MCP Integrations */}
      <section style={{ marginTop: 32 }}>
        <h2>MCP Integrations</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Install the MCP server config into your AI tools so they can connect automatically.
        </p>
        <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
          <tbody>
            {integrations.map((tool) => (
              <tr key={tool.id} style={{ opacity: tool.detected ? 1 : 0.4 }}>
                <td style={{ padding: '6px 0', width: 160 }}>{tool.name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {!tool.detected
                    ? '(not detected)'
                    : tool.installed
                    ? '✓ Installed'
                    : 'Not installed'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={handleInstallIntegrations}
          disabled={installing}
          style={{ marginTop: 12 }}
        >
          {installing ? 'Installing…' : 'Install / Repair All'}
        </button>
      </section>
```

- [ ] **Step 4: Typecheck the renderer**

```bash
npm run typecheck 2>&1 | grep -i "settings\|error" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/screens/Settings.tsx
git commit -m "feat: add MCP server toggle and integrations panel to Settings screen"
```

---

## Task 16: "Fix with" buttons on submitted reviews

**Files:**
- Modify: `src/renderer/src/screens/PR.tsx`
- Modify: `src/renderer/src/store/index.ts`

- [ ] **Step 1: Read PR.tsx**

```bash
cat src/renderer/src/screens/PR.tsx
```

- [ ] **Step 2: Update store/index.ts — update prDetail type**

In `src/renderer/src/store/index.ts`, update the import and the `prDetail` field type.

Change the import from:
```typescript
import type { RepositoryWithMeta, DiscoveredRepo, PrDetail } from '../../../shared/types'
```

Keep it the same — `PrDetail` is still the import, but it now uses the new file-based types. The store itself doesn't change; just verify it still compiles (the `prDetail: PrDetail | null` field type is unchanged). No code changes needed here unless there are compile errors.

- [ ] **Step 3: Add "Fix with" buttons to PR.tsx**

Locate the section in `PR.tsx` that renders the "Submit Review" button or the review panel. Add the following logic.

At the top of the PR component (after existing state declarations), add:

```typescript
  const [fixLoading, setFixLoading] = React.useState<string | null>(null)
  const [integrations, setIntegrations] = React.useState<import('../../../../shared/types').IntegrationStatus[]>([])

  React.useEffect(() => {
    window.api.getIntegrations().then(setIntegrations)
  }, [])

  async function handleFix(tool: 'claude' | 'vscode') {
    if (!prDetail?.review || !prDetail.pr) return
    setFixLoading(tool)
    const result = await window.api.launchFix(tool, selectedRepo!.path, prDetail.pr.id, prDetail.review.id)
    if (result.error) console.error('Fix launch failed:', result.error)
    setFixLoading(null)
  }
```

Find the place in the JSX where the submit button is rendered (look for `submitAndExport` or `Submit Review`). After that section, add the "Fix with" buttons — only visible when the review is submitted:

```tsx
          {prDetail.review?.status === 'submitted' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {integrations.find((i) => i.id === 'claudeCode' && i.detected) && (
                <button
                  onClick={() => handleFix('claude')}
                  disabled={fixLoading !== null}
                  title="Open Claude Code to fix open issues"
                >
                  {fixLoading === 'claude' ? 'Launching…' : 'Fix with Claude'}
                </button>
              )}
              {integrations.find((i) => (i.id === 'vscode' || i.id === 'cursor' || i.id === 'windsurf') && i.detected) && (
                <button
                  onClick={() => handleFix('vscode')}
                  disabled={fixLoading !== null}
                  title="Open VS Code / Copilot to fix open issues (prompt copied to clipboard)"
                >
                  {fixLoading === 'vscode' ? 'Launching…' : 'Fix with Copilot'}
                </button>
              )}
            </div>
          )}
```

Also update the submit flow: replace calls to `window.api.submitAndExport` with the new two-step API:

Find the submit handler (look for `submitAndExport` in PR.tsx) and replace it:

```typescript
  async function handleSubmit() {
    if (!prDetail?.review || !selectedRepo || !prDetail.pr) return
    const result = await window.api.submitReview(selectedRepo.path, prDetail.pr.id, prDetail.review.id)
    if ('error' in result) {
      console.error('Submit failed:', result.error)
      return
    }
    // Update local state with submitted review
    store.setPrDetail({ ...prDetail, review: result })
  }

  async function handleDownloadMarkdown() {
    if (!prDetail?.review || !selectedRepo || !prDetail.pr) return
    await window.api.downloadMarkdown(selectedRepo.path, prDetail.pr.id, prDetail.review.id)
  }
```

Replace the submit button's `onClick` with `handleSubmit`.

If there was a "Download as JSON" button, remove it (the JSON file is `.reviews/…/reviews/{reviewId}.json`).
If there was a "Download as Markdown" button, update its `onClick` to `handleDownloadMarkdown`.

- [ ] **Step 4: Wire up review:updated push event**

In PR.tsx, add a `useEffect` to refresh PR detail when the main process pushes a `review:updated` event:

```typescript
  React.useEffect(() => {
    window.api.onReviewUpdated(async ({ repoPath, prId }) => {
      // Only refresh if the event matches the currently open PR
      if (!selectedRepo || !prDetail?.pr) return
      if (repoPath !== selectedRepo.path) return
      if (prId && prId !== prDetail.pr.id) return
      const fresh = await window.api.getPr(selectedRepo.path, prDetail.pr.id)
      if (fresh && !('error' in fresh)) store.setPrDetail(fresh)
    })
    return () => window.api.offReviewUpdated()
  }, [selectedRepo, prDetail?.pr?.id])
```

- [ ] **Step 5: Final typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Fix all remaining type errors.

- [ ] **Step 6: Run all tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/screens/PR.tsx src/renderer/src/store/index.ts
git commit -m "feat: add Fix with Claude/Copilot buttons, review:updated push refresh, submit via ReviewStore"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `.reviews/{pr-id}/index.json` + `reviews/{review-uuid}.json` — Tasks 2–5
- ✅ Auto-discovery on repo open — Tasks 8, 10 (prs:get calls ReviewStore)
- ✅ ReviewStore as shared module — Tasks 2–5
- ✅ MCP server (stdio, 6 tools, fix-review prompt) — Task 11
- ✅ MCP socket side-channel — Tasks 11–12
- ✅ MCP child process lifecycle — Task 13
- ✅ Tray with Open/Toggle/Quit — Task 13
- ✅ Window hides to tray when MCP running — Task 13
- ✅ Resolution comment required on mark_resolved/mark_wont_fix — Task 11 (tools.ts)
- ✅ resolved_by set by server identity — Task 11 (RESOLVED_BY env var)
- ✅ MCP auto-install into Claude/VS Code/Cursor/Windsurf — Task 14
- ✅ Idempotent install (upsert) — Task 14
- ✅ Cross-platform config paths — Task 14
- ✅ Settings: MCP toggle + integrations panel — Task 15
- ✅ "Fix with Claude" button — Task 16
- ✅ "Fix with Copilot" button (copies prompt, opens VS Code) — Task 16
- ✅ review:updated push from MCP → renderer refresh — Tasks 13, 16
- ✅ fs.watch fallback for external edits — Task 12–13
- ✅ Atomic writes (rename) — Task 3
- ✅ Drop old SQLite DB (preproduction reset) — Task 6
- ✅ Markdown export kept — Task 9

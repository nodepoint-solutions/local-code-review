# Repo Autodiscovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional repo autodiscovery to the Home screen — a configurable base directory is scanned recursively (depth 5) on launch, results are merged with manually-added repos, and the Home screen is reorganised into "My Repos" / "Recent" / "Discovered" sections with a search bar and first-launch onboarding card.

**Architecture:** Scanner lives in main process (`src/main/git/scanner.ts`), results are ephemeral Zustand state (not persisted). Settings (base dir, onboarding flag) are stored in a new `settings` SQLite table. A new `last_visited_at` column on `repositories` drives section ordering. The Home screen merges DB repos (with PR count) and scan results in the renderer.

**Tech Stack:** Electron, React, Zustand, better-sqlite3, TypeScript, Vitest, CSS Modules. All existing patterns.

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/main/db/schema.ts` | Add `settings` table; `runMigrations` for `last_visited_at` column |
| Modify | `src/main/db/index.ts` | Call `runMigrations` after `applySchema` |
| Create | `src/main/db/settings.ts` | `getSetting` / `setSetting` DB helpers |
| Modify | `src/main/db/repos.ts` | Add `listReposWithMeta`, `touchRepo` |
| Create | `src/main/git/scanner.ts` | Recursive filesystem scanner |
| Modify | `src/main/ipc/repos.ts` | New IPC handlers: scan, getSetting, setSetting, touch, add-by-path |
| Modify | `src/preload/index.ts` | Expose new IPC methods to renderer |
| Modify | `src/shared/types.ts` | Add `last_visited_at` to Repository; new `RepositoryWithMeta`, `DiscoveredRepo` |
| Modify | `src/renderer/src/store/index.ts` | Add scan state; update repos type |
| Modify | `src/renderer/src/screens/Home.tsx` | Full redesign: 3 sections + search + onboarding |
| Modify | `src/renderer/src/screens/Home.module.css` | New styles for search, sections, onboarding, discovered |
| Modify | `src/renderer/src/screens/Repo.tsx` | Call `touchRepo` on mount |
| Modify | `src/main/__tests__/db.test.ts` | Tests for settings, listReposWithMeta, touchRepo, migration |
| Create | `src/main/__tests__/scanner.test.ts` | Scanner unit tests |

---

## Task 1: Schema migration — settings table and last_visited_at column

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/index.ts`
- Modify: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests for migration**

Add to `src/main/__tests__/db.test.ts` (after the existing imports):

```typescript
import { runMigrations } from '../db/schema'
import { getSetting, setSetting } from '../db/settings'
```

Add a new `describe` block at the end of the file:

```typescript
describe('schema migration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
  })

  it('creates the settings table', () => {
    runMigrations(db)
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[]
    expect(tables.map((t) => t.name)).toContain('settings')
  })

  it('adds last_visited_at column to repositories', () => {
    runMigrations(db)
    const cols = db
      .prepare(`SELECT name FROM pragma_table_info('repositories')`)
      .all() as { name: string }[]
    expect(cols.map((c) => c.name)).toContain('last_visited_at')
  })

  it('runMigrations is idempotent', () => {
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/nodepoint/Development/nodepoint/local-code-review
npm run test:main -- --reporter=verbose 2>&1 | grep -A 3 'schema migration'
```

Expected: `runMigrations is not a function` or import error.

- [ ] **Step 3: Add `runMigrations` to schema.ts**

The full updated `src/main/db/schema.ts`:

```typescript
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

export function runMigrations(db: Database.Database): void {
  // settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // last_visited_at on repositories
  const hasCol = db
    .prepare(`SELECT COUNT(*) as count FROM pragma_table_info('repositories') WHERE name = 'last_visited_at'`)
    .get() as { count: number }
  if (hasCol.count === 0) {
    db.exec(`ALTER TABLE repositories ADD COLUMN last_visited_at TEXT;`)
  }
}
```

- [ ] **Step 4: Update `src/main/db/index.ts` to call runMigrations**

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { applySchema, runMigrations } from './schema'

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
  _db = new Database(dbPath, { nativeBinding: getNativeBinding() })
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  applySchema(_db)
  runMigrations(_db)
  return _db
}
```

- [ ] **Step 5: Run tests and verify pass**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -A 5 'schema migration'
```

Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/nodepoint/Development/nodepoint/local-code-review
git add src/main/db/schema.ts src/main/db/index.ts src/main/__tests__/db.test.ts
git commit -m "feat: add settings table and last_visited_at migration"
```

---

## Task 2: Settings DB module

**Files:**
- Create: `src/main/db/settings.ts`
- Modify: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the `describe('schema migration', ...)` block in `db.test.ts`, inside `beforeEach`, ensure `runMigrations` is called. Then add a new describe block after:

```typescript
describe('settings', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    runMigrations(db)
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

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -A 3 'settings'
```

Expected: import error or `getSetting is not a function`.

- [ ] **Step 3: Create `src/main/db/settings.ts`**

```typescript
import type Database from 'better-sqlite3'

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}
```

- [ ] **Step 4: Run tests and verify pass**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -A 5 'settings'
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/settings.ts src/main/__tests__/db.test.ts
git commit -m "feat: add settings DB module"
```

---

## Task 3: Update shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Update Repository, add RepositoryWithMeta and DiscoveredRepo**

Replace the `Repository` interface and add the two new types:

```typescript
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
```

The rest of `src/shared/types.ts` is unchanged.

- [ ] **Step 2: Run all tests to check for regressions**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass (the new nullable field is additive).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add RepositoryWithMeta and DiscoveredRepo types"
```

---

## Task 4: Repos DB update — listReposWithMeta and touchRepo

**Files:**
- Modify: `src/main/db/repos.ts`
- Modify: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Add import at the top of `db.test.ts`:

```typescript
import { insertRepo, listRepos, findRepoByPath, listReposWithMeta, touchRepo } from '../db/repos'
```

Add a new describe block at the end of `db.test.ts`:

```typescript
describe('repos with meta', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    applySchema(db)
    runMigrations(db)
  })

  it('listReposWithMeta returns pr_count 0 for repo with no PRs', () => {
    insertRepo(db, '/a', 'a')
    const results = listReposWithMeta(db)
    expect(results).toHaveLength(1)
    expect(results[0].pr_count).toBe(0)
    expect(results[0].last_visited_at).toBeNull()
  })

  it('listReposWithMeta returns correct pr_count', () => {
    const repo = insertRepo(db, '/a', 'a')
    insertPr(db, { repoId: repo.id, title: 'PR1', description: null, baseBranch: 'main', compareBranch: 'f', baseSha: 'x', compareSha: 'y' })
    insertPr(db, { repoId: repo.id, title: 'PR2', description: null, baseBranch: 'main', compareBranch: 'g', baseSha: 'x', compareSha: 'z' })
    const results = listReposWithMeta(db)
    expect(results[0].pr_count).toBe(2)
  })

  it('touchRepo sets last_visited_at', () => {
    const repo = insertRepo(db, '/a', 'a')
    expect(listReposWithMeta(db)[0].last_visited_at).toBeNull()
    touchRepo(db, repo.id)
    const updated = listReposWithMeta(db)[0]
    expect(updated.last_visited_at).not.toBeNull()
    expect(typeof updated.last_visited_at).toBe('string')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -A 3 'repos with meta'
```

Expected: import error or function not found.

- [ ] **Step 3: Update `src/main/db/repos.ts`**

```typescript
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type { Repository, RepositoryWithMeta } from '../../shared/types'

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
  return db.prepare('SELECT * FROM repositories ORDER BY created_at DESC').all() as Repository[]
}

export function listReposWithMeta(db: Database.Database): RepositoryWithMeta[] {
  return db.prepare(`
    SELECT r.*, COUNT(p.id) as pr_count
    FROM repositories r
    LEFT JOIN pull_requests p ON p.repo_id = r.id
    GROUP BY r.id
    ORDER BY r.last_visited_at DESC NULLS LAST, r.created_at DESC
  `).all() as RepositoryWithMeta[]
}

export function touchRepo(db: Database.Database, repoId: string): void {
  db.prepare('UPDATE repositories SET last_visited_at = ? WHERE id = ?')
    .run(new Date().toISOString(), repoId)
}
```

- [ ] **Step 4: Run tests and verify pass**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -E '(repos with meta|PASS|FAIL)'
```

Expected: all tests including "repos with meta" pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/repos.ts src/main/__tests__/db.test.ts
git commit -m "feat: add listReposWithMeta and touchRepo"
```

---

## Task 5: Scanner module

**Files:**
- Create: `src/main/git/scanner.ts`
- Create: `src/main/__tests__/scanner.test.ts`

- [ ] **Step 1: Write scanner tests**

Create `src/main/__tests__/scanner.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import path from 'path'
import { scanForRepos } from '../git/scanner'

const execFileAsync = promisify(execFile)

async function gitInit(dir: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: dir })
}

describe('scanForRepos', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'scanner-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('finds a repo one level deep', async () => {
    const repoDir = path.join(tmpDir, 'my-repo')
    await mkdir(repoDir)
    await gitInit(repoDir)

    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(repoDir)
    expect(results[0].name).toBe('my-repo')
  })

  it('finds multiple repos at the same level', async () => {
    const repoA = path.join(tmpDir, 'repo-a')
    const repoB = path.join(tmpDir, 'repo-b')
    await mkdir(repoA)
    await mkdir(repoB)
    await gitInit(repoA)
    await gitInit(repoB)

    const results = await scanForRepos(tmpDir)
    const paths = results.map((r) => r.path).sort()
    expect(paths).toEqual([repoA, repoB].sort())
  })

  it('does not recurse into repo subdirectories', async () => {
    const repoDir = path.join(tmpDir, 'my-repo')
    const srcDir = path.join(repoDir, 'src')
    await mkdir(repoDir)
    await mkdir(srcDir)
    await gitInit(repoDir)

    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(repoDir)
  })

  it('finds repos nested in non-repo directories', async () => {
    const groupDir = path.join(tmpDir, 'company')
    const repoDir = path.join(groupDir, 'project')
    await mkdir(groupDir)
    await mkdir(repoDir)
    await gitInit(repoDir)

    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(repoDir)
  })

  it('returns empty array when no repos found', async () => {
    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(0)
  })

  it('respects maxDepth', async () => {
    // repo is 3 dirs deep from tmpDir — reaches depth 4, which is > maxDepth 3
    const deep = path.join(tmpDir, 'a', 'b', 'c')
    await mkdir(deep, { recursive: true })
    await gitInit(deep)

    const shallow = await scanForRepos(tmpDir, 3)
    expect(shallow).toHaveLength(0)

    const deeper = await scanForRepos(tmpDir, 4)
    expect(deeper).toHaveLength(1)
  })

  it('returns empty array for non-existent base path', async () => {
    const results = await scanForRepos('/nonexistent/path/scanner-test-xyz')
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -A 3 'scanForRepos'
```

Expected: import error — `scanner.ts` does not exist yet.

- [ ] **Step 3: Create `src/main/git/scanner.ts`**

```typescript
import { promises as fs } from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { DiscoveredRepo } from '../../shared/types'

const execFileAsync = promisify(execFile)

async function isInsideWorkTree(dirPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dirPath,
    })
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

export async function scanForRepos(
  basePath: string,
  maxDepth = 5
): Promise<DiscoveredRepo[]> {
  const results: DiscoveredRepo[] = []

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return

    if (await isInsideWorkTree(dirPath)) {
      results.push({ path: dirPath, name: path.basename(dirPath) })
      return
    }

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    const subdirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(dirPath, e.name))

    await Promise.all(subdirs.map((sub) => walk(sub, depth + 1)))
  }

  await walk(basePath, 1)
  return results
}
```

- [ ] **Step 4: Run tests and verify pass**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -E '(scanForRepos|✓|✗|PASS|FAIL)'
```

Expected: all 7 scanner tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/git/scanner.ts src/main/__tests__/scanner.test.ts
git commit -m "feat: add recursive repo scanner"
```

---

## Task 6: IPC handlers

**Files:**
- Modify: `src/main/ipc/repos.ts`

- [ ] **Step 1: Replace `src/main/ipc/repos.ts` with updated version**

```typescript
import { ipcMain, dialog } from 'electron'
import path from 'path'
import type Database from 'better-sqlite3'
import { insertRepo, listReposWithMeta, touchRepo } from '../db/repos'
import { getSetting, setSetting } from '../db/settings'
import { isGitRepo } from '../git/branches'
import { scanForRepos } from '../git/scanner'

export function registerRepoHandlers(db: Database.Database): void {
  ipcMain.handle('repos:list', () => {
    try {
      return listReposWithMeta(db)
    } catch {
      return []
    }
  })

  ipcMain.handle('repos:open', async () => {
    try {
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
      touchRepo(db, repo.id)
      return { repo }
    } catch (err) {
      return { error: 'unexpected', message: (err as Error).message }
    }
  })

  ipcMain.handle('repos:add-by-path', async (_event, repoPath: string) => {
    try {
      const valid = await isGitRepo(repoPath)
      if (!valid) return { error: 'not-a-git-repo' }

      const name = path.basename(repoPath)
      const repo = insertRepo(db, repoPath, name)
      touchRepo(db, repo.id)
      return { repo }
    } catch (err) {
      return { error: 'unexpected', message: (err as Error).message }
    }
  })

  ipcMain.handle('repos:touch', (_event, repoId: string) => {
    try {
      touchRepo(db, repoId)
    } catch {
      // non-fatal
    }
  })

  ipcMain.handle('repos:get-setting', (_event, key: string) => {
    try {
      return getSetting(db, key)
    } catch {
      return null
    }
  })

  ipcMain.handle('repos:set-setting', (_event, key: string, value: string) => {
    try {
      setSetting(db, key, value)
    } catch {
      // non-fatal
    }
  })

  ipcMain.handle('repos:scan', async () => {
    try {
      const baseDir = getSetting(db, 'scan_base_dir')
      if (!baseDir) return []
      return await scanForRepos(baseDir)
    } catch {
      return []
    }
  })

  ipcMain.handle('repos:open-scan-dir-picker', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select your projects directory',
      })
      if (result.canceled || !result.filePaths[0]) return null
      return result.filePaths[0]
    } catch {
      return null
    }
  })
}
```

- [ ] **Step 2: Run all tests to check no regressions**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/repos.ts
git commit -m "feat: add scan, settings, touch, add-by-path IPC handlers"
```

---

## Task 7: Preload update

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Replace `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Repository, RepositoryWithMeta, DiscoveredRepo,
  PullRequest, Review, Comment,
  ParsedFile, PrDetail, CreatePrPayload, AddCommentPayload, ExportResult, Commit
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

export type Api = typeof api
```

- [ ] **Step 2: Run renderer tests to check no regressions**

```bash
npm run test:renderer 2>&1 | tail -10
```

Expected: all renderer tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose scan, settings, touch, addRepoByPath in preload"
```

---

## Task 8: Store update

**Files:**
- Modify: `src/renderer/src/store/index.ts`

- [ ] **Step 1: Replace `src/renderer/src/store/index.ts`**

```typescript
import { create } from 'zustand'
import type { RepositoryWithMeta, DiscoveredRepo, PrDetail } from '../../../shared/types'

type Theme = 'dark' | 'light'

interface AppState {
  theme: Theme
  setTheme: (theme: Theme) => void

  repos: RepositoryWithMeta[]
  setRepos: (repos: RepositoryWithMeta[]) => void

  selectedRepo: RepositoryWithMeta | null
  setSelectedRepo: (repo: RepositoryWithMeta | null) => void

  scanResults: DiscoveredRepo[]
  setScanResults: (results: DiscoveredRepo[]) => void

  scanInProgress: boolean
  setScanInProgress: (inProgress: boolean) => void

  prDetail: PrDetail | null
  setPrDetail: (detail: PrDetail | null) => void

  diffView: 'unified' | 'split'
  setDiffView: (view: 'unified' | 'split') => void

  reviewPanelOpen: boolean
  setReviewPanelOpen: (open: boolean) => void
}

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // ignore
  }
  return 'light'
}

export const useStore = create<AppState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
    set({ theme })
  },

  repos: [],
  setRepos: (repos) => set({ repos }),

  selectedRepo: null,
  setSelectedRepo: (repo) => set({ selectedRepo: repo }),

  scanResults: [],
  setScanResults: (results) => set({ scanResults: results }),

  scanInProgress: false,
  setScanInProgress: (inProgress) => set({ scanInProgress: inProgress }),

  prDetail: null,
  setPrDetail: (detail) => set({ prDetail: detail }),

  diffView: 'unified',
  setDiffView: (view) => set({ diffView: view }),

  reviewPanelOpen: false,
  setReviewPanelOpen: (open) => set({ reviewPanelOpen: open }),
}))
```

- [ ] **Step 2: Run renderer tests to check no regressions**

```bash
npm run test:renderer 2>&1 | tail -10
```

Expected: all pass. (Store tests use `Repository` in fixtures — the new type is a superset and compatible.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/index.ts
git commit -m "feat: add scan state to Zustand store"
```

---

## Task 9: Home screen redesign

**Files:**
- Modify: `src/renderer/src/screens/Home.tsx`
- Modify: `src/renderer/src/screens/Home.module.css`

- [ ] **Step 1: Replace `src/renderer/src/screens/Home.module.css`**

```css
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

.pageHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
}

.pageHeader button {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.heading {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.subheading {
  font-size: 13px;
  color: var(--text-muted);
}

/* ─── Search ──────────────────────────────── */
.searchBar {
  position: relative;
  margin-bottom: 24px;
}

.searchBar input {
  padding-left: 34px;
}

.searchIcon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-subtle);
  pointer-events: none;
  display: flex;
  align-items: center;
}

/* ─── Scan hint ───────────────────────────── */
.scanHint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 24px;
  font-size: 13px;
  color: var(--text-muted);
}

.scanHint button {
  white-space: nowrap;
  flex-shrink: 0;
}

/* ─── Onboarding Card ─────────────────────── */
.onboardingCard {
  padding: 24px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 24px;
}

.onboardingTitle {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.onboardingText {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 16px;
}

.onboardingActions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ─── Section ─────────────────────────────── */
.section {
  margin-bottom: 28px;
}

.sectionHeadingRow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.sectionHeading {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ─── Spinner ─────────────────────────────── */
.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── Repo List ───────────────────────────── */
.repoList {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.repoItem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-surface);
  border: none;
  border-radius: 0;
  text-align: left;
  width: 100%;
  color: var(--text);
  transition: background var(--transition);
  border-bottom: 1px solid var(--border-muted);
}

.repoItem:last-child {
  border-bottom: none;
}

.repoItem:hover {
  background: var(--bg-surface-2);
}

.repoItem:hover .repoName {
  color: var(--accent-hover);
}

.repoItem > svg:last-child {
  margin-left: auto;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.repoItemDiscovered {
  opacity: 0.7;
}

.repoItemDiscovered:hover {
  opacity: 1;
}

.repoItemMissing {
  opacity: 0.5;
}

.repoIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--accent-subtle);
  color: var(--accent-text);
  flex-shrink: 0;
}

.repoIconDiscovered {
  background: var(--bg-surface-3);
  color: var(--text-subtle);
}

.repoInfo {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.repoName {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repoPath {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repoBadge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--accent-subtle);
  color: var(--accent-text);
  flex-shrink: 0;
  margin-left: 8px;
}

/* ─── Missing path warning ────────────────── */
.missingBadge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--warning-bg);
  color: var(--warning-text);
  flex-shrink: 0;
  margin-left: 8px;
}

/* ─── Empty / No results ──────────────────── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 32px;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--bg-surface);
}

.emptyIcon {
  color: var(--text-subtle);
  margin-bottom: 16px;
}

.emptyTitle {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.emptyText {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 360px;
  margin-bottom: 24px;
  line-height: 1.6;
}

.empty button {
  display: flex;
  align-items: center;
  gap: 6px;
}

.noResults {
  padding: 48px 0;
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Replace `src/renderer/src/screens/Home.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import type { RepositoryWithMeta, DiscoveredRepo } from '../../../../shared/types'
import styles from './Home.module.css'

function FolderIcon(): JSX.Element {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function RepoIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function SearchIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function matches(item: { name: string; path: string }, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
}

export default function Home(): JSX.Element {
  const navigate = useNavigate()
  const {
    repos, setRepos, setSelectedRepo,
    scanResults, setScanResults,
    scanInProgress, setScanInProgress,
  } = useStore()

  const [searchQuery, setSearchQuery] = useState('')
  // default true to avoid flash of onboarding card on non-first-launch
  const [onboardingComplete, setOnboardingComplete] = useState(true)
  const [baseDirSet, setBaseDirSet] = useState(false)

  useEffect(() => {
    window.api.listRepos().then(setRepos)

    window.api.getSetting('onboarding_complete').then((val) => {
      setOnboardingComplete(val === 'true')
    })

    window.api.getSetting('scan_base_dir').then((baseDir) => {
      const hasDir = !!baseDir
      setBaseDirSet(hasDir)
      if (hasDir && !scanInProgress) {
        setScanInProgress(true)
        window.api.scanRepos().then((results) => {
          setScanResults(results)
          setScanInProgress(false)
        })
      }
    })
  }, [])

  // Derive sections
  const knownPaths = new Set(repos.map((r) => r.path))
  const q = searchQuery

  const myRepos = repos.filter((r) => r.pr_count > 0 && matches(r, q))
  const recentRepos = repos
    .filter((r) => r.pr_count === 0 && r.last_visited_at && matches(r, q))
    .slice(0, 5)
  const discoveredRepos = scanResults
    .filter((r) => !knownPaths.has(r.path) && matches(r, q))
    .sort((a, b) => a.name.localeCompare(b.name))

  const showOnboarding = !onboardingComplete && repos.length === 0 && !baseDirSet
  const showScanHint = !baseDirSet && repos.length > 0 && onboardingComplete
  const hasAnyContent = myRepos.length > 0 || recentRepos.length > 0 || discoveredRepos.length > 0

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

  async function handleConfigureScanDir(): Promise<void> {
    const result = await window.api.openScanDirPicker()
    if (!result) return
    await window.api.setSetting('scan_base_dir', result)
    await window.api.setSetting('onboarding_complete', 'true')
    setBaseDirSet(true)
    setOnboardingComplete(true)
    setScanInProgress(true)
    const results = await window.api.scanRepos()
    setScanResults(results)
    setScanInProgress(false)
    const updated = await window.api.listRepos()
    setRepos(updated)
  }

  async function dismissed(): Promise<void> {
    await window.api.setSetting('onboarding_complete', 'true')
    setOnboardingComplete(true)
  }

  async function handleDiscoveredRepo(discovered: DiscoveredRepo): Promise<void> {
    const result = await window.api.addRepoByPath(discovered.path)
    if (result.error === 'not-a-git-repo') {
      alert('This directory is no longer a valid git repository.')
      return
    }
    if (result.repo) {
      const updated = await window.api.listRepos()
      setRepos(updated)
      setSelectedRepo(updated.find((r) => r.id === result.repo!.id) ?? null)
      navigate(`/repo/${result.repo.id}`)
    }
  }

  function handleSelectRepo(repo: RepositoryWithMeta): void {
    setSelectedRepo(repo)
    navigate(`/repo/${repo.id}`)
  }

  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.heading}>Repositories</h1>
            <p className={styles.subheading}>Select a local git repository to start reviewing pull requests.</p>
          </div>
          <button onClick={handleOpenRepo}>
            <PlusIcon />
            Add repository
          </button>
        </div>

        {/* Onboarding card — first launch only */}
        {showOnboarding && (
          <div className={styles.onboardingCard}>
            <h2 className={styles.onboardingTitle}>Auto-discover your repositories</h2>
            <p className={styles.onboardingText}>
              Set a scan directory and we'll find your local git repos automatically.
              This is optional — you can always add repos manually instead.
            </p>
            <div className={styles.onboardingActions}>
              <button className="primary" onClick={handleConfigureScanDir}>
                Set scan directory
              </button>
              <button onClick={dismissed}>Skip, add manually</button>
            </div>
          </div>
        )}

        {/* Scan hint — for existing users with repos but no base dir */}
        {showScanHint && (
          <div className={styles.scanHint}>
            <span>Set a scan directory to auto-discover repos</span>
            <button onClick={handleConfigureScanDir}>Configure</button>
          </div>
        )}

        {/* Search bar — only show when there's something to search */}
        {(repos.length > 0 || scanResults.length > 0) && (
          <div className={styles.searchBar}>
            <span className={styles.searchIcon}><SearchIcon /></span>
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Empty state — no repos and no onboarding */}
        {!showOnboarding && repos.length === 0 && scanResults.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><FolderIcon /></div>
            <h3 className={styles.emptyTitle}>No repositories yet</h3>
            <p className={styles.emptyText}>
              Add a local git repository to start reviewing pull requests offline.
            </p>
            <button className="primary" onClick={handleOpenRepo}>
              <PlusIcon />
              Add repository
            </button>
          </div>
        )}

        {/* No search results */}
        {searchQuery && !hasAnyContent && (repos.length > 0 || scanResults.length > 0) && (
          <div className={styles.noResults}>No repositories match &ldquo;{searchQuery}&rdquo;</div>
        )}

        {/* My Repos section */}
        {myRepos.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeadingRow}>
              <span className={styles.sectionHeading}>My Repos</span>
            </div>
            <div className={styles.repoList}>
              {myRepos.map((repo) => (
                <button
                  key={repo.id}
                  className={styles.repoItem}
                  onClick={() => handleSelectRepo(repo)}
                >
                  <div className={styles.repoIcon}><RepoIcon /></div>
                  <div className={styles.repoInfo}>
                    <span className={styles.repoName}>{repo.name}</span>
                    <span className={styles.repoPath}>{repo.path}</span>
                  </div>
                  <span className={styles.repoBadge}>{repo.pr_count} PR{repo.pr_count !== 1 ? 's' : ''}</span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent section */}
        {recentRepos.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeadingRow}>
              <span className={styles.sectionHeading}>Recent</span>
            </div>
            <div className={styles.repoList}>
              {recentRepos.map((repo) => (
                <button
                  key={repo.id}
                  className={styles.repoItem}
                  onClick={() => handleSelectRepo(repo)}
                >
                  <div className={styles.repoIcon}><RepoIcon /></div>
                  <div className={styles.repoInfo}>
                    <span className={styles.repoName}>{repo.name}</span>
                    <span className={styles.repoPath}>{repo.path}</span>
                  </div>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Discovered section */}
        {(discoveredRepos.length > 0 || scanInProgress) && (
          <div className={styles.section}>
            <div className={styles.sectionHeadingRow}>
              <span className={styles.sectionHeading}>Discovered</span>
              {scanInProgress && <span className={styles.spinner} />}
            </div>
            {discoveredRepos.length > 0 && (
              <div className={styles.repoList}>
                {discoveredRepos.map((repo) => (
                  <button
                    key={repo.path}
                    className={`${styles.repoItem} ${styles.repoItemDiscovered}`}
                    onClick={() => handleDiscoveredRepo(repo)}
                  >
                    <div className={`${styles.repoIcon} ${styles.repoIconDiscovered}`}><RepoIcon /></div>
                    <div className={styles.repoInfo}>
                      <span className={styles.repoName}>{repo.name}</span>
                      <span className={styles.repoPath}>{repo.path}</span>
                    </div>
                    <ChevronRightIcon />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run renderer tests**

```bash
npm run test:renderer 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/Home.tsx src/renderer/src/screens/Home.module.css
git commit -m "feat: redesign Home screen with three-section layout, search, and onboarding"
```

---

## Task 10: Touch repo on navigation

**Files:**
- Modify: `src/renderer/src/screens/Repo.tsx`

- [ ] **Step 1: Update Repo.tsx to call touchRepo on mount**

In `src/renderer/src/screens/Repo.tsx`, update the `useEffect` that fires when `repo?.id` changes:

```typescript
  useEffect(() => {
    if (repo) {
      setSelectedRepo(repo)
      window.api.touchRepo(repo.id)
      window.api.listPrs(repo.id).then(setPrs)
    }
  }, [repo?.id])
```

- [ ] **Step 2: Update the Repo type annotation**

The `repos.find(...)` return type will now be `RepositoryWithMeta | undefined`. The `setSelectedRepo` signature already accepts `RepositoryWithMeta | null`. The `repo` variable usage in JSX (`.name`, `.id`) is unchanged since `RepositoryWithMeta` extends `Repository`.

Verify no TypeScript errors:

```bash
cd /Users/nodepoint/Development/nodepoint/local-code-review
npm run build 2>&1 | grep -E '(error|Error)' | head -20
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/Repo.tsx
git commit -m "feat: update last_visited_at when navigating to a repo"
```

---

## Completion Checklist

After all tasks, verify end-to-end in the running app:

- [ ] Launch app → onboarding card appears (first launch, no DB)
- [ ] Click "Skip" → card disappears, never reappears on restart
- [ ] Click "Set scan directory" → native picker → scan runs → Discovered section populates
- [ ] Click a discovered repo → becomes a Recent repo → navigates to repo view
- [ ] Create a PR in any repo → repo moves to My Repos section on next Home visit
- [ ] Search filters all three sections simultaneously
- [ ] Repos with no scan dir configured → only My Repos / Recent shown
- [ ] Manual "Add repository" still works
- [ ] Restart app → scan re-runs, Discovered section repopulates

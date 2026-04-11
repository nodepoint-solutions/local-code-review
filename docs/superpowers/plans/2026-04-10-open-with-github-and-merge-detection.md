# Transfer PR to GitHub + Merge Auto-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Transfer PR to GitHub" button to the PR screen Actions sidebar with a 4-step safety gate, and auto-close PRs silently when the compare branch has been merged into the remote base on `prs:get`.

**Architecture:** New git utility functions (pure functions wrapping `execGit`) live in `branches.ts`. Four new IPC handlers + merge detection patch go in `prs.ts`. The renderer calls new preload API methods sequentially in `handleOpenWithGitHub`. The `PRFileSchema` gains a `merged_at` field and `ReviewStore` gains a `mergePR` method. Timeline renders a purple "Merged" entry when `merged_at` is set.

**Tech Stack:** Electron/IPC, TypeScript, React, Zod schema, Vitest, CSS Modules

---

### Task 1: Add `merged_at` to PRFileSchema

**Files:**
- Modify: `src/shared/review-store/schema.ts`

- [ ] **Step 1: Add the field to `PRFileSchema`**

In `src/shared/review-store/schema.ts`, change:

```ts
export const PRFileSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  base_branch: z.string(),
  compare_branch: z.string(),
  status: z.enum(['open', 'closed']),
  assignee: z.enum(['claude', 'vscode']).nullable().optional().default(null),
  assigned_at: z.string().nullable().optional().default(null),
  created_at: z.string(),
  updated_at: z.string(),
})
```

to:

```ts
export const PRFileSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  base_branch: z.string(),
  compare_branch: z.string(),
  status: z.enum(['open', 'closed']),
  assignee: z.enum(['claude', 'vscode']).nullable().optional().default(null),
  assigned_at: z.string().nullable().optional().default(null),
  merged_at: z.string().nullable().optional().default(null),
  created_at: z.string(),
  updated_at: z.string(),
})
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/review-store/schema.ts
git commit -m "feat: add merged_at field to PRFileSchema"
```

---

### Task 2: Add `mergePR` to ReviewStore

**Files:**
- Modify: `src/shared/review-store/index.ts`
- Modify: `src/main/__tests__/review-store.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/main/__tests__/review-store.test.ts`, inside the `describe('PRs', ...)` block (after the last `it(...)`), add:

```ts
it('mergePR sets status to closed and records merged_at', () => {
  const pr = store.createPR(repoPath, {
    title: 'T',
    description: null,
    base_branch: 'main',
    compare_branch: 'feature/x',
  })
  const merged = store.mergePR(repoPath, pr.id)
  expect(merged.status).toBe('closed')
  expect(typeof merged.merged_at).toBe('string')
  expect(merged.merged_at).toBeTruthy()
  // persisted to disk
  const fetched = store.getPR(repoPath, pr.id)
  expect(fetched.status).toBe('closed')
  expect(fetched.merged_at).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/main/__tests__/review-store.test.ts
```

Expected: FAIL — `store.mergePR is not a function`

- [ ] **Step 3: Implement `mergePR` in ReviewStore**

In `src/shared/review-store/index.ts`, add this method inside `ReviewStore` after `updatePRStatus`:

```ts
mergePR(repoPath: string, prId: string): PRFile {
  const pr = readPR(repoPath, prId)
  const now = new Date().toISOString()
  const updated_at = now > pr.updated_at
    ? now
    : new Date(new Date(pr.updated_at).getTime() + 1).toISOString()
  const updated: PRFile = { ...pr, status: 'closed', merged_at: now, updated_at }
  writePR(repoPath, updated)
  return updated
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/main/__tests__/review-store.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/review-store/index.ts src/main/__tests__/review-store.test.ts
git commit -m "feat: add mergePR method to ReviewStore"
```

---

### Task 3: Git utility functions

**Files:**
- Modify: `src/main/git/branches.ts`
- Create: `src/main/__tests__/branches.test.ts`

- [ ] **Step 1: Write the failing test for `parseGithubRemote`**

Create `src/main/__tests__/branches.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseGithubRemote } from '../../main/git/branches'

describe('parseGithubRemote', () => {
  it('parses SSH URL', () => {
    expect(parseGithubRemote('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS URL with .git suffix', () => {
    expect(parseGithubRemote('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS URL without .git suffix', () => {
    expect(parseGithubRemote('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('returns null for a non-GitHub remote', () => {
    expect(parseGithubRemote('https://gitlab.com/owner/repo.git')).toBeNull()
  })

  it('returns null for an arbitrary string', () => {
    expect(parseGithubRemote('not-a-url')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/main/__tests__/branches.test.ts
```

Expected: FAIL — `parseGithubRemote is not exported`

- [ ] **Step 3: Add all six utility functions to `branches.ts`**

Append to `src/main/git/branches.ts` (after the existing exports):

```ts
export async function getRemoteOriginUrl(repoPath: string): Promise<string | null> {
  try {
    const output = await execGit(repoPath, ['remote', 'get-url', 'origin'])
    return output.trim() || null
  } catch {
    return null
  }
}

export function parseGithubRemote(url: string): { owner: string; repo: string } | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }
  // HTTPS: https://github.com/owner/repo[.git]
  const httpsMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
}

export async function isWorkingDirClean(repoPath: string): Promise<boolean> {
  const output = await execGit(repoPath, ['status', '--porcelain'])
  return output.trim() === ''
}

export async function isBranchPushed(repoPath: string, branch: string): Promise<boolean> {
  const output = await execGit(repoPath, ['ls-remote', '--heads', 'origin', branch])
  return output.trim() !== ''
}

export async function pushBranch(repoPath: string, branch: string): Promise<void> {
  await execGit(repoPath, ['push', 'origin', branch])
}

export async function fetchOrigin(repoPath: string): Promise<void> {
  try {
    await execGit(repoPath, ['fetch', 'origin'])
  } catch {
    // non-fatal — no network, no remote, etc.
  }
}

export async function isMergedIntoRemote(
  repoPath: string,
  compareSha: string,
  baseBranch: string,
): Promise<boolean> {
  try {
    await execGit(repoPath, ['merge-base', '--is-ancestor', compareSha, `origin/${baseBranch}`])
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/main/__tests__/branches.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/git/branches.ts src/main/__tests__/branches.test.ts
git commit -m "feat: add git utility functions for remote info, push, and merge detection"
```

---

### Task 4: IPC handlers + merge detection in `prs:get`

**Files:**
- Modify: `src/main/ipc/prs.ts`

- [ ] **Step 1: Add imports at the top of `prs.ts`**

Change the existing import from `branches.ts`:

```ts
import { listBranches, resolveSha } from '../git/branches'
```

to:

```ts
import {
  listBranches, resolveSha,
  getRemoteOriginUrl, parseGithubRemote,
  isWorkingDirClean, isBranchPushed, pushBranch,
  fetchOrigin, isMergedIntoRemote,
} from '../git/branches'
```

- [ ] **Step 2: Add merge detection to `prs:get`**

In `src/main/ipc/prs.ts`, inside the `prs:get` handler, after these two lines:

```ts
const currentBaseSha = await resolveSha(repoPath, pr.base_branch)
const currentCompareSha = await resolveSha(repoPath, pr.compare_branch)
```

add:

```ts
// Auto-close if compare branch has been merged into the remote base
if (pr.status === 'open') {
  await fetchOrigin(repoPath)
  const merged = await isMergedIntoRemote(repoPath, currentCompareSha, pr.base_branch)
  if (merged) {
    pr = store.mergePR(repoPath, pr.id)
  }
}
```

- [ ] **Step 3: Add the four new IPC handlers**

At the end of `registerPrHandlers`, before the closing `}`, add:

```ts
ipcMain.handle('git:remote-info', async (_e, repoPath: string) => {
  try {
    const url = await getRemoteOriginUrl(repoPath)
    if (!url) return null
    return parseGithubRemote(url)
  } catch {
    return null
  }
})

ipcMain.handle('git:working-dir-clean', async (_e, repoPath: string) => {
  try {
    return { clean: await isWorkingDirClean(repoPath) }
  } catch {
    return { clean: false }
  }
})

ipcMain.handle('git:branch-pushed', async (_e, repoPath: string, branch: string) => {
  try {
    return { pushed: await isBranchPushed(repoPath, branch) }
  } catch {
    return { pushed: false }
  }
})

ipcMain.handle('git:push-branch', async (_e, repoPath: string, branch: string) => {
  try {
    await pushBranch(repoPath, branch)
    return {}
  } catch (err) {
    return { error: (err as Error).message }
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/prs.ts
git commit -m "feat: add git IPC handlers and merge detection in prs:get"
```

---

### Task 5: Preload API additions

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add four new API methods**

In `src/preload/index.ts`, add these four entries to the `api` object (after `assignPr`):

```ts
getRemoteInfo: (repoPath: string): Promise<{ owner: string; repo: string } | null> =>
  ipcRenderer.invoke('git:remote-info', repoPath),
isWorkingDirClean: (repoPath: string): Promise<{ clean: boolean }> =>
  ipcRenderer.invoke('git:working-dir-clean', repoPath),
isBranchPushed: (repoPath: string, branch: string): Promise<{ pushed: boolean }> =>
  ipcRenderer.invoke('git:branch-pushed', repoPath, branch),
pushBranch: (repoPath: string, branch: string): Promise<{ error?: string }> =>
  ipcRenderer.invoke('git:push-branch', repoPath, branch),
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose getRemoteInfo, isWorkingDirClean, isBranchPushed, pushBranch in preload"
```

---

### Task 6: Timeline merged entry

**Files:**
- Modify: `src/renderer/src/components/ReviewTimeline.tsx`
- Modify: `src/renderer/src/components/ReviewTimeline.module.css`

- [ ] **Step 1: Add `dotMerged` CSS class**

In `src/renderer/src/components/ReviewTimeline.module.css`, append after `.dotComplete`:

```css
.dotMerged {
  border-color: #8250df;
  background: #8250df;
}
```

- [ ] **Step 2: Add the merged entry to `ReviewTimeline`**

In `src/renderer/src/components/ReviewTimeline.tsx`, the component currently ends with closing `</div>` for the timeline. Replace the return statement so it renders a merged entry when `pr.merged_at` is set.

Change the `return` to:

```tsx
return (
  <div className={styles.timeline}>
    {/* PR opened */}
    <div className={styles.entry}>
      <div className={styles.rail}>
        <div className={styles.dot} />
      </div>
      <div className={styles.content}>
        <div className={styles.entryHeader}>
          <span className={styles.entryTitle}>Opened this PR</span>
          <span className={styles.entryTime}>{formatAbsoluteDate(pr.created_at)}</span>
        </div>
      </div>
    </div>

    {reviews.map((review) => {
      const visibleComments = review.comments.filter((c) => !c.is_stale)

      if (review.status === 'in_progress') {
        return (
          <div key={review.id} className={styles.entry}>
            <div className={styles.rail}>
              <div className={styles.dot} />
            </div>
            <div className={styles.content}>
              <div className={styles.entryHeader}>
                <span className={styles.entryTitle}>Review in progress</span>
              </div>
            </div>
          </div>
        )
      }

      const submittedEntry = (
        <div key={`${review.id}-submitted`} className={styles.entry}>
          <div className={styles.rail}>
            <div className={`${styles.dot} ${styles.dotActive}`} />
          </div>
          <div className={styles.content}>
            <div className={styles.entryHeader}>
              <span className={styles.entryTitle}>Review submitted</span>
              {review.submitted_at && (
                <span className={styles.entryTime}>{formatRelativeTime(review.submitted_at)}</span>
              )}
            </div>
            {visibleComments.length > 0 && (
              <div className={styles.commentList}>
                {visibleComments.map((comment) => (
                  <CommentThread key={comment.id} comment={comment} />
                ))}
              </div>
            )}
          </div>
        </div>
      )

      if (review.status === 'submitted') {
        return submittedEntry
      }

      const commitCount = reviewCommitCounts[review.id] ?? 0
      const commitLabel = `${commitCount} ${commitCount === 1 ? 'commit' : 'commits'} created`

      return (
        <div key={review.id}>
          {submittedEntry}
          <div className={styles.entry}>
            <div className={styles.rail}>
              <div className={`${styles.dot} ${styles.dotComplete}`} />
            </div>
            <div className={styles.content}>
              <div className={styles.entryHeader}>
                <span className={styles.entryTitle}>Review feedback implemented</span>
              </div>
              <div className={styles.commitCount}>{commitLabel}</div>
            </div>
          </div>
        </div>
      )
    })}

    {pr.merged_at && (
      <div className={styles.entry}>
        <div className={styles.rail}>
          <div className={`${styles.dot} ${styles.dotMerged}`} />
        </div>
        <div className={styles.content}>
          <div className={styles.entryHeader}>
            <span className={styles.entryTitle}>
              Merged into <code>{pr.base_branch}</code>
            </span>
            <span className={styles.entryTime}>{formatRelativeTime(pr.merged_at)}</span>
          </div>
        </div>
      </div>
    )}
  </div>
)
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ReviewTimeline.tsx src/renderer/src/components/ReviewTimeline.module.css
git commit -m "feat: add merged timeline entry to ReviewTimeline"
```

---

### Task 7: PR screen — remote info, button, and flow

**Files:**
- Modify: `src/renderer/src/screens/PR.tsx`

- [ ] **Step 1: Add `githubInfo` state and load it on mount**

In `PR.tsx`, after this existing state line:

```ts
const [notification, setNotification] = useState<string | null>(null)
```

add:

```ts
const [githubInfo, setGithubInfo] = useState<{ owner: string; repo: string } | null>(null)
```

Then, find the existing `React.useEffect` that loads integrations:

```ts
React.useEffect(() => {
  window.api.getIntegrations().then(setIntegrations)
}, [])
```

Replace it with (loading both in parallel):

```ts
React.useEffect(() => {
  window.api.getIntegrations().then(setIntegrations)
  if (repo) window.api.getRemoteInfo(repo.path).then(setGithubInfo)
}, [])
```

- [ ] **Step 2: Add `handleOpenWithGitHub` function**

In `PR.tsx`, after `handleRefresh` (around line 260), add:

```ts
async function handleOpenWithGitHub(): Promise<void> {
  if (!repo || !prDetail || !githubInfo) return
  const { pr: currentPr, review: currentReview } = prDetail

  // Step 1: warn if active review with unresolved comments
  const hasBlockingReview =
    currentReview !== null &&
    (currentReview.status === 'in_progress' ||
      (currentReview.status === 'submitted' &&
        currentReview.comments.some((c) => !c.is_stale && c.status === 'open')))
  if (hasBlockingReview) {
    const proceed = window.confirm(
      'This PR has an active review with unresolved comments.\n\nProceed anyway and open GitHub, or cancel to resolve them first?'
    )
    if (!proceed) return
  }

  // Step 2: working directory must be clean
  const { clean } = await window.api.isWorkingDirClean(repo.path)
  if (!clean) {
    showNotification('Working directory has uncommitted changes. Commit or stash them first.')
    return
  }

  // Step 3: branch must be pushed
  const { pushed } = await window.api.isBranchPushed(repo.path, currentPr.compare_branch)
  if (!pushed) {
    const doPush = window.confirm("Branch hasn't been pushed to remote. Push it now?")
    if (!doPush) {
      showNotification('Push your branch first, then try again.')
      return
    }
    const pushResult = await window.api.pushBranch(repo.path, currentPr.compare_branch)
    if (pushResult.error) {
      showNotification(`Push failed: ${pushResult.error}. Fix it manually and try again.`)
      return
    }
  }

  // Step 4: open GitHub compare URL
  const encodedTitle = encodeURIComponent(currentPr.title)
  const bodyParam = currentPr.description
    ? `&body=${encodeURIComponent(currentPr.description)}`
    : ''
  const url = `https://github.com/${githubInfo.owner}/${githubInfo.repo}/compare/${currentPr.base_branch}...${currentPr.compare_branch}?expand=1&title=${encodedTitle}${bodyParam}`
  window.open(url, '_blank')
}
```

- [ ] **Step 3: Add the button to the Actions section**

In `PR.tsx`, find the Actions sidebar section:

```tsx
<div className={styles.sidebarSection}>
  <div className={styles.sidebarLabel}>Actions</div>
  <div className={styles.sidebarActions}>
    {pr.status === 'open' ? (
      <button className={styles.sidebarActionBtn} onClick={handleClosePr}>Close PR</button>
    ) : (
      <button className={styles.sidebarActionBtn} onClick={handleReopenPr}>Reopen PR</button>
    )}
    <button className={`${styles.sidebarActionBtn} ${styles.sidebarActionDanger}`} onClick={handleDeletePr}>Delete PR</button>
  </div>
</div>
```

Replace with:

```tsx
<div className={styles.sidebarSection}>
  <div className={styles.sidebarLabel}>Actions</div>
  <div className={styles.sidebarActions}>
    {githubInfo !== null && pr.status === 'open' && (
      <button className={styles.sidebarActionBtn} onClick={handleOpenWithGitHub}>
        Transfer PR to GitHub
      </button>
    )}
    {pr.status === 'open' ? (
      <button className={styles.sidebarActionBtn} onClick={handleClosePr}>Close PR</button>
    ) : (
      <button className={styles.sidebarActionBtn} onClick={handleReopenPr}>Reopen PR</button>
    )}
    <button className={`${styles.sidebarActionBtn} ${styles.sidebarActionDanger}`} onClick={handleDeletePr}>Delete PR</button>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/PR.tsx
git commit -m "feat: add Transfer PR to GitHub button with 4-step safety gate"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] "Transfer PR to GitHub" button — Task 7 step 3
- [x] Only shown when remote origin is GitHub — Task 7 step 1 (`githubInfo !== null`)
- [x] Only shown when PR is open — Task 7 step 3 (`pr.status === 'open'`)
- [x] Step 1: warn if in-progress or submitted with unresolved comments — Task 7 step 2
- [x] Step 2: abort if working dir dirty — Task 7 step 2
- [x] Step 3: push confirmation and execution — Task 7 step 2
- [x] Step 4: open GitHub URL — Task 7 step 2
- [x] GitHub URL format with encoded title/body — Task 7 step 2
- [x] SSH + HTTPS remote URL parsing — Task 3 step 3
- [x] `merged_at` schema field — Task 1
- [x] `store.mergePR` — Task 2
- [x] Merge detection in `prs:get` with `git fetch` then `merge-base --is-ancestor` against `origin/{base}` — Task 4 step 2
- [x] Timeline "Merged into {base_branch}" entry — Task 6
- [x] No review files deleted on merge-close — `mergePR` only calls `writePR`, never touches reviews

**Type consistency:**
- `store.mergePR` defined in Task 2, called in Task 4 — signature matches
- `parseGithubRemote` defined in Task 3, called in Task 4 — returns `{ owner, repo } | null`
- `githubInfo` type `{ owner: string; repo: string } | null` — matches what `getRemoteInfo` returns via IPC
- `window.api.isWorkingDirClean` / `isBranchPushed` / `pushBranch` defined in Task 5, called in Task 7 — signatures match

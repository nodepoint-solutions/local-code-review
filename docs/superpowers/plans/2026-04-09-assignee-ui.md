# Assignee UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Fix with" buttons with a GitHub-style assignee widget in the PR sidebar that persists assignment on the PR, launches Claude/VS Code interactively, and lets the agent self-unassign via MCP when done.

**Architecture:** Assignment state lives in `PRFile.assignee` in `index.json`. The UI renders an assignee section in the overview sidebar (only when review is submitted). On assign, the UI writes to disk via IPC then fires a terminal/editor launch. The MCP `complete_assignment` tool writes `assignee: null` to disk and emits a socket event; the main process forwards it to the renderer as `pr:updated`.

**Tech Stack:** Electron, React, TypeScript, Zod v4, MCP SDK, osascript (macOS), better-sqlite3 (not used here)

---

## File Map

| File | Change |
|------|--------|
| `src/shared/review-store/schema.ts` | Add `assignee`, `assigned_at` to `PRFileSchema` |
| `src/shared/review-store/index.ts` | Add `assignPR()` method |
| `src/main/ipc/prs.ts` | Add `prs:assign` IPC handler |
| `src/mcp-server/socket-client.ts` | Add `PrUpdatedEvent`, union `SocketEvent` type |
| `src/mcp-server/tools.ts` | Add `complete_assignment` tool |
| `src/mcp-server/index.ts` | Update `fix-review` prompt with self-unassign instruction |
| `src/main/mcp-manager.ts` | Update `McpEvent`, route events by type |
| `src/main/index.ts` | Update `fix:launch` (interactive), wire `prs:assign`, send `pr:updated` |
| `src/preload/index.ts` | Expose `assignPr`, `onPrUpdated`, `offPrUpdated` |
| `src/renderer/src/screens/PR.tsx` | Replace fix buttons with assignee widget |
| `src/renderer/src/screens/PR.module.css` | Add assignee widget styles |
| `src/main/__tests__/review-store.test.ts` | Add `assignPR` tests |

---

## Task 1: Schema — add assignee fields to PRFile

**Files:**
- Modify: `src/shared/review-store/schema.ts`
- Test: `src/main/__tests__/review-store.test.ts`

- [ ] **Step 1: Write failing test**

Open `src/main/__tests__/review-store.test.ts`. Inside the `describe('PRs', ...)` block, after the existing tests, add:

```ts
it('createPR sets assignee to null by default', () => {
  const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
  expect(pr.assignee).toBeNull()
  expect(pr.assigned_at).toBeNull()
})

it('assignPR sets and clears assignee', () => {
  const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
  const assigned = store.assignPR(repoPath, pr.id, 'claude')
  expect(assigned.assignee).toBe('claude')
  expect(assigned.assigned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

  const cleared = store.assignPR(repoPath, pr.id, null)
  expect(cleared.assignee).toBeNull()
  expect(cleared.assigned_at).toBeNull()
})

it('existing index.json without assignee fields parses correctly', () => {
  const pr = store.createPR(repoPath, { title: 'T', description: null, base_branch: 'main', compare_branch: 'f' })
  // Write a file without the new fields (simulating a pre-migration file)
  const indexPath = path.join(repoPath, '.reviews', pr.id, 'index.json')
  const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  delete raw.assignee
  delete raw.assigned_at
  fs.writeFileSync(indexPath, JSON.stringify(raw))
  const fetched = store.getPR(repoPath, pr.id)
  expect(fetched.assignee).toBeNull()
  expect(fetched.assigned_at).toBeNull()
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd local-code-review && npm run test:main -- --reporter=verbose 2>&1 | grep -A 3 "assignee"
```

Expected: tests fail with `assignee is not a function` or similar.

- [ ] **Step 3: Update PRFileSchema**

In `src/shared/review-store/schema.ts`, update `PRFileSchema`:

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

Update `PRFile` type (it's inferred, no manual update needed).

- [ ] **Step 4: Run tests — expect still failing** (assignPR not yet implemented)

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|assignee"
```

The schema tests should pass, `assignPR` tests still fail.

- [ ] **Step 5: Commit schema change**

```bash
git add src/shared/review-store/schema.ts src/main/__tests__/review-store.test.ts
git commit -m "feat: add assignee fields to PRFileSchema"
```

---

## Task 2: ReviewStore — add assignPR method

**Files:**
- Modify: `src/shared/review-store/index.ts`

- [ ] **Step 1: Add `assignPR` to ReviewStore**

In `src/shared/review-store/index.ts`, add this method to the `ReviewStore` class after `updatePRStatus`:

```ts
assignPR(repoPath: string, prId: string, assignee: 'claude' | 'vscode' | null): PRFile {
  const pr = readPR(repoPath, prId)
  const updated: PRFile = {
    ...pr,
    assignee: assignee ?? null,
    assigned_at: assignee ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  writePR(repoPath, updated)
  return updated
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test:main -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|assignee"
```

Expected: all three new tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/shared/review-store/index.ts
git commit -m "feat: add ReviewStore.assignPR method"
```

---

## Task 3: IPC — prs:assign handler

**Files:**
- Modify: `src/main/ipc/prs.ts`

- [ ] **Step 1: Add handler inside `registerPrHandlers`**

In `src/main/ipc/prs.ts`, add at the end of the `registerPrHandlers` function body (before the closing `}`):

```ts
ipcMain.handle('prs:assign', (_e, repoPath: string, prId: string, assignee: 'claude' | 'vscode' | null) => {
  try {
    return store.assignPR(repoPath, prId, assignee)
  } catch (err) {
    return { error: (err as Error).message }
  }
})
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/prs.ts
git commit -m "feat: add prs:assign IPC handler"
```

---

## Task 4: Socket — add PrUpdatedEvent type

**Files:**
- Modify: `src/mcp-server/socket-client.ts`
- Modify: `src/main/mcp-manager.ts`

- [ ] **Step 1: Update socket-client.ts**

Replace the contents of `src/mcp-server/socket-client.ts` with:

```ts
// src/mcp-server/socket-client.ts
import net from 'net'

export interface ReviewUpdatedEvent {
  event: 'review:updated'
  repoPath: string
  prId: string
  reviewId: string
}

export interface PrUpdatedEvent {
  event: 'pr:updated'
  repoPath: string
  prId: string
}

export type SocketEvent = ReviewUpdatedEvent | PrUpdatedEvent

export class SocketClient {
  private client: net.Socket | null = null

  connect(socketPath: string): void {
    this.client = net.createConnection(socketPath)
    this.client.on('error', () => {
      // Silently ignore — Electron may not be listening (e.g. unit test context)
    })
  }

  emit(event: SocketEvent): void {
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

- [ ] **Step 2: Update McpEvent and routing in mcp-manager.ts**

In `src/main/mcp-manager.ts`, update the `McpEvent` interface and `onEvent` callback type. Replace the current `McpEvent` interface:

```ts
export interface McpEvent {
  event: string
  repoPath: string
  prId: string
  reviewId?: string
}
```

(Add `reviewId` as optional — the new `pr:updated` event won't include it.)

The `onEvent` callback signature doesn't need to change since `McpEvent` is already generic. No further changes needed here — the routing happens in `index.ts` (Task 6).

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/mcp-server/socket-client.ts src/main/mcp-manager.ts
git commit -m "feat: add PrUpdatedEvent socket type"
```

---

## Task 5: MCP tools — add complete_assignment + update prompt

**Files:**
- Modify: `src/mcp-server/tools.ts`
- Modify: `src/mcp-server/index.ts`

- [ ] **Step 1: Add complete_assignment to buildTools()**

In `src/mcp-server/tools.ts`, add to the array returned by `buildTools()`:

```ts
{
  name: 'complete_assignment',
  description: 'Call this when you have finished addressing all open review issues. Unassigns you from the PR so the reviewer knows the work is done.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      repo_path: { type: 'string', description: 'Absolute path to the repository' },
      pr_id: { type: 'string', description: 'UUID of the PR' },
    },
    required: ['repo_path', 'pr_id'],
  },
},
```

- [ ] **Step 2: Add complete_assignment case to callTool()**

In `src/mcp-server/tools.ts`, add inside the `switch (name)` statement (before `default:`):

```ts
case 'complete_assignment': {
  store.assignPR(args.repo_path, args.pr_id, null)
  socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: args.pr_id })
  return ok({ success: true, message: 'Assignment cleared. You have been unassigned from this PR.' })
}
```

- [ ] **Step 3: Update fix-review prompt in mcp-server/index.ts**

In `src/mcp-server/index.ts`, replace the prompt text inside `GetPromptRequestSchema` handler:

```ts
text: `You are implementing fixes from a local code review.

Use get_open_issues() to find open issues in this repository. For each open issue:
1. Read the context and understand what needs to change
2. Implement the fix in the codebase
3. Call mark_resolved() or mark_wont_fix() with a clear explanation of what you did or why you skipped it

Rules:
- Never mark an issue without a resolution_comment
- Work through all open issues before finishing
- If an issue is already fixed by the time you get to it, mark_resolved() and explain what you observed
- When all issues are addressed, call complete_assignment() to unassign yourself and signal that you are done`,
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server/tools.ts src/mcp-server/index.ts
git commit -m "feat: add complete_assignment MCP tool and update fix-review prompt"
```

---

## Task 6: Main process — interactive launch + event routing

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update the `fix:launch` handler**

In `src/main/index.ts`, replace the entire `ipcMain.handle('fix:launch', ...)` block (lines ~155–179) with:

```ts
// "Fix with" launcher — interactive, fire and forget
ipcMain.handle('fix:launch', (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
  const prompt = `Fix the open review comments in .reviews/${prId}/reviews/${reviewId}.json. When you are done, call the complete_assignment MCP tool to unassign yourself from this PR.`

  if (tool === 'claude') {
    const mcpArgs = mcpManager?.running ? ' --mcp-server local-code-review' : ''
    const safeRepo = repoPath.replace(/'/g, "'\\''")
    const safePrompt = prompt.replace(/'/g, "'\\''")
    const shellCmd = `cd '${safeRepo}' && claude${mcpArgs} '${safePrompt}'`
    const appleScript = `tell application "Terminal" to do script "${shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    const { execFile } = require('child_process') as typeof import('child_process')
    execFile('osascript', ['-e', appleScript], { detached: true })
    return {}
  }

  if (tool === 'vscode') {
    const { clipboard } = require('electron') as typeof import('electron')
    clipboard.writeText(prompt)
    const { execFile } = require('child_process') as typeof import('child_process')
    execFile('open', ['-a', 'Visual Studio Code', repoPath], { detached: true })
    return {}
  }

  return { error: `Unknown tool: ${tool}` }
})
```

- [ ] **Step 2: Update the McpManager onEvent callback to route by event type**

In `src/main/index.ts`, replace the `McpManager` constructor call:

```ts
mcpManager = new McpManager((event) => {
  if (event.event === 'pr:updated') {
    mainWindow?.webContents.send('pr:updated', { repoPath: event.repoPath, prId: event.prId })
  } else {
    mainWindow?.webContents.send('review:updated', {
      repoPath: event.repoPath,
      prId: event.prId,
      reviewId: event.reviewId,
    })
  }
})
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: interactive terminal launch + pr:updated event routing"
```

---

## Task 7: Preload — expose assignPr and pr:updated listener

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add assignPr, onPrUpdated, offPrUpdated to the api object**

In `src/preload/index.ts`, add to the `api` object (after the existing `launchFix` line):

```ts
assignPr: (repoPath: string, prId: string, assignee: 'claude' | 'vscode' | null): Promise<PRFile | { error: string }> =>
  ipcRenderer.invoke('prs:assign', repoPath, prId, assignee),

onPrUpdated: (callback: (data: { repoPath: string; prId: string }) => void) => {
  ipcRenderer.on('pr:updated', (_e, data) => callback(data))
},
offPrUpdated: () => {
  ipcRenderer.removeAllListeners('pr:updated')
},
```

Also add `PRFile` to the imports at the top if not already present (it's already imported via the existing `import type { ..., PRFile, ... }`).

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose assignPr and pr:updated in preload"
```

---

## Task 8: UI — assignee widget in PR.tsx + CSS

**Files:**
- Modify: `src/renderer/src/screens/PR.tsx`
- Modify: `src/renderer/src/screens/PR.module.css`

- [ ] **Step 1: Add CSS classes**

In `src/renderer/src/screens/PR.module.css`, append at the end:

```css
/* ── Assignee widget ── */
.assigneeUnset {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  text-decoration: underline dotted;
}
.assigneeUnset:hover {
  color: var(--text);
}

.assigneeDropdownWrap {
  position: relative;
}

.assigneeDropdownMenu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  min-width: 160px;
  z-index: 100;
  overflow: hidden;
}

.assigneeDropdownItem {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}
.assigneeDropdownItem:hover {
  background: var(--bg-surface-2);
}

.assigneeChip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text);
}

.assigneeDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  flex-shrink: 0;
}

.nudgeBtn {
  margin-top: 6px;
  font-size: 11px;
  padding: 2px 8px;
}
```

- [ ] **Step 2: Add state and handlers to PR.tsx**

In `src/renderer/src/screens/PR.tsx`, add inside the `PR()` component, after the existing `useState` declarations:

```ts
const [assigneeDropdownOpen, setAssigneeDropdownOpen] = React.useState(false)
```

Add these two handler functions after `handleFix`:

```ts
async function handleAssign(tool: 'claude' | 'vscode'): Promise<void> {
  if (!repo || !prId) return
  setAssigneeDropdownOpen(false)
  await window.api.assignPr(repo.path, prId, tool)
  // Refresh full PR detail so pr.assignee is in sync
  const updated = await window.api.getPr(repo.path, prId)
  if (updated && !('error' in updated)) setPrDetail(updated as any)
  if (prDetail?.review) {
    window.api.launchFix(tool, repo.path, prId, prDetail.review.id)
  }
}

async function handleNudge(): Promise<void> {
  if (!repo || !prId || !prDetail?.pr.assignee || !prDetail?.review) return
  window.api.launchFix(prDetail.pr.assignee, repo.path, prId, prDetail.review.id)
}
```

- [ ] **Step 3: Wire the pr:updated push event**

In `PR.tsx`, add a `useEffect` that listens for `pr:updated` and refreshes the PR. Add this after the existing `useEffect` for `review:updated` (or near the other useEffects):

```ts
useEffect(() => {
  window.api.onPrUpdated(async ({ prId: updatedPrId }) => {
    if (updatedPrId !== prId || !repo) return
    const updated = await window.api.getPr(repo.path, prId)
    if (updated && !('error' in updated)) setPrDetail(updated as any)
  })
  return () => window.api.offPrUpdated()
}, [prId, repo?.path])
```

- [ ] **Step 4: Add the assignee sidebar section**

In `PR.tsx`, inside the `{tab === 'overview' && ...}` block, add this section in `overviewSidebar` after the existing Review section (after the `{review && (...)}` block):

```tsx
{review?.status === 'submitted' && (
  <div className={styles.sidebarSection}>
    <div className={styles.sidebarLabel}>Assignees</div>
    {!pr.assignee ? (
      <div className={styles.assigneeDropdownWrap}>
        <button
          className={styles.assigneeUnset}
          onClick={() => setAssigneeDropdownOpen((o) => !o)}
        >
          No one — assign…
        </button>
        {assigneeDropdownOpen && (
          <div className={styles.assigneeDropdownMenu}>
            {integrations.find((i) => i.id === 'claudeCode' && i.detected) && (
              <button
                className={styles.assigneeDropdownItem}
                onClick={() => handleAssign('claude')}
              >
                Claude Code
              </button>
            )}
            {integrations.find((i) => (i.id === 'vscode' || i.id === 'cursor' || i.id === 'windsurf') && i.detected) && (
              <button
                className={styles.assigneeDropdownItem}
                onClick={() => handleAssign('vscode')}
              >
                Copilot (VS Code)
              </button>
            )}
          </div>
        )}
      </div>
    ) : (
      <div>
        <div className={styles.assigneeChip}>
          <span className={styles.assigneeDot} />
          <span>{pr.assignee === 'claude' ? 'Claude Code' : 'Copilot (VS Code)'}</span>
        </div>
        <button className={`${styles.nudgeBtn}`} onClick={handleNudge}>
          Nudge
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Remove old "Fix with" buttons**

Find and delete the block at the bottom of PR.tsx (around line 536–557):

```tsx
{prDetail.review?.status === 'submitted' && (
  <div style={{ display: 'flex', gap: 8, marginTop: 8, padding: '0 16px 16px' }}>
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

- [ ] **Step 6: Remove orphaned handleFix and fixLoading**

Delete the `handleFix` function (the one that sets `fixLoading`):

```ts
async function handleFix(tool: 'claude' | 'vscode'): Promise<void> {
  if (!prDetail?.review || !prDetail.pr || !repo) return
  setFixLoading(tool)
  const result = await window.api.launchFix(tool, repo.path, prDetail.pr.id, prDetail.review.id)
  if ('error' in result && result.error) console.error('Fix launch failed:', result.error)
  setFixLoading(null)
}
```

Delete the `fixLoading` state declaration:

```ts
const [fixLoading, setFixLoading] = React.useState<string | null>(null)
```

- [ ] **Step 7: Run renderer tests**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | tail -20
```

Expected: existing tests pass (PRPanel, DiffLine, CommentThread). No new renderer tests needed — the widget logic is thin React state wiring.

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/screens/PR.tsx src/renderer/src/screens/PR.module.css
git commit -m "feat: replace fix buttons with assignee widget in PR sidebar"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run all tests**

```bash
cd local-code-review && npm test 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 2: Final typecheck**

```bash
npm run typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 3: Check git log**

```bash
git log --oneline -9
```

Expected: 8 commits from Tasks 1–8 visible.

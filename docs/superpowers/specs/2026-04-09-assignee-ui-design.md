# Assignee UI Design

## Overview

Replace the "Fix with Claude / Fix with Copilot" buttons with a GitHub PR-style assignee widget in the overview sidebar. Assignment persists on the PR, triggers an interactive tool launch, and the agent self-unassigns via MCP when done.

## Data Model

Add two fields to `PRFileSchema` (`src/shared/review-store/schema.ts`):

```ts
assignee: z.enum(['claude', 'vscode']).nullable()   // null = unassigned
assigned_at: z.string().nullable()                   // ISO timestamp, null when unassigned
```

These are persisted in `{repoPath}/.reviews/{prId}/index.json`.

New `ReviewStore` method: `assignPR(repoPath, prId, assignee: 'claude' | 'vscode' | null)` — writes assignee + assigned_at (or nulls both on unassign).

New IPC handler: `prs:assign` — calls `assignPR`.

## UI

Location: overview sidebar, visible only when `review.status === 'submitted'`.

**Unassigned state:**
```
Assignees
──────────────────
No one — assign...   ← clickable text/button, opens dropdown
```

**Dropdown:** lists detected tools (Claude Code, Copilot/VS Code). Selecting one assigns + launches immediately.

**Assigned state:**
```
Assignees
──────────────────
● Claude Code
  [Nudge]            ← small secondary button, re-runs launch
```

Remove the existing "Fix with" buttons at the bottom of `PR.tsx`.

## Launch Behavior

**Claude (`tool === 'claude'`)**  
Use `osascript` to open Terminal.app interactively in the repo directory:
```
osascript -e 'tell app "Terminal" to do script "cd {repoPath} && claude \"{prompt}\""'
```
No `execFile` await — fire and forget. Not headless.

**VS Code (`tool === 'vscode'`)**  
```
open -a "Visual Studio Code" {repoPath}
```
Prompt copied to clipboard as before. Fire and forget.

**Prompt string (both tools):**
```
Fix the open review comments in .reviews/{prId}/reviews/{reviewId}.json.
When you are done, call the complete_assignment MCP tool to unassign yourself.
```

**Nudge:** re-runs the identical launch for the currently assigned tool.

## MCP: Self-Unassign Tool

Add a `complete_assignment` tool to the MCP server. It accepts `{ repoPath, prId }` and sets `assignee: null, assigned_at: null` on the PR. The MCP handler sends a new `pr:updated` push event to the renderer (`mainWindow.webContents.send('pr:updated', { repoPath, prId })`). The renderer re-fetches the PR on this event to refresh the assignee widget.

## Affected Files

- `src/shared/review-store/schema.ts` — add fields to `PRFileSchema`
- `src/shared/review-store/index.ts` — add `assignPR` method
- `src/main/ipc/prs.ts` — add `prs:assign` handler
- `src/main/index.ts` — update `fix:launch` to use `osascript`/`open`, add `prs:assign` registration
- `src/main/mcp-manager.ts` — add `complete_assignment` MCP tool
- `src/preload/index.ts` — expose `assignPr` method
- `src/renderer/src/screens/PR.tsx` — replace fix buttons with assignee widget

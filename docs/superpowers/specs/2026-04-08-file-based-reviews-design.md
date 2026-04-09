# File-Based Reviews & MCP Server — Design Spec
**Date:** 2026-04-08

## Overview

Move reviews out of SQLite and into `.reviews/` directories inside each reviewed repository. Expose a standalone MCP server (managed by the Electron app) so AI agents can read reviews and write back resolution state. The SQLite database becomes lightweight: repositories and settings only.

**Motivation:** reviews belong to the repository they describe. File-based storage makes them portable, committable, and directly consumable by AI agents ("Fix with Claude/Copilot" workflow). The MCP server gives agents a structured, validated write-back path rather than requiring them to edit raw JSON.

---

## Architecture

```
Electron App
├── Main Process
│   ├── Tray management + window lifecycle
│   ├── MCP server lifecycle (spawn/kill child process)
│   ├── fs.watch on .reviews/ dirs (detects external edits)
│   ├── Unix socket server (receives events from MCP server)
│   ├── SQLite (repos + settings only)
│   └── IPC handlers for renderer
├── Preload
│   └── contextBridge API (unchanged shape)
└── Renderer (React)
    └── UI (updated to read from ReviewStore via IPC)

MCP Server (child process, dist/mcp-server/)
├── MCP protocol handler (stdio transport)
├── ReviewStore (shared module — same as main process)
├── Unix socket client (emits events to Electron main)
└── Prompts endpoint (exposes fix-review workflow prompt)

Shared Modules (src/shared/)
├── review-store/    ← new: owns all .reviews/ file I/O
├── types.ts         ← updated: adds review file types
└── diff-utils.ts    ← unchanged
```

**Sync model:**
- Agent writes via MCP → `ReviewStore` writes file → MCP emits `review:updated` on Unix socket → Electron re-reads via `ReviewStore` → pushes to renderer
- External JSON edit → `fs.watch` fires → Electron re-reads via `ReviewStore` → pushes to renderer
- Socket carries events only (never data). Data always flows through `ReviewStore`.

---

## Directory Structure (per repo)

```
repo/.reviews/
  {pr-uuid}/
    index.json             ← PR metadata (stable across reviews)
    reviews/
      {review-uuid}.json   ← one file per review round
      {review-uuid}.json
```

Auto-discovered on repo open. If a file is deleted externally, the UI reflects the deletion on next load or file-watch event. No app-side tombstoning.

---

## Data Model

### SQLite (what remains)

```sql
repositories  -- unchanged
settings      -- unchanged (adds: mcp_enabled, mcp_port)

-- DROPPED after migration: pull_requests, reviews, comments, comment_context
```

### `index.json` (PR-level)

```json
{
  "version": 1,
  "id": "uuid",
  "title": "Add user authentication",
  "description": null,
  "base_branch": "main",
  "compare_branch": "feature/auth",
  "status": "open",
  "created_at": "2026-04-08T10:00:00Z",
  "updated_at": "2026-04-08T10:00:00Z"
}
```

`status`: `open | closed`

### `reviews/{uuid}.json` (review round)

```json
{
  "version": 1,
  "id": "uuid",
  "status": "in_progress",
  "base_sha": "a1b2c3",
  "compare_sha": "d4e5f6",
  "created_at": "2026-04-08T10:00:00Z",
  "submitted_at": null,
  "comments": [
    {
      "id": "RVW-001",
      "file": "src/auth/login.ts",
      "start_line": 42,
      "end_line": 44,
      "side": "right",
      "body": "Token sent in response body — use httpOnly cookie instead.",
      "context": [
        { "line": 39, "type": "context", "content": "const token = jwt.sign(...)" },
        { "line": 42, "type": "added",   "content": "if (token) {" },
        { "line": 43, "type": "added",   "content": "  res.send(token)" },
        { "line": 44, "type": "added",   "content": "}" }
      ],
      "is_stale": false,
      "status": "open",
      "resolution": null,
      "created_at": "2026-04-08T10:01:00Z"
    }
  ]
}
```

**Comment `status`:** `open | resolved | wont_fix`

**`resolution`** — populated by agent, required when status changes from `open`:

```json
"status": "resolved",
"resolution": {
  "comment": "Switched to httpOnly cookie via res.cookie().",
  "resolved_by": "claude",
  "resolved_at": "2026-04-08T11:30:00Z"
}
```

`resolved_by` is a free string (agent supplies it: `"claude"`, `"copilot"`, `"human"`, etc.).

**`version` field** enables forward-compatible migration. `serializer.ts` checks this on read and applies upgrade functions for future schema versions.

---

## ReviewStore (shared module)

`src/shared/review-store/` — the single source of truth for all `.reviews/` file I/O. Neither the Electron main process nor the MCP server reads or writes these files directly.

```
review-store/
  index.ts        ← ReviewStore class
  schema.ts       ← Zod schemas for index.json and review files
  serializer.ts   ← read/write with validation + version handling
```

**Public API:**

```ts
class ReviewStore {
  // PRs
  listPRs(repoPath: string): PR[]
  createPR(repoPath: string, args: CreatePRArgs): PR
  getPR(repoPath: string, prId: string): PR
  updatePRStatus(repoPath: string, prId: string, status: PRStatus): PR

  // Reviews
  listReviews(repoPath: string, prId: string): Review[]
  createReview(repoPath: string, prId: string, args: CreateReviewArgs): Review
  getReview(repoPath: string, prId: string, reviewId: string): Review
  submitReview(repoPath: string, prId: string, reviewId: string): Review

  // Comments
  addComment(repoPath: string, prId: string, reviewId: string, args: AddCommentArgs): Review
  resolveComment(repoPath: string, prId: string, reviewId: string, commentId: string, resolution: Resolution): Review
  markStale(repoPath: string, prId: string, reviewId: string, filePath: string, ranges: LineRange[]): void
}
```

**Write pattern:** read → mutate in memory → validate (Zod) → write atomically via `fs.rename` on a `.tmp` file. Atomic on all platforms — no partial writes.

**Error handling:** files that fail Zod validation on read throw `InvalidReviewFileError` — never silently corrupt state.

---

## MCP Server

Compiled as a separate entry point: `src/mcp-server/index.ts` → `dist/mcp-server/`.

**Transport:** stdio (standard MCP convention, supported by Claude Code and Copilot).

**Side channel:** Unix socket (Windows: named pipe) for emitting events back to Electron main. Socket path passed via `LOCAL_REVIEW_SOCKET` environment variable at spawn time.

### Tools

```
list_prs(repo_path)
  Lists all PRs in .reviews/ for the given repo path.

get_pr(repo_path, pr_id)
  Returns PR metadata and a summary of its reviews.

get_review(repo_path, pr_id, review_id)
  Returns the full review including all comments and resolution state.

get_open_issues(repo_path, pr_id, review_id?)
  Returns only open comments. Omit review_id to query the latest review.

mark_resolved(repo_path, pr_id, review_id, comment_id, resolution_comment)
  Marks a comment resolved. resolution_comment is required — error if absent.
  resolved_by is set automatically by the server to its configured identity (default: "mcp").

mark_wont_fix(repo_path, pr_id, review_id, comment_id, resolution_comment)
  Same shape as mark_resolved. resolution_comment required.
  resolved_by set automatically by the server.
```

After any write tool, MCP server emits on the socket:
```json
{ "event": "review:updated", "repoPath": "...", "prId": "...", "reviewId": "..." }
```

### Prompts endpoint

Exposes a `fix-review` prompt via MCP's `prompts/get`:

```
You are implementing fixes from a local code review. Use list_prs() to find open
reviews in this repository. For each open issue: implement the fix in the codebase,
then call mark_resolved() or mark_wont_fix() with a clear explanation of what you
did or why you skipped it. Never mark an issue without a resolution comment. Work
through all open issues before finishing.
```

### Lifecycle

Electron main spawns the MCP child process when `mcp_enabled = true` in settings. On crash, Electron detects via the `close` event and updates tray/settings to show "Stopped" — no auto-restart.

---

## Tray + App Lifecycle

**Window close behaviour:**
- MCP server running → hide window to tray, keep process alive
- MCP server off → quit normally

**Tray menu:**
```
Open Interface
──────────────
MCP Server: Running  ✓   (click to stop)
  — or —
MCP Server: Stopped      (click to start)
──────────────
Quit
```

**Quit:** SIGTERM to MCP child process, wait for exit, then `app.quit()`.

---

## Settings Page Additions

### MCP Server

- On/Off toggle — starts/stops the child process, updates tray
- Server identity field (default: `"mcp"`) — the string written to `resolved_by` when an agent resolves an issue. Allows distinguishing Claude vs Copilot sessions if the user runs separate server instances.

### MCP Integrations

Detects installed tools by checking whether each tool's config directory exists on disk. Platform paths resolved via `os.homedir()` and `process.env.APPDATA` (no hardcoded app bundle paths — works cross-platform).

| Tool | Config file (macOS) | Config file (Windows) | Config file (Linux) |
|---|---|---|---|
| Claude Code | `~/.claude/settings.json` | same | same |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` | `~/.config/Claude/claude_desktop_config.json` |
| VS Code | `~/Library/Application Support/Code/User/settings.json` | `%APPDATA%\Code\User\settings.json` | `~/.config/Code/User/settings.json` |
| Cursor | `~/Library/Application Support/Cursor/User/settings.json` | `%APPDATA%\Cursor\User\settings.json` | `~/.config/Cursor/User/settings.json` |
| Windsurf | `~/Library/Application Support/Windsurf/User/settings.json` | `%APPDATA%\Windsurf\User\settings.json` | `~/.config/Windsurf/User/settings.json` |

**UI:**
```
MCP Integrations

  ✓ Claude Code          [Installed]
  ✓ Claude Desktop       [Installed]
  ✓ VS Code              [Not installed]
  ✗ Cursor               (not detected)
  ✗ Windsurf             (not detected)

  [Install / Repair All]
```

**Install operation (idempotent):** read existing config → upsert `local-code-review` key → write back. Running twice is safe. MCP binary path resolved from `app.getPath('exe')` at install time.

Config key and shape differ per tool:

**Claude Code / Claude Desktop** — top-level `mcpServers`:
```json
{
  "mcpServers": {
    "local-code-review": {
      "command": "/path/to/bundled/mcp-server",
      "args": []
    }
  }
}
```

**VS Code / Cursor / Windsurf** — nested under `mcp.servers` in `settings.json`:
```json
{
  "mcp": {
    "servers": {
      "local-code-review": {
        "type": "stdio",
        "command": "/path/to/bundled/mcp-server",
        "args": []
      }
    }
  }
}
```

---

## "Fix with" Buttons

Shown on submitted reviews. Visible only if the corresponding tool was detected.

**Fix with Claude** — launches Claude CLI in the repo directory with the `fix-review` prompt and MCP server pre-wired:
```bash
claude --mcp-server local-code-review \
  "Fix the open issues in .reviews/{pr-id}/reviews/{review-id}.json"
```
If MCP server is off: falls back to `claude "Read .reviews/{pr-id}/reviews/{review-id}.json and fix the open issues."` (no MCP flag).

**Fix with Copilot (VS Code)** — opens VS Code in the repo directory via `code .` and copies the `fix-review` prompt to the clipboard. The user pastes it into the Copilot chat panel. VS Code picks up the MCP server from the installed config automatically, so Copilot has the tools available once the session starts.

Both buttons spawn the relevant CLI or app via `shell.openExternal` / `child_process.execFile` using the detected binary path.

---

## Migration

One-time, runs on first app startup after this version ships.

1. For each repo, read all `pull_requests` from SQLite
2. Create `.reviews/{pr-id}/index.json` for each PR
3. For each review under the PR, create `.reviews/{pr-id}/reviews/{review-id}.json` with comments and `comment_context` merged in
4. On full success: drop `pull_requests`, `reviews`, `comments`, `comment_context` tables
5. On failure: delete any `.reviews/` directories written during this run (clean partial state), leave SQLite untouched, surface an error with a retry button

Migration is skipped if the tables are already absent (idempotent). No data is lost — all relational data maps directly to the new file format.

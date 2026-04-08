# Local PR Reviewer — Design Spec
**Date:** 2026-04-08

## Overview

A lightweight Electron desktop application for reviewing local git repository changes in a simulated GitHub-style PR workflow. The user opens a repo, creates a simulated PR (branch vs branch), reviews the diff with inline comments, submits the review, and exports the comments as LLM-friendly Markdown and JSON for feeding to an AI agent (Claude, Copilot, etc.) to action.

**Use case:** AI-generated code often needs manual human review before being considered acceptable. This tool lets the user review diffs locally — without creating a real GitHub PR — collect structured feedback, and export it in a format an LLM can act on directly.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron |
| Build tooling | electron-vite |
| Renderer | React + Vite |
| Main process DB | better-sqlite3 (SQLite) |
| Git integration | child_process.execFile('git', ...) — system git |
| State management | Zustand (renderer) |
| DB location | Electron app.getPath('userData') — platform-native |

---

## Architecture

```
electron-vite project
├── main/          # Node.js — git ops, SQLite, diff parsing, IPC handlers
├── preload/       # contextBridge — exposes typed IPC API to renderer
└── renderer/      # React — pure UI, calls preload API, renders diffs + comments
```

**IPC pattern:** Renderer calls `window.api.someMethod(args)` → preload forwards via `ipcRenderer.invoke` → main handles (queries SQLite or shells out to git) → returns typed result → renderer updates UI.

All business logic lives in the main process. The renderer is purely presentational. Git operations are performed by spawning the system `git` binary — no git libraries.

---

## Data Model

### `repositories`
```sql
id          TEXT PRIMARY KEY,  -- UUID
path        TEXT NOT NULL,
name        TEXT NOT NULL,     -- basename of path
created_at  TEXT NOT NULL      -- ISO8601
```

### `pull_requests`
```sql
id              TEXT PRIMARY KEY,  -- UUID
repo_id         TEXT NOT NULL REFERENCES repositories(id),
title           TEXT NOT NULL,
description     TEXT,
base_branch     TEXT NOT NULL,
compare_branch  TEXT NOT NULL,
base_sha        TEXT NOT NULL,     -- tip SHA at PR creation
compare_sha     TEXT NOT NULL,     -- tip SHA at PR creation
status          TEXT NOT NULL DEFAULT 'open',  -- open | closed
created_at      TEXT NOT NULL,
updated_at      TEXT NOT NULL
```

### `reviews`
```sql
id            TEXT PRIMARY KEY,  -- UUID
pr_id         TEXT NOT NULL REFERENCES pull_requests(id),
status        TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | submitted
submitted_at  TEXT,
created_at    TEXT NOT NULL
```

### `comments`
```sql
id          TEXT PRIMARY KEY,  -- UUID
review_id   TEXT NOT NULL REFERENCES reviews(id),
file_path   TEXT NOT NULL,
start_line  INTEGER NOT NULL,  -- line number in the diff
end_line    INTEGER NOT NULL,  -- same as start_line for single-line comments
side        TEXT NOT NULL,     -- 'left' | 'right'; defaults to 'right' when created in unified view (equivalent to new-code side)
body        TEXT NOT NULL,
is_stale    INTEGER NOT NULL DEFAULT 0,  -- boolean; set true on PR refresh if lines no longer exist
created_at  TEXT NOT NULL
```

### `comment_context`
```sql
id            TEXT PRIMARY KEY,  -- UUID
comment_id    TEXT NOT NULL REFERENCES comments(id),
context_lines TEXT NOT NULL      -- JSON: [{line_number, content, type: 'added'|'removed'|'context'}]
```

Context is captured at comment creation time so exports remain stable even if the branch changes after commenting.

---

## Staleness Detection

When a PR is opened, the app resolves current tip SHAs for both branches and compares against `base_sha` / `compare_sha`. If either has drifted:

- A banner is shown in the PR view: "This PR is out of sync with its branches."
- The user can trigger a **Refresh**: re-resolves SHAs, re-fetches and re-parses the diff, updates stored SHAs.
- During refresh, any comment whose `start_line`–`end_line` range no longer exists in the updated diff has `is_stale` set to `true`.
- Stale comments are rendered with a visual indicator (muted / strikethrough) and excluded from exports.

---

## UI Flow

### Screen 1 — Home
- List of previously opened repositories with their open PR count.
- "Open Repository" button → native folder picker → validates it is a git repo → adds to `repositories` if new.
- Click repo → navigates to repo view showing its PRs.

### Screen 2 — Open PR
- Pick compare branch (dropdown from `git branch`)
- Pick base branch (dropdown)
- Enter title (required) + description (optional)
- Confirm → app resolves tip SHAs, generates diff, creates `pull_requests` record → navigates to PR view.

### Screen 3 — PR View
- **Header:** title, `compare → base` branches, status badge, stale banner if applicable.
- **Tab bar:** Files Changed (default) | Overview (title + description).
- **File tree sidebar:** list of changed files; click to jump to file in diff pane.
- **Diff pane:** unified/split toggle (top-right). Files rendered sequentially, collapsed by default, expandable per file.
- **View toggle is purely visual** — comments are anchored to diff line numbers in the data layer and rendered correctly in both views.

### Commenting
- Hover a line → `+` gutter button appears.
- Click `+` for single-line comment; click-drag across lines for a range.
- Inline comment box appears below selection.
- Saved immediately to SQLite as part of the current `in_progress` review (auto-created if none exists for this PR).
- Comment renders as an inline thread below the selected lines in both unified and split views.

### Screen 4 — Review Panel & Submit
- Floating sidebar listing all staged comments for the in-progress review: file, line range, body preview.
- "Submit Review" button → sets review status to `submitted`, locks comments, triggers export.
- Native save dialog → user picks location → both `.md` and `.json` files written.

---

## Export Format

Filename pattern: `review-{pr-title-slug}-{YYYY-MM-DD}.md` / `.json`

Issue IDs are sequential per review: `RVW-001`, `RVW-002`, etc. They are generated at export time from comment creation order — not stored in the database. Comments are internally identified by UUID; the `RVW-` prefix is purely for human readability and LLM reference.

### Markdown
```markdown
# Review: Add user authentication
**PR:** `feature/auth` → `main`
**Submitted:** 2026-04-08
**Review ID:** `rev_abc123`

---

## Issue RVW-001
**File:** `src/auth/login.ts`
**Lines:** 42–44

```ts
// context
const token = jwt.sign(payload, process.env.SECRET)
// [selected lines start]
if (token) {
  res.send(token)
}
// [selected lines end]
// context
res.end()
```

**Comment:**
The token is sent in the response body — should be set as an httpOnly cookie instead to prevent XSS exposure.
```

### JSON
```json
{
  "review_id": "rev_abc123",
  "pr": {
    "title": "Add user authentication",
    "base": "main",
    "compare": "feature/auth",
    "base_sha": "a1b2c3",
    "compare_sha": "d4e5f6"
  },
  "submitted_at": "2026-04-08T14:32:00Z",
  "comments": [
    {
      "id": "RVW-001",
      "file": "src/auth/login.ts",
      "start_line": 42,
      "end_line": 44,
      "context": [
        { "line": 39, "type": "context", "content": "const token = jwt.sign(payload, process.env.SECRET)" },
        { "line": 42, "type": "added", "content": "if (token) {" },
        { "line": 43, "type": "added", "content": "  res.send(token)" },
        { "line": 44, "type": "added", "content": "}" },
        { "line": 45, "type": "context", "content": "}" }
      ],
      "body": "The token is sent in the response body — should be set as an httpOnly cookie instead to prevent XSS exposure."
    }
  ]
}
```

Context includes 3 lines above and below the selected range. The code snippet — not the line number — is the primary locator for LLM consumption.

---

## Key Constraints

- No cloud APIs, no network calls.
- No server process — Electron only, fully self-contained.
- SQLite database stored in platform userData directory.
- System `git` must be installed on the host machine.
- Unified/split view toggle is a purely visual rendering concern — no effect on stored data.
- Comment line ranges use a minimum of 1 line (single-line comments are a range of 1).
- Stale comments excluded from exports.

# Repo Autodiscovery — Design Spec
**Date:** 2026-04-08

## Overview

Add an optional autodiscovery feature to the Home screen. The user configures a single base directory; the app scans it recursively (max depth 5) on launch in the background and surfaces found repos in a searchable list. Repos the user has interacted with (have PRs) appear in a "My Repos" section at the top. Manual "Add Repository" is retained for out-of-tree repos.

---

## Architecture

### Scanner (main process)

New module: `src/main/git/scanner.ts`

Walks the filesystem from the configured base directory using a recursive depth-first traversal (max depth 5). For each directory encountered, runs:

```
git rev-parse --is-inside-work-tree
```

If the command returns `true`, the directory is a git repo — record `{path, name: basename(path)}` and **stop recursing into it**. This naturally skips `node_modules`, `.git` subdirs, and any nested repos without requiring an exclusion list.

If the command fails or returns false, recurse into subdirectories (if depth allows).

Returns `{ paths: { path: string; name: string }[] }`.

### Data Layer Changes

**New `settings` table** (added to existing SQLite schema):
```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
```

Relevant keys:
- `scan_base_dir` — absolute path to the configured scan root (absent = not configured)
- `onboarding_complete` — `'true'` once the user has dismissed the first-launch card

**`repositories` table change:** Add `last_visited_at TEXT` column (ISO8601, nullable). Updated to `NOW()` whenever the user navigates into a repo.

### IPC Additions

| Handle | Input | Output | Purpose |
|---|---|---|---|
| `repos:scan` | — | `{ paths: { path, name }[] }` | Trigger background scan from renderer |
| `repos:getSetting` | `key: string` | `string \| null` | Read a settings value |
| `repos:setSetting` | `{ key, value }` | `void` | Write a settings value |
| `repos:touch` | `repoId: string` | `void` | Update `last_visited_at` |

---

## Home Screen UI

### Three-section layout

Sections only render if they have matching content. All three are filtered simultaneously by the search bar.

**1. My Repos**
Repos in the DB with at least one PR. Sorted by `last_visited_at` desc. Appears first.

**2. Recent**
Repos in the DB with no PRs, sorted by `last_visited_at` desc. Capped at 5 entries.

**3. Discovered**
Scanned repos not yet in the DB, sorted alphabetically. Rendered slightly muted to indicate they haven't been activated. Clicking one calls `insertRepo` (same as manual add), updates `last_visited_at`, then navigates to the repo view.

### Search bar

Filters all three sections simultaneously. Case-insensitive substring match against `name` and `path`. Runs in the renderer against the merged list (DB repos + scan results). Sections with zero matches are hidden. If all sections are empty after filtering, shows: _"No repositories match."_

### Header

Retains the "Add Repository" button. If a base dir is configured and a scan is in progress, a small spinner appears next to the Discovered section heading. If a base dir is set but scan returned nothing, the Discovered section is omitted silently.

If a base dir is **not** configured and the user has at least one DB repo, a subtle prompt appears below the header:
> _"Set a scan directory to auto-discover repos"_ — [Configure]

### Onboarding card (first launch only)

Shown when: no base dir is set AND no repos are in the DB. Renders above the empty state (which remains visible below it).

```
┌─────────────────────────────────────────────────────┐
│  Auto-discover your repositories                    │
│  Set a scan directory and we'll find your local     │
│  git repos automatically. This is optional — you    │
│  can always add repos manually instead.             │
│                                                     │
│  [Set scan directory]   [Skip, add manually]        │
└─────────────────────────────────────────────────────┘
```

Clicking "Skip, add manually" sets `onboarding_complete = 'true'` in settings. The card never reappears after dismissal. Clicking "Set scan directory" opens the native directory picker, saves to `scan_base_dir`, sets `onboarding_complete = 'true'`, and immediately triggers a scan.

### Configure scan directory

Accessible from the onboarding card and the in-header "Configure" prompt. Opens the native directory picker. On selection, saves path via `repos:setSetting('scan_base_dir', path)`, then fires `repos:scan`.

---

## Scan Behavior

- Triggered on app launch (renderer fires `repos:scan` on mount if `scan_base_dir` is set).
- Results stored in Zustand only — not persisted to DB until the user clicks a discovered repo.
- If a scan is already in progress (tracked in Zustand), a second call is suppressed.
- Scan failures (deleted base dir, permissions error) fail silently — the Discovered section is simply absent.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Base dir deleted since last launch | Scan fails silently; Discovered section absent; no error shown |
| DB repo path no longer on disk | Repo still appears in My Repos / Recent, rendered muted with a warning icon; clicking shows an inline error |
| No base dir set | Home looks identical to today; onboarding card shown on first launch only |
| Search with no results | All sections hidden; "No repositories match." empty state shown |

---

## What Is Not Changing

- The "Add Repository" manual flow (`repos:open` IPC, native directory picker) is unchanged.
- The DB repo schema for `pull_requests`, `reviews`, `comments`, `comment_context` is unchanged.
- All navigation, PR creation, diff view, and export flows are unchanged.

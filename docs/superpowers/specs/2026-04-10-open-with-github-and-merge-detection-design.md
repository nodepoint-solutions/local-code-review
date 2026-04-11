# Design: Transfer PR to GitHub + Merge Auto-Detection

**Date:** 2026-04-10

---

## Overview

Two related features:

1. **"Transfer PR to GitHub" button** — appears in the Actions sidebar of the PR screen when the repo's remote origin is a GitHub URL. Walks through a 4-step safety gate before opening the GitHub compare URL in the browser.

2. **Merge auto-detection** — on every `prs:get` load, fetch origin and check if the compare branch has been merged into the remote base. If so, silently close the PR and add a timeline entry.

---

## Feature 1: Transfer PR to GitHub

### Button visibility

On PR screen mount, load remote info via `git:remote-info`. If the origin URL is a GitHub URL (contains `github.com`), parse it to extract `{ owner, repo }` and show the button. Otherwise hide it.

Supports both URL formats:
- SSH: `git@github.com:owner/repo.git`
- HTTPS: `https://github.com/owner/repo.git` or `https://github.com/owner/repo`

### GitHub URL format

```
https://github.com/{owner}/{repo}/compare/{base}...{compare}?expand=1&title={encoded_title}&body={encoded_body}
```

Title and body are `encodeURIComponent`-encoded. Both come from `prDetail.pr`. Body is omitted from the query string if `pr.description` is null.

### 4-step flow on click

Executed sequentially in the renderer as an async function. Each step either proceeds or aborts.

**Step 1 — Review state check**

If there is an in-progress review, OR a submitted review with at least one non-stale unresolved comment:

```
window.confirm(
  "This PR has an active review with unresolved comments.\n\n" +
  "Proceed anyway and open GitHub, or cancel to resolve them first?"
)
```

- Cancel → abort (no notification needed, dialog is self-explanatory)
- OK → continue

If no such review state, skip to step 2.

**Step 2 — Working directory clean**

Call `git:working-dir-clean`. If dirty:

```
showNotification("Working directory has uncommitted changes. Commit or stash them first.")
```

Abort. If clean, continue.

**Step 3 — Branch pushed to remote**

Call `git:branch-pushed` for `pr.compare_branch`. If not pushed:

```
window.confirm("Branch hasn't been pushed to remote. Push it now?")
```

- Cancel → `showNotification("Push your branch first, then try again.")` → abort
- OK → call `git:push-branch`
  - If push fails → `showNotification("Push failed: {error}. Fix it manually and try again.")` → abort
  - If push succeeds → continue

If already pushed, skip to step 4.

**Step 4 — Open URL**

Call `window.open(githubUrl, '_blank')`. Electron's `setWindowOpenHandler` already routes this to `shell.openExternal`.

---

## Feature 2: Merge Auto-Detection

### Where it runs

Inside the existing `prs:get` IPC handler, after SHAs are resolved, before diff computation. Only runs when `pr.status === 'open'`.

### Logic

```
git fetch origin
git merge-base --is-ancestor {compareSha} origin/{base_branch}
```

Exit code 0 = compare SHA is an ancestor of the remote base = merged. If this condition is true, call `store.mergePR(repoPath, prId)` which sets `status: 'closed'` and `merged_at: new Date().toISOString()`. The updated PR is returned in the response — no extra IPC event needed.

### Schema change

`PRFileSchema` gains:

```ts
merged_at: z.string().nullable().optional().default(null)
```

Backward-compatible (optional with default null). Existing PR files without this field continue to deserialize correctly.

`ReviewStore` gains a `mergePR(repoPath, prId)` method — thin wrapper that writes `status: 'closed'` and `merged_at: now` without touching any review files.

### Timeline entry

`ReviewTimeline` checks `pr.merged_at` after rendering all review entries. If set, renders a final entry:

- Purple filled dot
- Label: **"Merged into `{base_branch}`"**
- Timestamp: `formatRelativeTime(pr.merged_at)`

---

## New Git Utilities (`src/main/git/branches.ts`)

| Function | Git command | Notes |
|---|---|---|
| `getRemoteOriginUrl(repoPath)` | `git remote get-url origin` | Returns null if no origin |
| `isWorkingDirClean(repoPath)` | `git status --porcelain` | Clean = empty output |
| `isBranchPushed(repoPath, branch)` | `git ls-remote --heads origin {branch}` | Pushed = non-empty output |
| `pushBranch(repoPath, branch)` | `git push origin {branch}` | Throws on non-zero exit |
| `fetchOrigin(repoPath)` | `git fetch origin` | Called in `prs:get` |
| `isMergedIntoRemote(repoPath, compareSha, baseBranch)` | `git merge-base --is-ancestor {compareSha} origin/{baseBranch}` | Returns boolean via exit code |

---

## New IPC Handlers (`src/main/ipc/prs.ts`)

| Channel | Input | Output |
|---|---|---|
| `git:remote-info` | `repoPath: string` | `{ owner: string; repo: string } \| null` |
| `git:working-dir-clean` | `repoPath: string` | `{ clean: boolean }` |
| `git:branch-pushed` | `repoPath: string, branch: string` | `{ pushed: boolean }` |
| `git:push-branch` | `repoPath: string, branch: string` | `{ error?: string }` |

---

## Preload API additions (`src/preload/index.ts`)

```ts
getRemoteInfo: (repoPath: string) => Promise<{ owner: string; repo: string } | null>
isWorkingDirClean: (repoPath: string) => Promise<{ clean: boolean }>
isBranchPushed: (repoPath: string, branch: string) => Promise<{ pushed: boolean }>
pushBranch: (repoPath: string, branch: string) => Promise<{ error?: string }>
```

---

## Renderer changes

### `PR.tsx`

- Add `githubInfo` state (`{ owner: string; repo: string } | null`)
- Load via `window.api.getRemoteInfo(repo.path)` on mount, parallel with `getIntegrations`
- Actions section: render "Transfer PR to GitHub" button when `githubInfo !== null` and `pr.status === 'open'`
- `handleOpenWithGitHub` implements the 4-step flow above

### `ReviewTimeline.tsx`

- After all review entries, if `pr.merged_at` is set, render the merged entry (purple dot, "Merged into `{base_branch}`", timestamp)

---

## Out of scope

- Fetching PR status back from the GitHub API
- Supporting non-GitHub remotes (GitLab, Bitbucket)
- Showing the GitHub URL inline
- Configuring the fetch interval (always on `prs:get`)

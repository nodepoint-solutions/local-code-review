# Assignee-from-birth and auto-fix on submit — Design Spec

**Date:** 2026-08-27
**Status:** Approved

## Overview

Every PR gets its assignee (the "colleague" who fixes review comments) at creation, the way a GitHub PR has an author from the start. Submitting a review then hands the work straight to that assignee via a confirmation dialog — no separate assign step. Agents can also open PRs themselves through a new `create_pr` MCP tool, and the fix launcher gains a terminal picker (Terminal / iTerm2 / Ghostty) plus an always-available "Copy prompt" path for driving the fix from an existing terminal session.

## Scope

- macOS only, matching the existing launcher.
- Assignee values stay `'claude' | 'vscode' | null`; `null` now means "Me — I fix manually".
- PRs created by Cursor/Windsurf map to `vscode`; widening the enum so they launch their own editor is out of scope (Copy prompt is the honest path for them).

## Data model

### `assignee` changes meaning

`assignee` on `PRFile` becomes a stable property chosen at PR creation: who fixes this PR's reviews. `assigned_at` records when it was set (creation, or a later change). The schema is unchanged; only semantics move.

### `fix_started_at` on the review

`ReviewFileSchema` gains:

```ts
fix_started_at: z.string().nullable().optional().default(null)
```

Stamped when the user confirms **Start fix** or **Copy prompt** in the post-submit dialog (copying counts — the user is driving the same fix from their own session). A new review round starts with it null, so the per-round lifecycle resets naturally.

### Phase derivation (`src/shared/pr-workflow.ts`)

For a `submitted` review:

- `fix_started_at !== null` → `in_fix`
- otherwise → `reviewed`

`pr.assignee` no longer participates in phase derivation.

### Capability changes

- `allowsAssignee()`: any open phase **except** `in_fix` (the colleague is not swapped mid-work). `assignDeniedReason` copy updates to match.
- `allowsReopenReview()`: unchanged (`reviewed` only) — once a fix starts, the review is locked, same as today.
- Auto-unassign on review completion (`pr-service.ts` around line 127) is **removed**; the assignee is permanent.

### Migration for PRs mid-fix at upgrade

Every write path on this branch serializes `fix_started_at` (even when null), so a review file whose raw JSON lacks the key was written before the upgrade — key absence is the legacy discriminator. On read, the store migrates such a file once: if the review is `submitted` and the PR's `assigned_at` is after `submitted_at` (the legacy signal for an active fix), it stamps `fix_started_at = assigned_at`; either way it persists the file so the key exists and the migration never re-fires. Key-present files are never touched, whatever their timestamps.

## PR creation

### Manual path

The New PR form (`OpenPR.tsx`) gains an assignee picker: **Claude / Copilot / Me**. Defaults to the last choice (localStorage). `prs:create` accepts the assignee and stores it with `assigned_at = created_at`.

### Agent path — `create_pr` MCP tool

New tool in `src/mcp-server/tools.ts`:

```
create_pr(repo_path, title, description, base_branch, compare_branch)
```

- **Guard:** the repo's `.reviews/` directory must already exist (the repo is already managed by the app). Otherwise: error `"This repository is not set up in Local Code Review. Add it in the app first."` The MCP server cannot reach the app's sqlite registry; the `.reviews/` directory is the file-side signal that the repo is registered.
- **Validation:** both branches resolve via `git rev-parse` (child_process, run in `repo_path`) before creating, matching `prs:create`.
- **Assignee:** derived from `LOCAL_REVIEW_IDENTITY` — Claude Code / Claude Desktop → `claude`; Copilot / Cursor / Windsurf → `vscode`. The creating agent owns the PR.
- **UI refresh:** emits `pr:updated` over the socket, same as `complete_assignment` does today.

### "Create PR" skill

A second skill installed by `integrations.ts` next to the fix skill, in its own directory (`local-code-review-create-pr/SKILL.md`, per ecosystem). It instructs the agent to: confirm the branch to propose and its base, derive title and description from the branch's commits, and call `create_pr`. It records the PR against local branches only — no pushing, no remotes, same as manual creation.

## Submit flow

After a successful submit in `ReviewPanel`:

- **Assignee is an agent** → a dialog appears: "_Claude will start fixing these N comments._" with three actions:
  - **Start fix** — launches the agent (see Launch mechanics), stamps `fix_started_at` → `in_fix`.
  - **Copy prompt** — puts the `/local-code-review repo_path=… pr_id=… review_id=…` line on the clipboard, stamps `fix_started_at` → `in_fix`. Covers Ghostty-in-existing-session and agents without CLI launch.
  - **Later** — closes the dialog; phase stays `reviewed`.
- **Assignee is Me (`null`)** → no dialog; manual resolve works as today.

While in `reviewed` with an agent assignee, the PR screen shows a **Start fix** button that opens the same dialog — this replaces the assign-dropdown-as-launcher. **Nudge** stays in `in_fix` and relaunches without re-stamping.

The stamp happens in the main process inside the launch/copy IPC handlers, so phase and action can never disagree.

## Launch mechanics

### Terminal picker

Settings gains a **Terminal** choice, persisted in the settings table (`terminal_app` ∈ `Terminal` / `iTerm` / `Ghostty`, default `Terminal`). Only installed apps are offered (checked in `/Applications` and `~/Applications`).

### Per-terminal launch

Command construction extracted to a pure function (new `src/main/fix-launcher.ts`) returning `{ command, args }`, so each terminal's invocation is unit-testable:

- **Terminal.app** — osascript, as today.
- **iTerm2** — osascript: `create window with default profile command …`.
- **Ghostty** — `open -na Ghostty --args --working-directory=<repo> -e claude <prompt>`. `open --args` passes argv verbatim with no shell, so the prompt travels as one argument. Always a new window — Ghostty has no scripting interface for existing sessions, which is why Copy prompt sits beside Start in the dialog. **Verify the `-e` multi-word invocation manually before building further on it.**
- **VS Code assignee** — unchanged: prompt to clipboard, `open -a "Visual Studio Code"`.

## `complete_assignment` MCP tool

Now clears `fix_started_at` on the review instead of nulling the assignee — the semantics become "the agent's session ended":

- All comments resolved → the review auto-completes as today → `fix_complete`.
- Open comments remain (agent gave up or was interrupted) → phase falls back to `reviewed` and the Start fix button returns. Today this state leaves a dangling assignee; the new model recovers cleanly.

Tool description text updates to match. The socket `pr:updated` emit stays.

## UI cleanup

- The assignee dropdown on the PR screen becomes a pure "change assignee" control (allowed except during `in_fix`); it no longer launches anything.
- The existing VS Code prompt modal merges into the new dialog's Copy prompt presentation.

## Testing

- **Workflow:** phase derivation from `fix_started_at`, new `allowsAssignee` gating, migration rule — unit tests in the existing workflow/store suites.
- **Store:** `startFix` stamping, `complete_assignment` clearing, `create_pr` guard and validation — service-level tests against a real git fixture, matching `pr-service.test.ts` style.
- **Launcher:** `fix-launcher.ts` command construction per terminal — pure unit tests.
- **Renderer:** submit dialog (appears for agent assignee, absent for Me, all three actions), New PR assignee picker, Start fix button in `reviewed` — Testing Library role/name queries, matching the existing suites.

## Files changed

| File                                              | Change                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/review-store/schema.ts`               | `fix_started_at` on `ReviewFileSchema`                                 |
| `src/shared/review-store/index.ts`                | `startFix`, `clearFixStarted`, migration on read, assignee at creation |
| `src/shared/pr-workflow.ts`                       | Phase from `fix_started_at`; `allowsAssignee` + copy                   |
| `src/main/services/pr-service.ts`                 | Remove auto-unassign                                                   |
| `src/main/ipc/prs.ts`                             | `prs:create` assignee; assign gating                                   |
| `src/main/ipc/mcp.ts`                             | Dialog-driven launch/copy handlers; stamp on launch                    |
| `src/main/fix-launcher.ts`                        | New — pure per-terminal command construction                           |
| `src/main/integrations.ts`                        | Install second skill (create PR)                                       |
| `src/mcp-server/tools.ts`                         | `create_pr`; `complete_assignment` change                              |
| `src/renderer/src/screens/OpenPR.tsx`             | Assignee picker                                                        |
| `src/renderer/src/screens/PR.tsx`                 | Start fix button, dialog wiring, dropdown to change-only               |
| `src/renderer/src/screens/Settings.tsx`           | Terminal picker                                                        |
| `src/renderer/src/components/ReviewPanel.tsx`     | Post-submit dialog trigger                                             |
| `src/renderer/src/components/SubmitFixDialog.tsx` | New — Start / Copy prompt / Later                                      |
| `src/preload/index.ts`                            | New/changed IPC surface                                                |

## Out of scope

- Widening the assignee enum so Cursor/Windsurf launch their own editor (follow-up).
- Windows/Linux terminal support (app launcher is macOS-only today).
- Pushing branches or any remote interaction from the create-PR skill.

# Auto-Fix Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRs carry their assignee from creation; submitting a review hands the fix straight to that assignee via a dialog, launched in the user's chosen terminal or copied to the clipboard; agents can create PRs through a new `create_pr` MCP tool.

**Architecture:** The review file gains a `fix_started_at` timestamp that replaces "submitted + assignee" as the `in_fix` phase signal. The launch command construction moves into a pure `fix-launcher` module keyed by a `terminal_app` setting. The MCP server (which reads the `.reviews/` store directly and uses its socket only for UI-refresh events) gains `create_pr`; `complete_assignment` now clears `fix_started_at` instead of the assignee.

**Tech Stack:** Electron (main + preload + React renderer), zod-validated JSON file store, better-sqlite3 settings, vitest (`main` node project + `renderer` jsdom project with Testing Library), MCP SDK server bundle.

**Spec:** `docs/superpowers/specs/2026-08-27-auto-fix-workflow-design.md`

## Global Constraints

- macOS only for terminal launching (matches the existing launcher).
- Assignee values stay `'claude' | 'vscode' | null`; `null` means "Me — fix manually".
- Cursor/Windsurf-created PRs map to `vscode`; widening the enum is out of scope.
- No new npm dependencies. Never run `npm install` — it is user-managed.
- Run tests with `--run` (the plain script starts watch mode): `npm run test:main -- --run <file>` / `npm run test:renderer -- --run <file>`.
- Commit after each task; lowercase imperative messages. Never push.
- Comments state why code does what it does; never reference other repos/teams.

---

### Task 1: `fix_started_at` on the review schema + store lifecycle methods

**Files:**

- Modify: `src/shared/review-store/schema.ts:30-39` (ReviewFileSchema)
- Modify: `src/shared/review-store/index.ts` (new methods after `reopenReview`, ~line 211)
- Test: `src/main/__tests__/review-store.test.ts`
- Modify (fixtures): `src/main/__tests__/pr-workflow.test.ts:24-35`, `src/renderer/src/__tests__/ReviewPanel.test.tsx:21-30` and any other `ReviewFile` literal `npm run typecheck` flags

**Interfaces:**

- Produces: `ReviewFile.fix_started_at: string | null`; `ReviewStore.startFix(repoPath, prId, reviewId): ReviewFile` (idempotent — stamps only when null, so Nudge re-launches never re-stamp); `ReviewStore.clearFixStarted(repoPath, prId, reviewId): ReviewFile`

- [ ] **Step 1: Write the failing tests**

Append to the `Reviews` describe block in `src/main/__tests__/review-store.test.ts` (reuse the existing `store`/`repoPath` setup; create the PR/review the same way neighbouring tests do):

```ts
describe('fix lifecycle', () => {
  function makeSubmittedReview(): { prId: string; reviewId: string } {
    const pr = store.createPR(repoPath, {
      title: 'T',
      description: null,
      base_branch: 'main',
      compare_branch: 'f',
    })
    const review = store.createReview(repoPath, pr.id, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    store.submitReview(repoPath, pr.id, review.id)
    return { prId: pr.id, reviewId: review.id }
  }

  it('new reviews start with fix_started_at null', () => {
    const { prId, reviewId } = makeSubmittedReview()
    expect(store.getReview(repoPath, prId, reviewId).fix_started_at).toBeNull()
  })

  it('startFix stamps the review once and is idempotent', () => {
    const { prId, reviewId } = makeSubmittedReview()
    const first = store.startFix(repoPath, prId, reviewId)
    expect(first.fix_started_at).not.toBeNull()
    const second = store.startFix(repoPath, prId, reviewId)
    expect(second.fix_started_at).toBe(first.fix_started_at)
  })

  it('clearFixStarted returns the review to not-started', () => {
    const { prId, reviewId } = makeSubmittedReview()
    store.startFix(repoPath, prId, reviewId)
    const cleared = store.clearFixStarted(repoPath, prId, reviewId)
    expect(cleared.fix_started_at).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- --run src/main/__tests__/review-store.test.ts`
Expected: FAIL — `store.startFix is not a function`

- [ ] **Step 3: Implement**

In `src/shared/review-store/schema.ts`, add to `ReviewFileSchema` after `submitted_at`:

```ts
  fix_started_at: z.string().nullable().optional().default(null),
```

In `src/shared/review-store/index.ts`, add `fix_started_at: null,` to the object literal in `createReview` (after `submitted_at: null,`), and add after `reopenReview`:

```ts
  /**
   * Records that the assignee's fix session began. Idempotent — a nudge or a
   * second copy of the prompt keeps the original start time.
   */
  startFix(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    if (review.fix_started_at !== null) return review
    const updated: ReviewFile = { ...review, fix_started_at: new Date().toISOString() }
    writeReview(repoPath, prId, updated)
    return updated
  }

  /** Marks the fix session ended, so an abandoned fix can be restarted. */
  clearFixStarted(repoPath: string, prId: string, reviewId: string): ReviewFile {
    const review = readReview(repoPath, prId, reviewId)
    const updated: ReviewFile = { ...review, fix_started_at: null }
    writeReview(repoPath, prId, updated)
    return updated
  }
```

Also update `reopenReview` to carry `fix_started_at: null` (a reopened review has by definition not started fixing — only `reviewed`-phase reviews can reopen).

- [ ] **Step 4: Fix fixture typecheck fallout**

The zod output type makes `fix_started_at` required on `ReviewFile`. Run `npm run typecheck`; add `fix_started_at: null,` to every flagged `ReviewFile` literal. Known sites: `makeReview` in `src/main/__tests__/pr-workflow.test.ts`, the `review` const in `src/renderer/src/__tests__/ReviewPanel.test.tsx` (its `submittedReview` spreads `review` so inherits the field). Casts (`as ReviewFile`) don't fail typecheck — add the field there too so behaviour tests stay truthful.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:main -- --run src/main/__tests__/review-store.test.ts` and `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/review-store src/main/__tests__ src/renderer/src/__tests__
git commit -m "feat: record fix session start on the review"
```

---

### Task 2: legacy migration — stamp `fix_started_at` for PRs mid-fix at upgrade

**Files:**

- Modify: `src/shared/review-store/index.ts:131-141` (`listReviews`)
- Test: `src/main/__tests__/review-store.test.ts`

**Interfaces:**

- Consumes: `startFix`/`fix_started_at` from Task 1
- Produces: `listReviews` self-migrates old data; all phase-derivation paths (`getActiveReview`, `getInProgressReview`, pr-service) flow through it

- [ ] **Step 1: Write the failing tests**

Append to the `fix lifecycle` describe block:

```ts
it('migrates a legacy mid-fix review: assignment after submit implies the fix started', () => {
  const { prId, reviewId } = makeSubmittedReview()
  // Legacy flow: the agent was assigned after the review was submitted
  const pr = store.assignPR(repoPath, prId, 'claude')

  const [migrated] = store.listReviews(repoPath, prId)
  expect(migrated.fix_started_at).toBe(pr.assigned_at)
  // Persisted, not just derived
  expect(store.getReview(repoPath, prId, reviewId).fix_started_at).toBe(pr.assigned_at)
})

it('does not migrate a new-model review: assignment at creation predates the submit', () => {
  const pr = store.createPR(repoPath, {
    title: 'T',
    description: null,
    base_branch: 'main',
    compare_branch: 'f',
    assignee: 'claude',
  })
  const review = store.createReview(repoPath, pr.id, {
    base_sha: 'a'.repeat(40),
    compare_sha: 'b'.repeat(40),
  })
  store.submitReview(repoPath, pr.id, review.id)

  const [fresh] = store.listReviews(repoPath, pr.id)
  expect(fresh.fix_started_at).toBeNull()
})
```

Note: the second test needs Task 3's `assignee` on `CreatePRArgs`. Write it now with the field; it drives Task 3's store change. If executing strictly task-by-task, temporarily use `store.createPR(...)` without `assignee` followed by `store.assignPR` **before** `createReview`+`submitReview` — but since `assignPR` stamps `assigned_at` at call time (before the submit), that also exercises "assigned before submit → no migration". Prefer the simpler pre-Task-3 variant:

```ts
const pr0 = store.createPR(repoPath, {
  title: 'T',
  description: null,
  base_branch: 'main',
  compare_branch: 'f',
})
const pr = store.assignPR(repoPath, pr0.id, 'claude')
// ...createReview + submitReview as above, then expect null
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- --run src/main/__tests__/review-store.test.ts`
Expected: FAIL — `migrated.fix_started_at` is `null`

- [ ] **Step 3: Implement**

Replace `listReviews` in `src/shared/review-store/index.ts`:

```ts
  listReviews(repoPath: string, prId: string): ReviewFile[] {
    let pr: PRFile | null = null
    try {
      pr = readPR(repoPath, prId)
    } catch {
      pr = null
    }
    return listReviewIds(repoPath, prId)
      .flatMap((reviewId) => {
        try {
          return [this.migrateFixStarted(repoPath, prId, pr, readReview(repoPath, prId, reviewId))]
        } catch {
          return []
        }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  /**
   * Data written before fix_started_at existed signalled an active fix by
   * assigning the agent after submission. Stamp those reviews once so the
   * phase they were in survives the upgrade; new-model PRs are assigned at
   * creation, before any submit, so they never match.
   */
  private migrateFixStarted(
    repoPath: string,
    prId: string,
    pr: PRFile | null,
    review: ReviewFile
  ): ReviewFile {
    const legacyMidFix =
      review.status === 'submitted' &&
      review.fix_started_at === null &&
      review.submitted_at !== null &&
      pr?.assignee != null &&
      pr.assigned_at !== null &&
      pr.assigned_at > review.submitted_at
    if (!legacyMidFix) return review
    const updated: ReviewFile = { ...review, fix_started_at: pr!.assigned_at }
    writeReview(repoPath, prId, updated)
    return updated
  }
```

(ISO-8601 UTC strings compare correctly with `>`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- --run src/main/__tests__/review-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/review-store/index.ts src/main/__tests__/review-store.test.ts
git commit -m "feat: migrate legacy mid-fix reviews to fix_started_at"
```

---

### Task 3: assignee at creation (store, types, IPC, preload, mock api)

**Files:**

- Modify: `src/shared/review-store/index.ts:17-22` (`CreatePRArgs`), `:58-76` (`createPR`)
- Modify: `src/shared/types.ts:54-60` (`CreatePrPayload`)
- Modify: `src/main/ipc/prs.ts:48-63` (`prs:create`)
- Modify: `src/preload/index.ts:44-45` (type only — payload widens)
- Modify: `src/renderer/src/__tests__/helpers/mock-api.ts` (no change needed for createPr; leave as-is)
- Test: `src/main/__tests__/review-store.test.ts`

**Interfaces:**

- Produces: `CreatePRArgs.assignee?: 'claude' | 'vscode' | null`; `CreatePrPayload.assignee: 'claude' | 'vscode' | null`; `createPR` sets `assignee` and `assigned_at = created_at` when non-null

- [ ] **Step 1: Write the failing test**

In the `PRs` describe block of `review-store.test.ts`:

```ts
it('createPR stores the assignee chosen at creation', () => {
  const pr = store.createPR(repoPath, {
    title: 'T',
    description: null,
    base_branch: 'main',
    compare_branch: 'f',
    assignee: 'claude',
  })
  expect(pr.assignee).toBe('claude')
  expect(pr.assigned_at).toBe(pr.created_at)

  const unassigned = store.createPR(repoPath, {
    title: 'U',
    description: null,
    base_branch: 'main',
    compare_branch: 'g',
  })
  expect(unassigned.assignee).toBeNull()
  expect(unassigned.assigned_at).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- --run src/main/__tests__/review-store.test.ts`
Expected: FAIL — `pr.assignee` is `null` (and typecheck of the literal flags `assignee`)

- [ ] **Step 3: Implement**

`CreatePRArgs` gains `assignee?: 'claude' | 'vscode' | null`. In `createPR`, replace `assignee: null, assigned_at: null,` with:

```ts
      assignee: args.assignee ?? null,
      assigned_at: args.assignee ? now : null,
```

`CreatePrPayload` in `src/shared/types.ts` gains `assignee: 'claude' | 'vscode' | null`. In `prs:create` (`src/main/ipc/prs.ts`), pass it through:

```ts
return store.createPR(payload.repoPath, {
  title: payload.title,
  description: payload.description,
  base_branch: payload.baseBranch,
  compare_branch: payload.compareBranch,
  assignee: payload.assignee ?? null,
})
```

Preload needs no code change (`createPr` is typed by `CreatePrPayload`). Update Task 2's second test to the `assignee: 'claude'` creation form now that it compiles.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test:main -- --run src/main/__tests__/review-store.test.ts` and `npm run typecheck`
Expected: PASS — typecheck will flag the `createPr` call in `OpenPR.tsx` missing `assignee`; add `assignee: null,` to that payload for now (Task 10 replaces it with the picker value).

- [ ] **Step 5: Commit**

```bash
git add src/shared src/main/ipc/prs.ts src/renderer/src/screens/OpenPR.tsx src/main/__tests__/review-store.test.ts
git commit -m "feat: choose the PR assignee at creation"
```

---

### Task 4: workflow — phase from `fix_started_at`, assignment gating inverts

**Files:**

- Modify: `src/shared/pr-workflow.ts:39-54` (`derive`), `:68-71` (`allowsAssignee`), `:121-132` (`assignDeniedReason`)
- Modify: `src/main/ipc/prs.ts:156-173` (`prs:assign` — gate all changes, not only non-null)
- Test: `src/main/__tests__/pr-workflow.test.ts`

**Interfaces:**

- Consumes: `ReviewFile.fix_started_at` (Task 1)
- Produces: `in_fix` ⇔ submitted review with `fix_started_at`; `allowsAssignee()` true in every phase except `in_fix` and `closed`

- [ ] **Step 1: Update fixtures and write the failing tests**

In `pr-workflow.test.ts`, extend `makeReview` so tests can express a started fix:

```ts
function makeReview(status: ReviewFile['status'], overrides: Partial<ReviewFile> = {}): ReviewFile {
  return {
    version: 1,
    id: '00000000-0000-4000-8000-000000000000',
    status,
    base_sha: 'a'.repeat(40),
    compare_sha: 'b'.repeat(40),
    created_at: new Date().toISOString(),
    submitted_at: status === 'in_progress' ? null : new Date().toISOString(),
    fix_started_at: null,
    comments: [],
    ...overrides,
  } as ReviewFile
}
```

Update the two existing tests that derive `in_fix` from an assignee:

- `allowsManualResolve` › "allows resolving while an agent is assigned (in_fix)": use `makePr({ assignee: 'claude' })` with `makeReview('submitted', { fix_started_at: new Date().toISOString() })`.
- `allowsReopenReview` › "denies reopening while an agent is assigned": same review override.

Add a new describe block:

```ts
describe('PRWorkflow phase from fix_started_at', () => {
  it('a submitted review with an assignee but no started fix is reviewed', () => {
    const wf = new PRWorkflow(makePr({ assignee: 'claude' }), makeReview('submitted'))
    expect(wf.phase).toBe('reviewed')
  })

  it('a submitted review with a started fix is in_fix', () => {
    const wf = new PRWorkflow(
      makePr({ assignee: 'claude' }),
      makeReview('submitted', { fix_started_at: new Date().toISOString() })
    )
    expect(wf.phase).toBe('in_fix')
  })
})

describe('PRWorkflow.allowsAssignee', () => {
  it('allows changing the assignee before and during review', () => {
    expect(new PRWorkflow(makePr(), null).allowsAssignee()).toBe(true)
    expect(new PRWorkflow(makePr(), makeReview('in_progress')).allowsAssignee()).toBe(true)
    expect(new PRWorkflow(makePr(), makeReview('submitted')).allowsAssignee()).toBe(true)
    expect(new PRWorkflow(makePr(), makeReview('complete')).allowsAssignee()).toBe(true)
  })

  it('denies changing the assignee mid-fix and on closed PRs', () => {
    const midFix = new PRWorkflow(
      makePr({ assignee: 'claude' }),
      makeReview('submitted', { fix_started_at: new Date().toISOString() })
    )
    expect(midFix.allowsAssignee()).toBe(false)
    expect(
      new PRWorkflow(makePr({ status: 'closed' }), makeReview('submitted')).allowsAssignee()
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- --run src/main/__tests__/pr-workflow.test.ts`
Expected: FAIL — phase derives from `pr.assignee`

- [ ] **Step 3: Implement**

In `derive`, replace the final line:

```ts
// review.status === 'submitted'
return review.fix_started_at !== null ? 'in_fix' : 'reviewed'
```

Replace `allowsAssignee` (the assignee is a property of the PR now, changeable except while a fix runs):

```ts
  /** The assignee can be changed — except mid-fix, and never on a closed PR. */
  allowsAssignee(): boolean {
    return this.phase !== 'in_fix' && this.phase !== 'closed'
  }
```

Replace `assignDeniedReason`:

```ts
  static assignDeniedReason(phase: WorkflowPhase): string {
    if (phase === 'in_fix') {
      return 'The assignee is working on fixes. Wait for the fix round to finish before changing the assignee.'
    }
    if (phase === 'closed') {
      return 'This PR is closed.'
    }
    return 'Assignment is not permitted in the current state.'
  }
```

In `prs:assign` (`src/main/ipc/prs.ts`), gate every change including unassign — replace the `if (assignee !== null) { ... }` block with:

```ts
const pr = store.getPR(repoPath, prId)
const workflow = new PRWorkflow(pr, store.getActiveReview(repoPath, prId))
if (!workflow.allowsAssignee()) {
  return { error: PRWorkflow.assignDeniedReason(workflow.phase) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- --run src/main/__tests__/pr-workflow.test.ts` and the full main project `npm run test:main -- --run` (pr-service tests still pass because the migration keeps legacy semantics; the auto-complete test asserts `assignee` is nulled — that changes in Task 5, so if it fails here on `detail.pr.assignee`, proceed to Task 5 before committing both together — otherwise commit now).
Expected: pr-workflow PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/pr-workflow.ts src/main/ipc/prs.ts src/main/__tests__/pr-workflow.test.ts
git commit -m "feat: derive in_fix from fix_started_at and regate assignment"
```

---

### Task 5: pr-service — assignee survives review completion

**Files:**

- Modify: `src/main/services/pr-service.ts:119-133`
- Test: `src/main/__tests__/pr-service.test.ts:150-166`

**Interfaces:**

- Consumes: phase rules from Task 4
- Produces: completing a review leaves `pr.assignee` untouched

- [ ] **Step 1: Update the test to the new contract**

In "auto-completes a submitted review once every comment is addressed" (`pr-service.test.ts:150`): after `store.submitReview(...)` replace `store.assignPR(repoPath, prId, 'claude')` with:

```ts
store.assignPR(repoPath, prId, 'claude')
store.startFix(repoPath, prId, reviewId)
```

and replace `expect(detail.pr.assignee).toBeNull()` with:

```ts
expect(detail.pr.assignee).toBe('claude')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- --run src/main/__tests__/pr-service.test.ts`
Expected: FAIL — auto-unassign still nulls the assignee

- [ ] **Step 3: Implement**

In `getPrDetail` (`pr-service.ts`), delete the auto-unassign block inside the auto-complete branch:

```ts
store.completeReview(repoPath, prId, activeReview.id)
activeReview = null
```

(remove the `if (pr.assignee !== null) { pr = store.assignPR(repoPath, prId, null) }` lines and their comment). The assignee stays for the next review round.

- [ ] **Step 4: Run the full main suite**

Run: `npm run test:main -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/pr-service.ts src/main/__tests__/pr-service.test.ts
git commit -m "feat: keep the assignee when a review round completes"
```

---

### Task 6: `fix-launcher` — pure command construction + terminal detection

**Files:**

- Create: `src/main/fix-launcher.ts`
- Test: `src/main/__tests__/fix-launcher.test.ts`

**Interfaces:**

- Produces: `type TerminalApp = 'Terminal' | 'iTerm' | 'Ghostty'`; `buildFixPrompt(repoPath, prId, reviewId): string`; `buildLaunchCommand(terminal, repoPath, prompt): { command: string; args: string[] }`; `detectTerminals(): TerminalApp[]`

- [ ] **Step 1: Write the failing tests**

Create `src/main/__tests__/fix-launcher.test.ts`:

```ts
// src/main/__tests__/fix-launcher.test.ts
import { describe, it, expect } from 'vitest'
import { buildFixPrompt, buildLaunchCommand } from '../fix-launcher'

const repo = '/Users/me/my repo'
const prompt = '/local-code-review repo_path="/Users/me/my repo" pr_id="p1" review_id="r1"'

describe('buildFixPrompt', () => {
  it('produces the skill invocation line', () => {
    expect(buildFixPrompt(repo, 'p1', 'r1')).toBe(prompt)
  })
})

describe('buildLaunchCommand', () => {
  it('Terminal launches claude via osascript with argv-passed strings', () => {
    const { command, args } = buildLaunchCommand('Terminal', repo, prompt)
    expect(command).toBe('osascript')
    // repo and prompt travel as argv items, never interpolated into the script
    expect(args.slice(-2)).toEqual([repo, prompt])
    expect(args.join('\n')).toContain('tell application "Terminal"')
  })

  it('iTerm types the command into a new window session', () => {
    const { command, args } = buildLaunchCommand('iTerm', repo, prompt)
    expect(command).toBe('osascript')
    expect(args.slice(-2)).toEqual([repo, prompt])
    expect(args.join('\n')).toContain('tell application "iTerm"')
    expect(args.join('\n')).toContain('write text')
  })

  it('Ghostty opens a new window with the working directory and command as verbatim argv', () => {
    const { command, args } = buildLaunchCommand('Ghostty', repo, prompt)
    expect(command).toBe('open')
    expect(args).toEqual([
      '-na',
      'Ghostty',
      '--args',
      `--working-directory=${repo}`,
      '-e',
      'claude',
      prompt,
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- --run src/main/__tests__/fix-launcher.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement**

Create `src/main/fix-launcher.ts`:

```ts
// src/main/fix-launcher.ts
//
// Pure construction of the "fix with agent" launch commands, so each
// terminal's invocation is unit-testable without spawning anything.
import fs from 'fs'
import os from 'os'

export type TerminalApp = 'Terminal' | 'iTerm' | 'Ghostty'

export function buildFixPrompt(repoPath: string, prId: string, reviewId: string): string {
  return `/local-code-review repo_path="${repoPath}" pr_id="${prId}" review_id="${reviewId}"`
}

/**
 * repoPath and prompt travel as separate argv items so no shell ever
 * tokenises them. osascript quoting uses AppleScript's `quoted form of`;
 * `open --args` passes argv to the app verbatim.
 */
export function buildLaunchCommand(
  terminal: TerminalApp,
  repoPath: string,
  prompt: string
): { command: string; args: string[] } {
  if (terminal === 'Ghostty') {
    // Ghostty has no scripting interface for existing sessions — a new
    // window with -e running claude directly is the supported invocation.
    return {
      command: 'open',
      args: ['-na', 'Ghostty', '--args', `--working-directory=${repoPath}`, '-e', 'claude', prompt],
    }
  }
  if (terminal === 'iTerm') {
    return {
      command: 'osascript',
      args: [
        '-e',
        'on run argv',
        '-e',
        '  tell application "iTerm"',
        '-e',
        '    set newWindow to (create window with default profile)',
        '-e',
        '    tell current session of newWindow',
        '-e',
        '      write text ("cd " & quoted form of item 1 of argv & " && claude " & quoted form of item 2 of argv)',
        '-e',
        '    end tell',
        '-e',
        '  end tell',
        '-e',
        'end run',
        '--',
        repoPath,
        prompt,
      ],
    }
  }
  return {
    command: 'osascript',
    args: [
      '-e',
      'on run argv',
      '-e',
      '  tell application "Terminal" to do script ("cd " & quoted form of item 1 of argv & " && claude " & quoted form of item 2 of argv)',
      '-e',
      'end run',
      '--',
      repoPath,
      prompt,
    ],
  }
}

const TERMINAL_APP_PATHS: Record<TerminalApp, string[]> = {
  Terminal: ['/System/Applications/Utilities/Terminal.app', '/Applications/Utilities/Terminal.app'],
  iTerm: ['/Applications/iTerm.app'],
  Ghostty: ['/Applications/Ghostty.app'],
}

export function detectTerminals(): TerminalApp[] {
  const home = os.homedir()
  return (Object.keys(TERMINAL_APP_PATHS) as TerminalApp[]).filter((app) =>
    [
      ...TERMINAL_APP_PATHS[app],
      `${home}/Applications/${app === 'iTerm' ? 'iTerm' : app}.app`,
    ].some((p) => fs.existsSync(p))
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- --run src/main/__tests__/fix-launcher.test.ts`
Expected: PASS

- [ ] **Step 5: Manually verify the Ghostty invocation (spec-mandated)**

Run once in a shell (Ghostty is installed on this machine):

```bash
open -na Ghostty --args --working-directory="$HOME" -e claude --version
```

Expected: a new Ghostty window opens and runs `claude --version`. If Ghostty rejects the multi-word `-e` form, STOP and report — the Ghostty branch needs `-e` to receive the command; consult `ghostty +help` output before adapting, and record the working form in the code comment.

- [ ] **Step 6: Commit**

```bash
git add src/main/fix-launcher.ts src/main/__tests__/fix-launcher.test.ts
git commit -m "feat: pure fix-launch command construction with terminal detection"
```

---

### Task 7: IPC — terminal-aware launch, copy-prompt, terminals list

**Files:**

- Modify: `src/main/ipc/mcp.ts`
- Modify: `src/preload/index.ts` (new `copyFixPrompt`, `listTerminals`)
- Modify: `src/renderer/src/__tests__/helpers/mock-api.ts` (stub the two new calls)

**Interfaces:**

- Consumes: `buildFixPrompt`/`buildLaunchCommand`/`detectTerminals`/`TerminalApp` (Task 6), `ReviewStore.startFix` (Task 1), `getSetting` (`src/main/db/settings.ts`)
- Produces: `fix:launch` reads the `terminal_app` setting and stamps `startFix`; new channels `fix:copy-prompt` → `{ prompt?: string; error?: string }` and `terminals:list` → `TerminalApp[]`; preload `copyFixPrompt(repoPath, prId, reviewId)`, `listTerminals()`

No unit test target: this layer stays thin (guard, delegate, map errors) per the repo's IPC convention; behaviour lives in Tasks 1 and 6. Verified end-to-end in Task 15.

- [ ] **Step 1: Implement the handlers**

In `src/main/ipc/mcp.ts`, add imports and a store instance:

```ts
import { getSetting } from '../db/settings'
import { ReviewStore } from '../../shared/review-store'
import { buildFixPrompt, buildLaunchCommand, detectTerminals } from '../fix-launcher'
import type { TerminalApp } from '../fix-launcher'
```

```ts
const store = new ReviewStore()
```

Replace the whole `fix:launch` handler and add the two new ones inside `registerMcpHandlers`:

```ts
ipcMain.handle('terminals:list', () => detectTerminals())

// "Fix with" launcher — starts the assignee's fix session. Stamping
// fix_started_at here (idempotently) keeps the phase and the action in
// one place, so they can never disagree; a nudge re-launches without
// moving the original start time.
ipcMain.handle(
  'fix:launch',
  (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
    try {
      assertKnownRepo(db, repoPath)
    } catch (err) {
      return { error: (err as Error).message }
    }

    const prompt = buildFixPrompt(repoPath, prId, reviewId)

    if (tool === 'claude') {
      const saved = getSetting(db, 'terminal_app') as TerminalApp | null
      const terminal: TerminalApp = saved ?? 'Terminal'
      const { command, args } = buildLaunchCommand(terminal, repoPath, prompt)
      spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
      store.startFix(repoPath, prId, reviewId)
      return {}
    }

    if (tool === 'vscode') {
      clipboard.writeText(prompt)
      // Delay opening VS Code so the user has time to read the dialog
      setTimeout(() => {
        spawn('open', ['-a', 'Visual Studio Code', repoPath], {
          detached: true,
          stdio: 'ignore',
        }).unref()
      }, 5_000)
      store.startFix(repoPath, prId, reviewId)
      return { prompt }
    }

    return { error: `Unknown tool: ${tool}` }
  }
)

// Manual path: the user drives the same fix from their own agent session,
// so copying counts as starting.
ipcMain.handle('fix:copy-prompt', (_e, repoPath: string, prId: string, reviewId: string) => {
  try {
    assertKnownRepo(db, repoPath)
  } catch (err) {
    return { error: (err as Error).message }
  }
  const prompt = buildFixPrompt(repoPath, prId, reviewId)
  clipboard.writeText(prompt)
  store.startFix(repoPath, prId, reviewId)
  return { prompt }
})
```

- [ ] **Step 2: Preload + mock api**

In `src/preload/index.ts` after `launchFix`:

```ts
  copyFixPrompt: (
    repoPath: string,
    prId: string,
    reviewId: string
  ): Promise<{ prompt?: string; error?: string }> =>
    ipcRenderer.invoke('fix:copy-prompt', repoPath, prId, reviewId),

  listTerminals: (): Promise<string[]> => ipcRenderer.invoke('terminals:list'),
```

In `mock-api.ts` next to `launchFix`:

```ts
    copyFixPrompt: vi.fn().mockResolvedValue({ prompt: '/local-code-review …' }),
    listTerminals: vi.fn().mockResolvedValue(['Terminal']),
```

- [ ] **Step 3: Typecheck and run suites**

Run: `npm run typecheck && npm run test:main -- --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/mcp.ts src/preload/index.ts src/renderer/src/__tests__/helpers/mock-api.ts
git commit -m "feat: terminal-aware fix launch with copy-prompt path"
```

---

### Task 8: `SubmitFixDialog` + ReviewPanel post-submit trigger

**Files:**

- Create: `src/renderer/src/components/SubmitFixDialog.tsx`
- Create: `src/renderer/src/components/SubmitFixDialog.module.css`
- Modify: `src/renderer/src/components/ReviewPanel.tsx`
- Test: `src/renderer/src/__tests__/SubmitFixDialog.test.tsx`
- Test: `src/renderer/src/__tests__/ReviewPanel.test.tsx`

**Interfaces:**

- Consumes: `window.api.launchFix`, `window.api.copyFixPrompt`, `window.api.getPr`
- Produces: `SubmitFixDialog` props `{ assignee: 'claude' | 'vscode'; commentCount: number; repoPath: string; prId: string; reviewId: string; onClose: () => void; onUpdated: (detail: PrDetail | null) => void }` — Task 9 reuses it for the Start-fix button

- [ ] **Step 1: Write the failing dialog tests**

Create `src/renderer/src/__tests__/SubmitFixDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubmitFixDialog from '../components/SubmitFixDialog'
import { installMockApi } from './helpers/mock-api'

function renderDialog(overrides: Record<string, unknown> = {}) {
  const api = installMockApi(overrides)
  const onClose = vi.fn()
  const onUpdated = vi.fn()
  render(
    <SubmitFixDialog
      assignee="claude"
      commentCount={3}
      repoPath="/repo"
      prId="pr1"
      reviewId="rev1"
      onClose={onClose}
      onUpdated={onUpdated}
    />
  )
  return { api, onClose, onUpdated }
}

describe('SubmitFixDialog', () => {
  it('offers start, copy, and later for the assigned agent', () => {
    renderDialog()
    expect(
      screen.getByRole('dialog', { name: /start fixing review comments/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/claude code is assigned to fix 3 comments/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start fix/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy prompt/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument()
  })

  it('start fix launches the agent, refreshes the PR, and closes', async () => {
    const { api, onClose, onUpdated } = renderDialog({
      launchFix: vi.fn().mockResolvedValue({}),
      getPr: vi.fn().mockResolvedValue(null),
    })
    await userEvent.click(screen.getByRole('button', { name: /start fix/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.launchFix).toHaveBeenCalledWith('claude', '/repo', 'pr1', 'rev1')
    expect(onUpdated).toHaveBeenCalled()
  })

  it('copy prompt shows paste instructions instead of closing', async () => {
    const { api, onClose } = renderDialog({
      copyFixPrompt: vi.fn().mockResolvedValue({ prompt: '/local-code-review x' }),
    })
    await userEvent.click(screen.getByRole('button', { name: /copy prompt/i }))
    expect(await screen.findByText(/prompt copied to clipboard/i)).toBeInTheDocument()
    expect(api.copyFixPrompt).toHaveBeenCalledWith('/repo', 'pr1', 'rev1')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('later closes without starting anything', async () => {
    const { api, onClose } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /later/i }))
    expect(onClose).toHaveBeenCalled()
    expect(api.launchFix).not.toHaveBeenCalled()
    expect(api.copyFixPrompt).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:renderer -- --run src/renderer/src/__tests__/SubmitFixDialog.test.tsx`
Expected: FAIL — component does not exist

- [ ] **Step 3: Implement the dialog**

Create `src/renderer/src/components/SubmitFixDialog.tsx`:

```tsx
import { useState } from 'react'
import type { PrDetail } from '../../../shared/types'
import styles from './SubmitFixDialog.module.css'

interface Props {
  assignee: 'claude' | 'vscode'
  commentCount: number
  repoPath: string
  prId: string
  reviewId: string
  onClose: () => void
  onUpdated: (detail: PrDetail | null) => void
}

const AGENT_LABEL = { claude: 'Claude Code', vscode: 'Copilot (VS Code)' } as const

export default function SubmitFixDialog({
  assignee,
  commentCount,
  repoPath,
  prId,
  reviewId,
  onClose,
  onUpdated,
}: Props): JSX.Element {
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    const updated = await window.api.getPr(repoPath, prId)
    onUpdated(updated && 'error' in updated ? null : updated)
  }

  async function handleStart(): Promise<void> {
    setStarting(true)
    setError('')
    const result = await window.api.launchFix(assignee, repoPath, prId, reviewId)
    if (result.error) {
      setError(result.error)
      setStarting(false)
      return
    }
    await refresh()
    if (result.prompt) {
      // VS Code path: the launch copies the prompt for pasting into the
      // agent tab, so the dialog stays open with the instructions.
      setCopiedPrompt(result.prompt)
      setStarting(false)
      return
    }
    onClose()
  }

  async function handleCopy(): Promise<void> {
    setError('')
    const result = await window.api.copyFixPrompt(repoPath, prId, reviewId)
    if (result.error) {
      setError(result.error)
      return
    }
    await refresh()
    setCopiedPrompt(result.prompt ?? '')
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label="Start fixing review comments">
      <div className={styles.dialog}>
        {copiedPrompt === null ? (
          <>
            <h3 className={styles.title}>Review submitted</h3>
            <p className={styles.body}>
              {AGENT_LABEL[assignee]} is assigned to fix {commentCount} comment
              {commentCount !== 1 ? 's' : ''}.
            </p>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <button onClick={onClose}>Later</button>
              <button onClick={handleCopy}>Copy prompt</button>
              <button className="primary" onClick={handleStart} disabled={starting}>
                {starting ? 'Starting…' : 'Start fix'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className={styles.title}>Prompt copied to clipboard</h3>
            <p className={styles.body}>
              {assignee === 'vscode'
                ? 'VS Code is opening. Switch to the Copilot agent tab and paste the prompt to start the fix.'
                : 'Paste it into a Claude Code session running in this repository to start the fix.'}
            </p>
            <div className={styles.actions}>
              <button onClick={() => navigator.clipboard.writeText(copiedPrompt)}>
                Copy again
              </button>
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

Create `src/renderer/src/components/SubmitFixDialog.module.css` (mirrors the popup styling the vscode modal used — check `PR.module.css` `.vscodePopupOverlay`/`.vscodePopup` values and reuse their colors/vars):

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #1f2328);
  border-radius: 10px;
  padding: 20px 24px;
  width: 420px;
  max-width: calc(100vw - 48px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.title {
  margin: 0 0 8px;
  font-size: 15px;
}

.body {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary, #57606a);
}

.error {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--danger, #cf222e);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

(Adjust the custom-property names to whatever `PR.module.css` actually uses — copy them from the `.vscodePopup` rules so the dialog matches the app theme.)

- [ ] **Step 4: Wire ReviewPanel**

In `ReviewPanel.tsx`: import the dialog and `useState` entry:

```tsx
import SubmitFixDialog from './SubmitFixDialog'
```

```tsx
const [fixDialog, setFixDialog] = useState<{
  assignee: 'claude' | 'vscode'
  reviewId: string
  count: number
} | null>(null)
```

In `handleSubmit`, after `onSubmitted(updated as PrDetail | null)`:

```tsx
const submittedPr = (updated as PrDetail | null)?.pr
if (submittedPr?.assignee) {
  setFixDialog({ assignee: submittedPr.assignee, reviewId: review.id, count: nonStale.length })
}
```

At the end of the panel JSX (before the closing `</div>`):

```tsx
{
  fixDialog && (
    <SubmitFixDialog
      assignee={fixDialog.assignee}
      commentCount={fixDialog.count}
      repoPath={repoPath}
      prId={prId}
      reviewId={fixDialog.reviewId}
      onClose={() => setFixDialog(null)}
      onUpdated={onSubmitted}
    />
  )
}
```

- [ ] **Step 5: Add the ReviewPanel behaviour test**

In `ReviewPanel.test.tsx` (following the existing submit-flow test pattern at the bottom of the file — it uses `installMockApi`, `userEvent`, `waitFor`): add

```tsx
describe('ReviewPanel post-submit fix dialog', () => {
  it('opens the fix dialog after submitting when an agent is assigned', async () => {
    const assignedPr = { ...pr, assignee: 'claude' as const, assigned_at: pr.created_at }
    installMockApi({
      submitReview: vi.fn().mockResolvedValue({ ...review, status: 'submitted' }),
      getPr: vi.fn().mockResolvedValue({
        pr: assignedPr,
        diff: [],
        review: { ...review, status: 'submitted' },
        reviews: [],
        reviewCommitCounts: {},
        isStale: false,
      }),
    })
    render(
      <ReviewPanel
        pr={assignedPr}
        review={review}
        reviews={[review]}
        comments={comments}
        prId="pr1"
        repoPath="/repo"
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }))
    expect(
      await screen.findByRole('dialog', { name: /start fixing review comments/i })
    ).toBeInTheDocument()
  })

  it('does not open the dialog when the PR has no assignee', async () => {
    installMockApi({
      submitReview: vi.fn().mockResolvedValue({ ...review, status: 'submitted' }),
      getPr: vi.fn().mockResolvedValue({
        pr,
        diff: [],
        review: { ...review, status: 'submitted' },
        reviews: [],
        reviewCommitCounts: {},
        isStale: false,
      }),
    })
    render(
      <ReviewPanel
        pr={pr}
        review={review}
        reviews={[review]}
        comments={comments}
        prId="pr1"
        repoPath="/repo"
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /start fixing/i })).not.toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 6: Run renderer suites**

Run: `npm run test:renderer -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/SubmitFixDialog.tsx src/renderer/src/components/SubmitFixDialog.module.css src/renderer/src/components/ReviewPanel.tsx src/renderer/src/__tests__
git commit -m "feat: post-submit dialog starts the assignee's fix"
```

---

### Task 9: PR screen — Start fix button, change-only assignee dropdown

**Files:**

- Modify: `src/renderer/src/screens/PR.tsx` (`handleAssign` ~316, `handleNudge` ~337, sidebar `Assignees` section ~888-981, `vscodePrompt` modal ~1232-1253 and its state at 170)

**Interfaces:**

- Consumes: `SubmitFixDialog` (Task 8), new `allowsAssignee` semantics (Task 4)

- [ ] **Step 1: Rework the handlers**

`handleAssign` no longer launches (assigning is choosing the colleague, not starting work) and surfaces gate errors:

```tsx
async function handleAssign(tool: 'claude' | 'vscode'): Promise<void> {
  if (!repo || !prId) return
  setAssigneeDropdownOpen(false)
  const result = await window.api.assignPr(repo.path, prId, tool)
  if ('error' in result) {
    showNotification(result.error)
    return
  }
  const updated = await window.api.getPr(repo.path, prId)
  if (isPrDetail(updated)) setPrDetail(updated)
}
```

`handleNudge`: replace `if (result?.prompt) setVscodePrompt(result.prompt)` with

```tsx
if (result?.prompt) showNotification('Prompt copied — paste it into the agent to nudge the fix.')
```

Delete the `vscodePrompt` state (line ~170) and the `{vscodePrompt && (...)}` modal JSX (~1232-1253); the dialog's copied state replaced it. Add dialog state:

```tsx
const [showFixDialog, setShowFixDialog] = useState(false)
```

and import `SubmitFixDialog`.

- [ ] **Step 2: Rework the sidebar section**

The section must stay visible during `in_fix` (it hosts the chip and Nudge), so change its wrapper from `{workflow.allowsAssignee() && (` to `{pr.status === 'open' && (`. Inside:

- The "Click to assign" button and the assignee chip only toggle the dropdown when changes are allowed: `onClick={() => workflow.allowsAssignee() && setAssigneeDropdownOpen((o) => !o)}`; hide the caret when `!workflow.allowsAssignee()`.
- Relabel the "Unassign" item to `Me (fix manually)` — same `handleUnassign`.
- Keep Nudge, but render it only during the fix: `{workflow.phase === 'in_fix' && (<button className={styles.nudgeBtn} onClick={handleNudge}>Nudge</button>)}`.
- Add the Start fix button after the dropdown wrap, shown when a submitted review awaits its assigned agent:

```tsx
{
  workflow.phase === 'reviewed' && pr.assignee && prDetail.review && (
    <button className={`primary ${styles.startFixBtn}`} onClick={() => setShowFixDialog(true)}>
      Start fix
    </button>
  )
}
```

Add `.startFixBtn { width: 100%; margin-top: 8px; }` to `PR.module.css` (delete the now-unused `.vscodePopup*` rules while there).

Render the dialog near the notification JSX at the bottom:

```tsx
{
  showFixDialog && pr.assignee && prDetail.review && (
    <SubmitFixDialog
      assignee={pr.assignee}
      commentCount={activeComments.filter((c) => c.status === 'open').length}
      repoPath={repo?.path ?? ''}
      prId={pr.id}
      reviewId={prDetail.review.id}
      onClose={() => setShowFixDialog(false)}
      onUpdated={(detail) => detail && setPrDetail(detail)}
    />
  )
}
```

- [ ] **Step 3: Typecheck and run renderer suites**

Run: `npm run typecheck && npm run test:renderer -- --run`
Expected: PASS (no renderer test renders the PR screen today; the dialog behaviour is covered by Task 8's component tests)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/PR.tsx src/renderer/src/screens/PR.module.css
git commit -m "feat: start-fix button and change-only assignee dropdown on the PR screen"
```

---

### Task 10: New PR form — assignee picker

**Files:**

- Modify: `src/renderer/src/screens/OpenPR.tsx`
- Test: `src/renderer/src/__tests__/OpenPR.test.tsx` (new)

**Interfaces:**

- Consumes: `CreatePrPayload.assignee` (Task 3)

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/__tests__/OpenPR.test.tsx` (mirrors `Repo.test.tsx` setup — `useStore.setState`, `MemoryRouter`, `installMockApi`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OpenPR from '../screens/OpenPR'
import { useStore } from '../store'
import { installMockApi } from './helpers/mock-api'

const repo = {
  id: 'r1',
  path: '/work/sample-repo',
  name: 'sample-repo',
  created_at: '2026-04-08T09:00:00Z',
  last_visited_at: null,
  pr_count: 0,
}

function renderOpenPr() {
  return render(
    <MemoryRouter initialEntries={['/repo/r1/new-pr']}>
      <Routes>
        <Route path="/repo/:repoId/new-pr" element={<OpenPR />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('OpenPR assignee picker', () => {
  beforeEach(() => {
    useStore.setState({ repos: [repo] })
    localStorage.clear()
  })

  it('offers Claude, Copilot, and Me, defaulting to Me', async () => {
    installMockApi({ listBranches: vi.fn().mockResolvedValue(['main', 'feature/x']) })
    renderOpenPr()
    const picker = await screen.findByRole('combobox', { name: /assignee/i })
    expect(picker).toHaveValue('me')
    expect(screen.getByRole('option', { name: /claude code/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /copilot/i })).toBeInTheDocument()
  })

  it('sends the chosen assignee with the create payload and remembers it', async () => {
    const api = installMockApi({
      listBranches: vi.fn().mockResolvedValue(['main', 'feature/x']),
      createPr: vi.fn().mockResolvedValue({ id: 'pr9' }),
    })
    renderOpenPr()
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /assignee/i }),
      'claude'
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /base branch/i }), 'main')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /compare branch/i }),
      'feature/x'
    )
    await userEvent.type(screen.getByLabelText(/title/i), 'My PR')
    await userEvent.click(screen.getByRole('button', { name: /create pull request/i }))
    await waitFor(() =>
      expect(api.createPr).toHaveBeenCalledWith(expect.objectContaining({ assignee: 'claude' }))
    )
    expect(localStorage.getItem('newPrAssignee')).toBe('claude')
  })
})
```

Note: the base/compare selects currently have no accessible name (label is a styled span, not `<label for>`); give all three selects `aria-label`s in Step 3 so the role+name queries work — `aria-label="Base branch"`, `aria-label="Compare branch"`, `aria-label="Assignee"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- --run src/renderer/src/__tests__/OpenPR.test.tsx`
Expected: FAIL — no assignee combobox

- [ ] **Step 3: Implement**

In `OpenPR.tsx`:

```tsx
type AssigneeChoice = 'claude' | 'vscode' | 'me'

function savedAssignee(): AssigneeChoice {
  const saved = localStorage.getItem('newPrAssignee')
  return saved === 'claude' || saved === 'vscode' || saved === 'me' ? saved : 'me'
}
```

```tsx
const [assignee, setAssignee] = useState<AssigneeChoice>(savedAssignee)
```

Field between the branch row and the title (inside the form, after the divider):

```tsx
<div className={styles.field}>
  <label className={styles.label} htmlFor="pr-assignee">
    Assignee
  </label>
  <select
    id="pr-assignee"
    aria-label="Assignee"
    value={assignee}
    onChange={(e) => {
      const choice = e.target.value as AssigneeChoice
      setAssignee(choice)
      localStorage.setItem('newPrAssignee', choice)
    }}
  >
    <option value="me">Me — fix manually</option>
    <option value="claude">Claude Code</option>
    <option value="vscode">Copilot (VS Code)</option>
  </select>
  <span className={styles.fieldHint}>Who fixes review comments on this pull request</span>
</div>
```

In the `createPr` payload, replace the Task 3 placeholder `assignee: null` with:

```tsx
        assignee: assignee === 'me' ? null : assignee,
```

Add `aria-label="Base branch"` / `aria-label="Compare branch"` to the two branch selects.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:renderer -- --run src/renderer/src/__tests__/OpenPR.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/screens/OpenPR.tsx src/renderer/src/__tests__/OpenPR.test.tsx
git commit -m "feat: assignee picker on the new PR form"
```

---

### Task 11: Settings — terminal picker

**Files:**

- Modify: `src/renderer/src/screens/Settings.tsx` (new section after "MCP Integrations", ~line 195)
- Test: `src/renderer/src/__tests__/Settings.test.tsx` (create if absent; if a Settings test already exists, extend it)

**Interfaces:**

- Consumes: `window.api.listTerminals`, `window.api.getSetting`/`setSetting` (Task 7); the `terminal_app` key read by `fix:launch`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '../screens/Settings'
import { installMockApi } from './helpers/mock-api'

describe('Settings terminal picker', () => {
  beforeEach(() => localStorage.clear())

  it('lists installed terminals and saves the choice', async () => {
    const api = installMockApi({
      listTerminals: vi.fn().mockResolvedValue(['Terminal', 'Ghostty']),
      getSetting: vi.fn().mockResolvedValue(null),
    })
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )
    const picker = await screen.findByRole('combobox', { name: /terminal/i })
    expect(picker).toHaveValue('Terminal')
    await userEvent.selectOptions(picker, 'Ghostty')
    await waitFor(() => expect(api.setSetting).toHaveBeenCalledWith('terminal_app', 'Ghostty'))
  })
})
```

(If Settings needs more providers to render — check how existing screens are tested and mirror; `getSetting` is already stubbed by the mock api. Adjust the render wrapper to match whatever `Settings.tsx` requires, e.g. a `NavBar` route context.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:renderer -- --run src/renderer/src/__tests__/Settings.test.tsx`
Expected: FAIL — no terminal combobox

- [ ] **Step 3: Implement**

In `Settings.tsx` add state + effect:

```tsx
const [terminals, setTerminals] = useState<string[]>([])
const [terminalApp, setTerminalApp] = useState('Terminal')

useEffect(() => {
  window.api.listTerminals().then(setTerminals)
  window.api.getSetting('terminal_app').then((v) => {
    if (v) setTerminalApp(v)
  })
}, [])
```

New section (styled like the neighbouring `<h2>` sections):

```tsx
<section className={styles.section}>
  <h2>Terminal</h2>
  <p className={styles.sectionText}>
    Where “Start fix” opens Claude Code. Ghostty always opens a new window — use “Copy prompt” to
    reuse an existing session.
  </p>
  <select
    aria-label="Terminal"
    value={terminalApp}
    onChange={async (e) => {
      setTerminalApp(e.target.value)
      await window.api.setSetting('terminal_app', e.target.value)
    }}
  >
    {terminals.map((t) => (
      <option key={t} value={t}>
        {t === 'Terminal' ? 'Terminal.app' : t === 'iTerm' ? 'iTerm2' : t}
      </option>
    ))}
  </select>
</section>
```

(Match the actual section/class markup used by the surrounding sections in `Settings.tsx` — copy the wrapper structure of the "Scan directory" section.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:renderer -- --run src/renderer/src/__tests__/Settings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/screens/Settings.tsx src/renderer/src/__tests__/Settings.test.tsx
git commit -m "feat: terminal picker in settings"
```

---

### Task 12: MCP `create_pr` tool

**Files:**

- Modify: `src/mcp-server/tools.ts`
- Test: `src/main/__tests__/mcp-tools.test.ts` (new — the `main` vitest project includes only `src/main/__tests__`, and `tools.ts` imports cleanly under node)

**Interfaces:**

- Consumes: `ReviewStore.createPR` with `assignee` (Task 3); `SocketClient.emit` (`pr:updated`)
- Produces: MCP tool `create_pr(repo_path, title, description?, base_branch, compare_branch)` returning `{ success, pr_id, assignee }`

- [ ] **Step 1: Write the failing tests**

Create `src/main/__tests__/mcp-tools.test.ts`:

```ts
// src/main/__tests__/mcp-tools.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { callTool, buildTools } from '../../mcp-server/tools'
import type { SocketClient } from '../../mcp-server/socket-client'

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tools-test-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir })
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'],
    { cwd: dir }
  )
  execFileSync('git', ['branch', 'feature/x'], { cwd: dir })
  return dir
}

function resultJson(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text)
}

describe('create_pr', () => {
  let repoPath: string
  let socket: SocketClient

  beforeEach(() => {
    repoPath = makeGitRepo()
    socket = { emit: vi.fn() } as unknown as SocketClient
  })

  afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }))

  it('is advertised with its input schema', () => {
    const tool = buildTools().find((t) => t.name === 'create_pr')
    expect(tool).toBeDefined()
    expect(tool!.inputSchema.required).toEqual([
      'repo_path',
      'title',
      'base_branch',
      'compare_branch',
    ])
  })

  it('refuses a repository the app does not manage yet', async () => {
    const result = await callTool(
      'create_pr',
      {
        repo_path: repoPath,
        title: 'T',
        base_branch: 'main',
        compare_branch: 'feature/x',
      },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not set up in Local Code Review')
  })

  it('refuses an unknown branch', async () => {
    fs.mkdirSync(path.join(repoPath, '.reviews'))
    const result = await callTool(
      'create_pr',
      {
        repo_path: repoPath,
        title: 'T',
        base_branch: 'main',
        compare_branch: 'no-such-branch',
      },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Branch not found: no-such-branch')
  })

  it('creates the PR owned by the calling agent and notifies the app', async () => {
    fs.mkdirSync(path.join(repoPath, '.reviews'))
    const result = await callTool(
      'create_pr',
      {
        repo_path: repoPath,
        title: 'Add auth',
        description: 'Adds the auth middleware',
        base_branch: 'main',
        compare_branch: 'feature/x',
      },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBeUndefined()
    const data = resultJson(result)
    expect(data.assignee).toBe('claude')
    expect(socket.emit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pr:updated', repoPath, prId: data.pr_id })
    )

    const listed = await callTool(
      'get_pr',
      { repo_path: repoPath, pr_id: data.pr_id as string },
      socket,
      'Claude Code'
    )
    const pr = (resultJson(listed) as { pr: { assignee: string; assigned_at: string } }).pr
    expect(pr.assignee).toBe('claude')
    expect(pr.assigned_at).not.toBeNull()
  })

  it('maps VS Code-family identities to the vscode assignee', async () => {
    fs.mkdirSync(path.join(repoPath, '.reviews'))
    const result = await callTool(
      'create_pr',
      { repo_path: repoPath, title: 'T', base_branch: 'main', compare_branch: 'feature/x' },
      socket,
      'Copilot'
    )
    expect(resultJson(result).assignee).toBe('vscode')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:main -- --run src/main/__tests__/mcp-tools.test.ts`
Expected: FAIL — `Unknown tool: create_pr`

- [ ] **Step 3: Implement**

In `src/mcp-server/tools.ts` add imports:

```ts
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
```

Add the tool description to `buildTools()` (before `complete_assignment`):

```ts
    {
      name: 'create_pr',
      description:
        'Create a pull request in Local Code Review for two local branches. The repository must already be managed by the app. You become the PR assignee: after each review round is submitted you will be asked to fix the comments.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
          title: { type: 'string', description: 'Imperative summary of the change' },
          description: {
            type: 'string',
            description: 'Optional. What changed and why, derived from the branch commits.',
          },
          base_branch: { type: 'string', description: 'Branch to merge into' },
          compare_branch: { type: 'string', description: 'Branch with the changes' },
        },
        required: ['repo_path', 'title', 'base_branch', 'compare_branch'],
      },
    },
```

Add helpers above `callTool`:

```ts
// Claude Code / Claude Desktop identities own PRs as 'claude'; every VS
// Code-family tool maps to 'vscode' (the widest launcher currently modelled).
function identityToAssignee(identity: string): 'claude' | 'vscode' {
  return identity.startsWith('Claude') ? 'claude' : 'vscode'
}
```

Add the case in `callTool`:

```ts
      case 'create_pr': {
        // The .reviews/ directory is the file-side signal that the app
        // manages this repository — the MCP server cannot reach the app's
        // repo registry.
        if (!fs.existsSync(path.join(args.repo_path, '.reviews'))) {
          return err(
            'This repository is not set up in Local Code Review. Add it in the app first.'
          )
        }
        for (const branch of [args.base_branch, args.compare_branch]) {
          try {
            execFileSync('git', ['rev-parse', '--verify', `${branch}^{commit}`], {
              cwd: args.repo_path,
              stdio: 'pipe',
            })
          } catch {
            return err(`Branch not found: ${branch}`)
          }
        }
        const assignee = identityToAssignee(resolvedBy)
        const pr = store.createPR(args.repo_path, {
          title: args.title,
          description: args.description ?? null,
          base_branch: args.base_branch,
          compare_branch: args.compare_branch,
          assignee,
        })
        socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: pr.id })
        return ok({ success: true, pr_id: pr.id, assignee })
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- --run src/main/__tests__/mcp-tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server/tools.ts src/main/__tests__/mcp-tools.test.ts
git commit -m "feat: create_pr MCP tool assigns the creating agent"
```

---

### Task 13: `complete_assignment` ends the fix session

**Files:**

- Modify: `src/mcp-server/tools.ts:106-118` (description), `:223-230` (case)
- Test: `src/main/__tests__/mcp-tools.test.ts`

**Interfaces:**

- Consumes: `ReviewStore.clearFixStarted` (Task 1)
- Produces: `complete_assignment` clears `fix_started_at` on the submitted review and leaves `pr.assignee` untouched

- [ ] **Step 1: Write the failing test**

Append to `mcp-tools.test.ts`:

```ts
describe('complete_assignment', () => {
  it('ends the fix session without removing the assignee', async () => {
    const repoPath = makeGitRepo()
    fs.mkdirSync(path.join(repoPath, '.reviews'), { recursive: true })
    const socket = { emit: vi.fn() } as unknown as SocketClient
    const created = resultJson(
      await callTool(
        'create_pr',
        { repo_path: repoPath, title: 'T', base_branch: 'main', compare_branch: 'feature/x' },
        socket,
        'Claude Code'
      )
    )
    const prId = created.pr_id as string
    const { ReviewStore } = await import('../../shared/review-store')
    const store = new ReviewStore()
    const review = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    store.submitReview(repoPath, prId, review.id)
    store.startFix(repoPath, prId, review.id)

    const result = await callTool(
      'complete_assignment',
      { repo_path: repoPath, pr_id: prId },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBeUndefined()
    expect(store.getReview(repoPath, prId, review.id).fix_started_at).toBeNull()
    expect(store.getPR(repoPath, prId).assignee).toBe('claude')
    fs.rmSync(repoPath, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:main -- --run src/main/__tests__/mcp-tools.test.ts`
Expected: FAIL — `assignee` is `null` (old behaviour unassigns)

- [ ] **Step 3: Implement**

Replace the `complete_assignment` case:

```ts
      case 'complete_assignment': {
        // Ends the fix session rather than removing the assignee — the
        // assignee is a stable property of the PR. If open comments remain,
        // the PR returns to "reviewed" so the fix can be restarted.
        const reviews = store.listReviews(args.repo_path, args.pr_id)
        const submitted = reviews.find((r) => r.status === 'submitted')
        if (submitted) {
          store.clearFixStarted(args.repo_path, args.pr_id, submitted.id)
        }
        socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: args.pr_id })
        return ok({
          success: true,
          message: 'Assignment complete. The reviewer can see the work is done.',
        })
      }
```

Update the tool description in `buildTools()`:

```ts
      description:
        'Call this when you have finished addressing all open review issues. Signals to the reviewer that your fix session has ended.',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:main -- --run src/main/__tests__/mcp-tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server/tools.ts src/main/__tests__/mcp-tools.test.ts
git commit -m "feat: complete_assignment ends the fix session, keeps the assignee"
```

---

### Task 14: skills — install the create-PR skill, update fix-skill wording

**Files:**

- Modify: `src/main/integrations.ts`

**Interfaces:**

- Consumes: the `create_pr` tool contract (Task 12)
- Produces: `~/.claude/skills/local-code-review-create-pr/SKILL.md` (and the copilot ecosystem equivalent) installed by `installIntegrations`; `skillInstalled` true only when both skills are present, so upgraders are prompted to reinstall

- [ ] **Step 1: Implement**

Add below `SKILL_CONTENT`:

```ts
const CREATE_PR_SKILL_CONTENT = `---
name: local-code-review-create-pr
description: Open a pull request in Local Code Review for a local branch. Derives the title and description from the branch's commits and creates the PR via the local-code-review create_pr MCP tool. Use when asked to open or create a PR for local review.
compatibility: Requires git and the local-code-review MCP server to be running.
---

You are opening a pull request in Local Code Review.

## Workflow

1. Identify the branches
   - Compare branch: the current branch unless one is named
   - Base branch: main (or master), unless one is named

2. Understand the change
   \`\`\`bash
   git log --oneline <base>..<compare>
   git diff --stat <base>...<compare>
   \`\`\`

3. Derive title and description
   - Title: one imperative sentence summarising the change
   - Description: what changed and why, from the commits — plain language, no filler

4. Create the PR
   Call \`create_pr(repo_path, title, description, base_branch, compare_branch)\`.
   You become the PR's assignee: after each review is submitted you will be
   asked to fix the comments.

5. Report the created PR id and title.

## Rules

- Local branches only — never push, never touch remotes
- If create_pr reports the repository is not set up, tell the user to add it in the Local Code Review app and stop
`
```

Refactor the skill helpers to handle both skills:

```ts
const SKILLS: { dirName: string; content: string }[] = [
  { dirName: 'local-code-review', content: SKILL_CONTENT },
  { dirName: 'local-code-review-create-pr', content: CREATE_PR_SKILL_CONTENT },
]

function skillDir(ecosystem: 'claude' | 'copilot', dirName: string): string {
  const base =
    ecosystem === 'claude'
      ? path.join(home, '.claude', 'skills')
      : path.join(home, '.copilot', 'skills') // per Agent Skills spec (agentskills.io)
  return path.join(base, dirName)
}

function isSkillInstalled(ecosystem: 'claude' | 'copilot'): boolean {
  return SKILLS.every((skill) =>
    fs.existsSync(path.join(skillDir(ecosystem, skill.dirName), 'SKILL.md'))
  )
}

function installSkill(ecosystem: 'claude' | 'copilot'): void {
  for (const skill of SKILLS) {
    const dir = skillDir(ecosystem, skill.dirName)
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, 'SKILL.md')
    const tmp = dest + '.tmp'
    fs.writeFileSync(tmp, skill.content, 'utf8')
    fs.renameSync(tmp, dest)
  }
}
```

In `SKILL_CONTENT` (the fix skill), update Step 4's line "This unassigns you from the PR and signals to the reviewer that the work is done." to:

```
This signals to the reviewer that your fix session has ended.
```

- [ ] **Step 2: Typecheck and verify install manually**

Run: `npm run typecheck`
Expected: PASS. (No unit tests — `integrations.ts` imports `electron`'s `app` and has no existing suite; behaviour is a straight fs copy verified in Task 15's app run.)

- [ ] **Step 3: Commit**

```bash
git add src/main/integrations.ts
git commit -m "feat: install the create-pr skill alongside the fix skill"
```

---

### Task 15: full verification

- [ ] **Step 1: Run the complete gate**

```bash
npm run typecheck
npm run test:main -- --run
npm run test:renderer -- --run
npm run lint
npx prettier --check .
npm run build
```

Expected: every command exits 0. Fix anything that fails before proceeding (lint runs with `--fix`; re-stage and amend into the relevant commit or add a `chore: lint fixes` commit).

- [ ] **Step 2: Manual end-to-end pass (app run)**

Launch with `npm run dev` and walk the flow:

1. Create a PR with assignee **Claude Code** → sidebar shows the assignee immediately.
2. Add a comment, submit the review → dialog appears with Start fix / Copy prompt / Later.
3. **Later** → phase stays "Review submitted"; sidebar shows **Start fix**.
4. **Start fix** with Settings → Terminal set to **Ghostty** → a Ghostty window opens in the repo running `claude`; PR shows the in-fix phase; Nudge appears.
5. **Copy prompt** on a second PR → clipboard holds the `/local-code-review …` line; phase moves to in-fix.
6. In a `claude` session in a managed repo: ask it to open a PR → the create-pr skill calls `create_pr`; the PR appears in the app assigned to Claude.

- [ ] **Step 3: Commit any remaining fixes**

```bash
git status
```

Expected: clean tree; all work committed.

---

## Self-Review Notes

- Spec §Data model → Tasks 1, 2, 4, 5. §PR creation manual → Tasks 3, 10. §PR creation agent → Task 12. §Create PR skill → Task 14. §Submit flow → Tasks 7, 8, 9. §Launch mechanics → Tasks 6, 7, 11. §complete_assignment → Task 13. §UI cleanup → Task 9. §Testing → distributed per task. Ghostty manual verification → Task 6 Step 5 (spec-mandated, done before dependent UI work).
- `reopenReview` clearing `fix_started_at` (Task 1) is a spec-consistent tightening: reopen is only reachable in `reviewed`, where the field is already null; clearing keeps the invariant explicit.

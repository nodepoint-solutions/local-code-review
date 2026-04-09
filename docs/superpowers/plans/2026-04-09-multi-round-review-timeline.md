# Multi-Round Review Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support multiple review-fix iterations with a proper timeline, historic diff view, comment deletion, and comment navigation.

**Architecture:** Extend `PrDetail` with a full `reviews` array and pre-computed `reviewCommitCounts`. The renderer receives all history up-front; historical diffs are fetched lazily via new IPC. New `PreviousReviews` tab and `CommentNav` component are self-contained. Existing `ReviewTimeline`, `CommentThread`, and `StaleBanner` are updated in-place.

**Tech Stack:** Electron IPC, React + Zustand, Vitest + Testing Library, CSS Modules

**Spec:** `docs/superpowers/specs/2026-04-09-multi-round-review-timeline-design.md`

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/shared/review-store/index.ts` | Add `deleteComment` method |
| Modify | `src/shared/types.ts` | Add `reviews` + `reviewCommitCounts` to `PrDetail` |
| Modify | `src/main/git/commits.ts` | Add `countCommitsBetween` |
| Modify | `src/main/ipc/prs.ts` | Include `reviews` + `reviewCommitCounts` in `prs:get` / `prs:refresh`; add `git:diff-at-shas` handler |
| Modify | `src/main/ipc/reviews.ts` | Add `comments:delete` handler; update `reviews:new` to return full `PrDetail` shape |
| Modify | `src/preload/index.ts` | Expose `getDiffAtShas`, `deleteComment` |
| Modify | `src/renderer/src/components/CommentThread.tsx` | Add `allowDelete` + `onDelete` + `focused` props |
| Modify | `src/renderer/src/components/CommentThread.module.css` | Add `.focused` animation class |
| Modify | `src/renderer/src/components/StaleBanner.tsx` | Add `midReview?: boolean` prop |
| Modify | `src/renderer/src/components/ReviewTimeline.tsx` | Rewrite for multi-round with `reviews` + `reviewCommitCounts` |
| Modify | `src/renderer/src/components/ReviewTimeline.module.css` | Add `.dotConnector` style |
| Create | `src/renderer/src/components/CommentNav.tsx` | Next/Prev comment navigation controls |
| Create | `src/renderer/src/components/CommentNav.module.css` | Styles |
| Create | `src/renderer/src/components/PreviousReviews.tsx` | Historic diff tab component |
| Create | `src/renderer/src/components/PreviousReviews.module.css` | Styles |
| Modify | `src/renderer/src/screens/PR.tsx` | New tab, delete comment, nav, pass `reviews` to timeline |
| Modify | `src/renderer/src/__tests__/CommentThread.test.tsx` | Add delete + focused tests |
| Modify | `src/renderer/src/__tests__/ReviewTimeline.test.tsx` | Rewrite for new `reviews` prop API |

---

## Task 1: Add `deleteComment` to ReviewStore

**Files:**
- Modify: `src/shared/review-store/index.ts`
- Test: `src/main/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests for `deleteComment`**

Add at the bottom of `src/main/__tests__/db.test.ts`:

```ts
import { tmpdir } from 'os'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { ReviewStore } from '../../shared/review-store'

describe('ReviewStore.deleteComment', () => {
  let repoPath: string
  let store: ReviewStore

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'lcr-test-'))
    store = new ReviewStore()
    const pr = store.createPR(repoPath, {
      title: 'Test PR',
      description: null,
      base_branch: 'main',
      compare_branch: 'feature',
    })
    const review = store.createReview(repoPath, pr.id, {
      base_sha: 'abc',
      compare_sha: 'def',
    })
    store.addComment(repoPath, pr.id, review.id, {
      file: 'src/foo.ts',
      start_line: 1,
      end_line: 1,
      side: 'right',
      body: 'Check this',
      context: [],
    })
    ;(deleteComment_prId as any) = pr.id
    ;(deleteComment_reviewId as any) = review.id
  })

  // Store pr/review IDs across steps
  let deleteComment_prId: string
  let deleteComment_reviewId: string

  it('removes the comment from the review', () => {
    const pr = store.listPRs(repoPath)[0]
    const review = store.listReviews(repoPath, pr.id)[0]
    expect(review.comments).toHaveLength(1)
    const commentId = review.comments[0].id
    const updated = store.deleteComment(repoPath, pr.id, review.id, commentId)
    expect(updated.comments).toHaveLength(0)
  })

  it('throws if comment does not exist', () => {
    const pr = store.listPRs(repoPath)[0]
    const review = store.listReviews(repoPath, pr.id)[0]
    expect(() =>
      store.deleteComment(repoPath, pr.id, review.id, 'RVW-999')
    ).toThrow('Comment not found')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:main -- --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `store.deleteComment is not a function`

- [ ] **Step 3: Implement `deleteComment` in ReviewStore**

In `src/shared/review-store/index.ts`, add after `resolveComment`:

```ts
deleteComment(
  repoPath: string,
  prId: string,
  reviewId: string,
  commentId: string,
): ReviewFile {
  const review = readReview(repoPath, prId, reviewId)
  const exists = review.comments.some((c) => c.id === commentId)
  if (!exists) throw new Error('Comment not found')
  const updated: ReviewFile = {
    ...review,
    comments: review.comments.filter((c) => c.id !== commentId),
  }
  writeReview(repoPath, prId, updated)
  return updated
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:main -- --reporter=verbose 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/review-store/index.ts src/main/__tests__/db.test.ts
git commit -m "feat: add ReviewStore.deleteComment"
```

---

## Task 2: Add `countCommitsBetween` git helper

**Files:**
- Modify: `src/main/git/commits.ts`

*(No unit test — requires a real git repo fixture. The IPC integration path covers this at app runtime.)*

- [ ] **Step 1: Add `countCommitsBetween` to `src/main/git/commits.ts`**

Append after `getCommitDiff`:

```ts
/** Returns the number of commits reachable from toSha but not fromSha. */
export async function countCommitsBetween(repoPath: string, fromSha: string, toSha: string): Promise<number> {
  if (fromSha === toSha) return 0
  try {
    const raw = await execGit(repoPath, ['rev-list', '--count', `${fromSha}..${toSha}`])
    return parseInt(raw.trim(), 10) || 0
  } catch {
    return 0
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/git/commits.ts
git commit -m "feat: add countCommitsBetween git helper"
```

---

## Task 3: Update `PrDetail` type + all IPC return sites

`PrDetail` must be updated in lockstep with every handler that returns it, or TypeScript compilation fails.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc/prs.ts`
- Modify: `src/main/ipc/reviews.ts`

- [ ] **Step 1: Extend `PrDetail` in `src/shared/types.ts`**

Replace the existing `PrDetail` interface:

```ts
export interface PrDetail {
  pr: PRFile
  diff: ParsedFile[]
  review: ReviewFile | null
  reviews: ReviewFile[]              // all reviews, oldest→newest
  reviewCommitCounts: Record<string, number>  // keyed by review.id, only complete reviews
  isStale: boolean
}
```

- [ ] **Step 2: Update `prs:get` in `src/main/ipc/prs.ts`**

Add the import at the top of the file:

```ts
import { listCommits, getCommitDiff, countCommitsBetween } from '../git/commits'
```

Replace the final `return` statement in the `prs:get` handler (currently line 95: `return { pr, diff, review: activeReview, isStale: false }`) with:

```ts
      // Build the reviews list (oldest→newest) and commit counts for complete rounds
      const allReviews = store.listReviews(repoPath, prId).slice().reverse()
      const reviewCommitCounts: Record<string, number> = {}
      for (let i = 0; i < allReviews.length; i++) {
        const r = allReviews[i]
        if (r.status === 'complete') {
          const toSha = allReviews[i + 1]?.compare_sha ?? currentCompareSha
          reviewCommitCounts[r.id] = await countCommitsBetween(repoPath, r.compare_sha, toSha)
        }
      }
      return { pr, diff, review: activeReview, reviews: allReviews, reviewCommitCounts, isStale: false }
```

- [ ] **Step 3: Update `prs:refresh` in `src/main/ipc/prs.ts`**

In the `prs:refresh` handler, replace the two `return` statements.

Replace `return { pr, diff, review: freshReview, isStale: false }` (the in-progress branch):

```ts
        const allReviews = store.listReviews(repoPath, prId).slice().reverse()
        const reviewCommitCounts: Record<string, number> = {}
        for (let i = 0; i < allReviews.length; i++) {
          const r = allReviews[i]
          if (r.status === 'complete') {
            const toSha = allReviews[i + 1]?.compare_sha ?? compareSha
            reviewCommitCounts[r.id] = await countCommitsBetween(repoPath, r.compare_sha, toSha)
          }
        }
        return { pr, diff, review: freshReview, reviews: allReviews, reviewCommitCounts, isStale: false }
```

Replace `return { pr, diff, review: latestReview, isStale: false }` (the no-in-progress branch):

```ts
      const allReviews2 = store.listReviews(repoPath, prId).slice().reverse()
      const reviewCommitCounts2: Record<string, number> = {}
      for (let i = 0; i < allReviews2.length; i++) {
        const r = allReviews2[i]
        if (r.status === 'complete') {
          const toSha = allReviews2[i + 1]?.compare_sha ?? compareSha
          reviewCommitCounts2[r.id] = await countCommitsBetween(repoPath, r.compare_sha, toSha)
        }
      }
      return { pr, diff, review: latestReview, reviews: allReviews2, reviewCommitCounts: reviewCommitCounts2, isStale: false }
```

- [ ] **Step 4: Update `reviews:new` in `src/main/ipc/reviews.ts`**

Add import at the top:

```ts
import { countCommitsBetween } from '../git/commits'
```

Replace both `return` statements in the `reviews:new` handler.

Replace `return { pr, diff, review: activeReview, isStale: false }`:

```ts
      const allReviewsA = store.listReviews(repoPath, prId).slice().reverse()
      const countsA: Record<string, number> = {}
      for (let i = 0; i < allReviewsA.length; i++) {
        const r = allReviewsA[i]
        if (r.status === 'complete') {
          const toSha = allReviewsA[i + 1]?.compare_sha ?? compareSha
          countsA[r.id] = await countCommitsBetween(repoPath, r.compare_sha, toSha)
        }
      }
      return { pr, diff, review: activeReview, reviews: allReviewsA, reviewCommitCounts: countsA, isStale: false }
```

Replace `return { pr, diff, review, isStale: false }` (the newly created review branch):

```ts
      const allReviewsB = store.listReviews(repoPath, prId).slice().reverse()
      const countsB: Record<string, number> = {}
      // newly created review is in_progress — no complete reviews yet to count
      return { pr, diff, review, reviews: allReviewsB, reviewCommitCounts: countsB, isStale: false }
```

- [ ] **Step 5: Run typecheck to confirm no errors**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/ipc/prs.ts src/main/ipc/reviews.ts
git commit -m "feat: extend PrDetail with reviews array and reviewCommitCounts"
```

---

## Task 4: Add `git:diff-at-shas` and `comments:delete` IPC + update preload

**Files:**
- Modify: `src/main/ipc/prs.ts`
- Modify: `src/main/ipc/reviews.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `git:diff-at-shas` handler in `src/main/ipc/prs.ts`**

Inside `registerPrHandlers`, append before the closing `}`:

```ts
  ipcMain.handle('git:diff-at-shas', async (_e, repoPath: string, baseSha: string, compareSha: string) => {
    try {
      return await getDiff(repoPath, baseSha, compareSha)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
```

- [ ] **Step 2: Add `comments:delete` handler in `src/main/ipc/reviews.ts`**

Inside `registerReviewHandlers`, append before the closing `}`:

```ts
  ipcMain.handle('comments:delete', (_e, repoPath: string, prId: string, reviewId: string, commentId: string) => {
    try {
      const review = store.getReview(repoPath, prId, reviewId)
      if (review.status !== 'in_progress') {
        return { error: 'Comments can only be deleted from in-progress reviews' }
      }
      return store.deleteComment(repoPath, prId, reviewId, commentId)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
```

- [ ] **Step 3: Expose new methods in `src/preload/index.ts`**

Add to the `api` object, after `downloadMarkdown`:

```ts
  // Historic diff
  getDiffAtShas: (repoPath: string, baseSha: string, compareSha: string): Promise<ParsedFile[] | { error: string }> =>
    ipcRenderer.invoke('git:diff-at-shas', repoPath, baseSha, compareSha),

  // Comment deletion (in-progress reviews only)
  deleteComment: (repoPath: string, prId: string, reviewId: string, commentId: string): Promise<ReviewFile | { error: string }> =>
    ipcRenderer.invoke('comments:delete', repoPath, prId, reviewId, commentId),
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/prs.ts src/main/ipc/reviews.ts src/preload/index.ts
git commit -m "feat: add git:diff-at-shas and comments:delete IPC handlers"
```

---

## Task 5: Update `CommentThread` with delete and focus props

**Files:**
- Modify: `src/renderer/src/components/CommentThread.tsx`
- Modify: `src/renderer/src/components/CommentThread.module.css`
- Modify: `src/renderer/src/__tests__/CommentThread.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to the end of the `describe` block in `src/renderer/src/__tests__/CommentThread.test.tsx`:

```ts
import { vi } from 'vitest'
import userEvent from '@testing-library/user-event'

// Add inside describe('CommentThread', () => { ... }):

  it('does not show a delete button by default', () => {
    render(<CommentThread comment={base} />)
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('shows a delete button when allowDelete is true', () => {
    render(<CommentThread comment={base} allowDelete onDelete={() => {}} />)
    expect(screen.getByRole('button', { name: /delete comment/i })).toBeInTheDocument()
  })

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn()
    render(<CommentThread comment={base} allowDelete onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: /delete comment/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('applies focused class when focused prop is true', () => {
    const { container } = render(<CommentThread comment={base} focused />)
    expect(container.firstChild).toHaveClass('focused')
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "CommentThread"
```

Expected: 4 new failures

- [ ] **Step 3: Update `CommentThread.tsx`**

Replace the entire file content:

```tsx
import type { ReviewComment } from '../../../shared/types'
import styles from './CommentThread.module.css'
import { formatRelativeTime } from '../utils/formatTime'

interface Props {
  comment: ReviewComment
  allowDelete?: boolean
  onDelete?: () => void
  focused?: boolean
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

export default function CommentThread({ comment, allowDelete, onDelete, focused }: Props): JSX.Element {
  const lineRange = comment.start_line === comment.end_line
    ? `Line ${comment.start_line}`
    : `Lines ${comment.start_line}–${comment.end_line}`

  return (
    <div
      data-comment-id={comment.id}
      className={`${styles.thread} ${comment.is_stale ? styles.stale : ''} ${focused ? styles.focused : ''}`}
    >
      <div className={styles.header}>
        <div className={styles.meta}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className={styles.lineRef}>{lineRange}</span>
        </div>
        <div className={styles.meta}>
          {comment.is_stale && <span className={styles.staleTag}>outdated</span>}
          {comment.status === 'resolved' && <span className={styles.badgeResolved}>Resolved</span>}
          {comment.status === 'wont_fix' && <span className={styles.badgeWontFix}>Won't fix</span>}
          {allowDelete && (
            <button
              aria-label="Delete comment"
              className={styles.deleteBtn}
              onClick={onDelete}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
      <div className={styles.body}>{comment.body}</div>
      {comment.resolution && (
        <div className={styles.resolution}>
          <div className={styles.resolutionMeta}>
            <span className={styles.resolutionAgent}>{comment.resolution.resolved_by}</span>
            <span className={styles.resolutionTime}>{formatRelativeTime(comment.resolution.resolved_at)}</span>
          </div>
          <div className={styles.resolutionComment}>{comment.resolution.comment}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add styles to `CommentThread.module.css`**

Append to the end of the file:

```css
.deleteBtn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  opacity: 0.6;
}

.deleteBtn:hover {
  color: var(--danger, #e05c5c);
  opacity: 1;
  background: var(--bg-hover, rgba(255,255,255,0.05));
}

@keyframes focusPulse {
  0%   { box-shadow: 0 0 0 2px var(--accent); }
  100% { box-shadow: 0 0 0 0px transparent; }
}

.focused {
  animation: focusPulse 1.2s ease-out forwards;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "CommentThread"
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/CommentThread.tsx src/renderer/src/components/CommentThread.module.css src/renderer/src/__tests__/CommentThread.test.tsx
git commit -m "feat: add allowDelete, onDelete, and focused props to CommentThread"
```

---

## Task 6: Update `StaleBanner` with mid-review variant

**Files:**
- Modify: `src/renderer/src/components/StaleBanner.tsx`

*(No test — the only change is swapping a text string based on a boolean prop. Tested visually.)*

- [ ] **Step 1: Update `StaleBanner.tsx`**

Replace the entire file:

```tsx
import styles from './StaleBanner.module.css'

interface Props {
  onRefresh: () => void
  loading: boolean
  midReview?: boolean
}

export default function StaleBanner({ onRefresh, loading, midReview }: Props): JSX.Element {
  const message = midReview
    ? 'The code has changed since you started this review. Your existing comments may be mispositioned — review them and delete any that no longer apply.'
    : 'This PR is out of sync — branches may have changed since last refresh.'

  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{message}</span>
      </div>
      <button onClick={onRefresh} disabled={loading}>
        {loading ? (
          <>
            <svg className={styles.spin} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refreshing…
          </>
        ) : 'Refresh'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/StaleBanner.tsx
git commit -m "feat: add midReview prop to StaleBanner for stronger warning message"
```

---

## Task 7: Rewrite `ReviewTimeline` for multi-round

**Files:**
- Modify: `src/renderer/src/components/ReviewTimeline.tsx`
- Modify: `src/renderer/src/components/ReviewTimeline.module.css`
- Modify: `src/renderer/src/__tests__/ReviewTimeline.test.tsx`

- [ ] **Step 1: Rewrite the test file for the new API**

Replace the entire contents of `src/renderer/src/__tests__/ReviewTimeline.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReviewTimeline from '../components/ReviewTimeline'
import type { PRFile, ReviewFile, ReviewComment } from '../../../shared/types'

const pr: PRFile = {
  version: 1,
  id: 'pr-uuid',
  title: 'My PR',
  description: null,
  base_branch: 'main',
  compare_branch: 'feature/x',
  status: 'open',
  assignee: null,
  assigned_at: null,
  created_at: '2026-04-08T09:00:00Z',
  updated_at: '2026-04-08T09:00:00Z',
}

const resolvedComment: ReviewComment = {
  id: 'RVW-001', file: 'src/foo.ts',
  start_line: 3, end_line: 3, side: 'right',
  body: 'Add null check here', is_stale: false,
  context: [], status: 'resolved',
  resolution: {
    comment: 'Fixed with optional chaining.',
    resolved_by: 'Claude Code',
    resolved_at: '2026-04-08T12:00:00Z',
  },
  created_at: '2026-04-08T11:00:00Z',
}

const openComment: ReviewComment = {
  id: 'RVW-002', file: 'src/bar.ts',
  start_line: 10, end_line: 12, side: 'right',
  body: 'Rename this variable', is_stale: false,
  context: [], status: 'open', resolution: null,
  created_at: '2026-04-08T11:05:00Z',
}

const staleComment: ReviewComment = {
  ...resolvedComment,
  id: 'RVW-003',
  is_stale: true,
  body: 'This is stale',
}

const submittedReview: ReviewFile = {
  version: 1, id: 'rev-1',
  status: 'submitted',
  base_sha: 'abc', compare_sha: 'def',
  created_at: '2026-04-08T10:00:00Z',
  submitted_at: '2026-04-08T11:00:00Z',
  comments: [resolvedComment, openComment],
}

const inProgressReview: ReviewFile = {
  ...submittedReview, id: 'rev-2',
  status: 'in_progress',
  submitted_at: null,
  comments: [],
}

const completeReview: ReviewFile = {
  ...submittedReview, id: 'rev-3',
  status: 'complete',
  submitted_at: '2026-04-08T13:00:00Z',
  comments: [resolvedComment],
}

describe('ReviewTimeline', () => {
  it('always shows the PR opened entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[]} reviewCommitCounts={{}} />)
    expect(screen.getByText(/opened this pr/i)).toBeInTheDocument()
  })

  it('shows nothing extra when reviews is empty', () => {
    render(<ReviewTimeline pr={pr} reviews={[]} reviewCommitCounts={{}} />)
    expect(screen.queryByText(/review/i)).not.toBeInTheDocument()
  })

  it('shows "Review in progress" for an in_progress review', () => {
    render(<ReviewTimeline pr={pr} reviews={[inProgressReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText(/review in progress/i)).toBeInTheDocument()
  })

  it('does not show comments under an in_progress entry', () => {
    const withComments = { ...inProgressReview, comments: [openComment] }
    render(<ReviewTimeline pr={pr} reviews={[withComments]} reviewCommitCounts={{}} />)
    expect(screen.queryByText('Rename this variable')).not.toBeInTheDocument()
  })

  it('shows "Review submitted" for a submitted review', () => {
    render(<ReviewTimeline pr={pr} reviews={[submittedReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText(/review submitted/i)).toBeInTheDocument()
  })

  it('shows non-stale comments under submitted entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[submittedReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText('Add null check here')).toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('does not show stale comments under submitted entry', () => {
    const withStale = { ...submittedReview, comments: [staleComment, openComment] }
    render(<ReviewTimeline pr={pr} reviews={[withStale]} reviewCommitCounts={{}} />)
    expect(screen.queryByText('This is stale')).not.toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('shows resolution replies under submitted entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[submittedReview]} reviewCommitCounts={{}} />)
    expect(screen.getByText('Fixed with optional chaining.')).toBeInTheDocument()
  })

  it('shows both "Review submitted" and "Review feedback implemented" for a complete review', () => {
    render(<ReviewTimeline pr={pr} reviews={[completeReview]} reviewCommitCounts={{ 'rev-3': 3 }} />)
    expect(screen.getByText(/review submitted/i)).toBeInTheDocument()
    expect(screen.getByText(/review feedback implemented/i)).toBeInTheDocument()
  })

  it('shows commit count in "Review feedback implemented" entry', () => {
    render(<ReviewTimeline pr={pr} reviews={[completeReview]} reviewCommitCounts={{ 'rev-3': 3 }} />)
    expect(screen.getByText(/3 commits created/i)).toBeInTheDocument()
  })

  it('shows "1 commit created" (singular) correctly', () => {
    render(<ReviewTimeline pr={pr} reviews={[completeReview]} reviewCommitCounts={{ 'rev-3': 1 }} />)
    expect(screen.getByText(/1 commit created/i)).toBeInTheDocument()
  })

  it('renders multiple review rounds in order', () => {
    const secondReview: ReviewFile = {
      ...submittedReview,
      id: 'rev-2',
      created_at: '2026-04-09T10:00:00Z',
      submitted_at: '2026-04-09T11:00:00Z',
      comments: [openComment],
    }
    render(<ReviewTimeline pr={pr} reviews={[completeReview, secondReview]} reviewCommitCounts={{ 'rev-3': 2 }} />)
    // First complete review shows both entries
    expect(screen.getByText(/review feedback implemented/i)).toBeInTheDocument()
    // Second submitted review also shows
    expect(screen.getAllByText(/review submitted/i)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "ReviewTimeline"
```

Expected: multiple failures — component still expects old props

- [ ] **Step 3: Rewrite `ReviewTimeline.tsx`**

Replace the entire file:

```tsx
import type { PRFile, ReviewFile } from '../../../shared/types'
import CommentThread from './CommentThread'
import { formatRelativeTime, formatAbsoluteDate } from '../utils/formatTime'
import styles from './ReviewTimeline.module.css'

interface Props {
  pr: PRFile
  reviews: ReviewFile[]
  reviewCommitCounts: Record<string, number>
}

export default function ReviewTimeline({ pr, reviews, reviewCommitCounts }: Props): JSX.Element {
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

        // submitted or complete: always render "Review submitted" with comments
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

        // complete: render "Review submitted" + "Review feedback implemented"
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
    </div>
  )
}
```

- [ ] **Step 4: Add `.dotComplete` and `.commitCount` to `ReviewTimeline.module.css`**

Append to end of file:

```css
.dotComplete {
  border-color: var(--success, #4caf50);
  background: var(--success, #4caf50);
}

.commitCount {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "ReviewTimeline"
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ReviewTimeline.tsx src/renderer/src/components/ReviewTimeline.module.css src/renderer/src/__tests__/ReviewTimeline.test.tsx
git commit -m "feat: rewrite ReviewTimeline for multi-round reviews"
```

---

## Task 8: Build `CommentNav` component

**Files:**
- Create: `src/renderer/src/components/CommentNav.tsx`
- Create: `src/renderer/src/components/CommentNav.module.css`

*(No automated test — scroll behaviour requires real DOM. Tested via integration in PR.tsx.)*

- [ ] **Step 1: Create `CommentNav.tsx`**

```tsx
import styles from './CommentNav.module.css'

interface Props {
  total: number
  current: number   // 0-based index, -1 when nothing focused
  onPrev: () => void
  onNext: () => void
}

export default function CommentNav({ total, current, onPrev, onNext }: Props): JSX.Element | null {
  if (total === 0) return null

  const label = current === -1 ? `${total}` : `${current + 1} / ${total}`

  return (
    <div className={styles.nav}>
      <button
        className={styles.btn}
        onClick={onPrev}
        disabled={total === 0 || current <= 0}
        title="Previous comment"
      >
        ← Prev
      </button>
      <span className={styles.counter}>{label}</span>
      <button
        className={styles.btn}
        onClick={onNext}
        disabled={total === 0 || current >= total - 1}
        title="Next comment"
      >
        Next →
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `CommentNav.module.css`**

```css
.nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-secondary, transparent);
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: var(--bg-hover, rgba(255,255,255,0.06));
}

.btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.counter {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 40px;
  text-align: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/CommentNav.tsx src/renderer/src/components/CommentNav.module.css
git commit -m "feat: add CommentNav component for next/prev comment navigation"
```

---

## Task 9: Build `PreviousReviews` component

**Files:**
- Create: `src/renderer/src/components/PreviousReviews.tsx`
- Create: `src/renderer/src/components/PreviousReviews.module.css`

- [ ] **Step 1: Create `PreviousReviews.tsx`**

```tsx
import { useState, useCallback } from 'react'
import type { ReviewFile, ReviewComment, ParsedFile } from '../../../shared/types'
import DiffView from './DiffView'
import CommentNav from './CommentNav'
import { formatRelativeTime } from '../utils/formatTime'
import styles from './PreviousReviews.module.css'

interface Props {
  reviews: ReviewFile[]   // only complete reviews, oldest→newest
  repoPath: string
}

export default function PreviousReviews({ reviews, repoPath }: Props): JSX.Element {
  const [selectedReview, setSelectedReview] = useState<ReviewFile | null>(null)
  const [historicDiff, setHistoricDiff] = useState<ParsedFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusedCommentIndex, setFocusedCommentIndex] = useState(-1)

  // All non-stale comments for the selected review, flattened across files
  const navComments: ReviewComment[] = selectedReview
    ? selectedReview.comments.filter((c) => !c.is_stale)
    : []

  async function handleSelectReview(review: ReviewFile): Promise<void> {
    if (selectedReview?.id === review.id) return
    setSelectedReview(review)
    setHistoricDiff(null)
    setFocusedCommentIndex(-1)
    setLoading(true)
    const result = await window.api.getDiffAtShas(repoPath, review.base_sha, review.compare_sha)
    setLoading(false)
    if ('error' in result) return
    setHistoricDiff(result)
  }

  const handleNav = useCallback((index: number) => {
    setFocusedCommentIndex(index)
    const comment = navComments[index]
    if (!comment) return
    const el = document.querySelector(`[data-comment-id="${comment.id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [navComments])

  return (
    <div className={styles.layout}>
      {/* Left panel — review list */}
      <div className={styles.listPanel}>
        {reviews.map((review, idx) => (
          <div
            key={review.id}
            className={`${styles.reviewItem} ${selectedReview?.id === review.id ? styles.reviewItemActive : ''}`}
            onClick={() => handleSelectReview(review)}
          >
            <div className={styles.reviewLabel}>Review {idx + 1}</div>
            <div className={styles.reviewMeta}>
              <code className={styles.sha}>{review.compare_sha.slice(0, 7)}</code>
              {review.submitted_at && (
                <span className={styles.reviewTime}>{formatRelativeTime(review.submitted_at)}</span>
              )}
            </div>
            <div className={styles.reviewCommentCount}>
              {review.comments.filter((c) => !c.is_stale).length} comment{review.comments.filter((c) => !c.is_stale).length !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel — historic diff */}
      <div className={styles.diffPanel}>
        {!selectedReview && (
          <div className={styles.empty}>Select a review to see the diff at that point in time.</div>
        )}
        {selectedReview && loading && (
          <div className={styles.loading}>Loading diff…</div>
        )}
        {selectedReview && !loading && historicDiff && (
          <>
            <div className={styles.diffToolbar}>
              <CommentNav
                total={navComments.length}
                current={focusedCommentIndex}
                onPrev={() => handleNav(Math.max(0, focusedCommentIndex - 1))}
                onNext={() => handleNav(Math.min(navComments.length - 1, focusedCommentIndex + 1))}
              />
            </div>
            {historicDiff.length === 0 ? (
              <div className={styles.empty}>No file changes in this review snapshot.</div>
            ) : (
              historicDiff.map((file) => (
                <DiffView
                  key={file.newPath}
                  file={file}
                  comments={selectedReview.comments.filter((c) => c.file === file.newPath && !c.is_stale)}
                  view="unified"
                  onAddComment={async () => {}}
                  readOnly
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `PreviousReviews.module.css`**

```css
.layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.listPanel {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 8px 0;
}

.reviewItem {
  padding: 10px 16px;
  cursor: pointer;
  border-left: 2px solid transparent;
}

.reviewItem:hover {
  background: var(--bg-hover, rgba(255,255,255,0.04));
}

.reviewItemActive {
  border-left-color: var(--accent);
  background: var(--bg-hover, rgba(255,255,255,0.04));
}

.reviewLabel {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.reviewMeta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
}

.sha {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
}

.reviewTime {
  font-size: 11px;
  color: var(--text-muted);
}

.reviewCommentCount {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.diffPanel {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.diffToolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.empty,
.loading {
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/PreviousReviews.tsx src/renderer/src/components/PreviousReviews.module.css
git commit -m "feat: add PreviousReviews tab component with historic diff view"
```

---

## Task 10: Wire everything together in `PR.tsx`

This task updates `PR.tsx` to: pass `reviews`/`reviewCommitCounts` to `ReviewTimeline`, add the "Previous reviews" tab, handle comment deletion, wire up `StaleBanner`'s `midReview` prop, and add comment navigation to the Files tab.

**Files:**
- Modify: `src/renderer/src/screens/PR.tsx`

- [ ] **Step 1: Add imports and new state at the top of `PR.tsx`**

Add to the existing imports block:

```ts
import PreviousReviews from '../components/PreviousReviews'
import CommentNav from '../components/CommentNav'
```

Change the `Tab` type:

```ts
type Tab = 'overview' | 'commits' | 'files' | 'previous-reviews'
```

Add new state variables inside the component body, after the existing `useState` declarations:

```ts
const [focusedCommentIndex, setFocusedCommentIndex] = useState(-1)
```

- [ ] **Step 2: Update `ReviewTimeline` call in the overview tab**

Find the existing `<ReviewTimeline pr={pr} review={review} comments={comments} />` and replace with:

```tsx
<ReviewTimeline
  pr={pr}
  reviews={prDetail.reviews}
  reviewCommitCounts={prDetail.reviewCommitCounts}
/>
```

- [ ] **Step 3: Update `StaleBanner` to pass `midReview`**

Find `{isStale && <StaleBanner onRefresh={handleRefresh} loading={refreshing} />}` and replace with:

```tsx
{isStale && (
  <StaleBanner
    onRefresh={handleRefresh}
    loading={refreshing}
    midReview={review?.status === 'in_progress'}
  />
)}
```

- [ ] **Step 4: Add `handleDeleteComment` function**

Add inside the component body, after `handleAddComment`:

```ts
async function handleDeleteComment(commentId: string): Promise<void> {
  if (!repo || !prId || !review || review.status !== 'in_progress') return
  await window.api.deleteComment(repo.path, prId, review.id, commentId)
  const updated = await window.api.getPr(repo.path, prId)
  if (updated && !('error' in updated)) {
    setPrDetail(updated)
    setFocusedCommentIndex(-1)
  }
}
```

- [ ] **Step 5: Add comment navigation helper**

Add inside the component body, after `handleDeleteComment`:

```ts
const navComments = comments.filter((c) => !c.is_stale)

function handleCommentNav(index: number): void {
  setFocusedCommentIndex(index)
  const comment = navComments[index]
  if (!comment) return
  const el = document.querySelector(`[data-comment-id="${comment.id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
```

- [ ] **Step 6: Update the tab bar to add "Previous reviews" tab**

Find the tab definitions array and add the new tab. Replace:

```tsx
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'commits', label: 'Commits' },
            { key: 'files', label: 'Files changed', count: diff.length },
          ] as { key: Tab; label: string; count?: number }[]).map(({ key, label, count }) => (
```

With:

```tsx
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'commits', label: 'Commits' },
            { key: 'files', label: 'Files changed', count: diff.length },
            ...(prDetail.reviews.some((r) => r.status === 'complete')
              ? [{ key: 'previous-reviews' as Tab, label: 'Previous reviews' }]
              : []),
          ] as { key: Tab; label: string; count?: number }[]).map(({ key, label, count }) => (
```

- [ ] **Step 7: Add `CommentNav` to the Files tab toolbar**

Find the `{tab === 'files' && (` block. Inside the `<div className={styles.viewToggle}>` area, add `CommentNav` alongside the unified/split toggle. Replace the existing `{tab === 'files' && (` toolbar section:

```tsx
        {tab === 'files' && (
          <div className={styles.viewToggle}>
            <CommentNav
              total={navComments.length}
              current={focusedCommentIndex}
              onPrev={() => handleCommentNav(Math.max(0, focusedCommentIndex - 1))}
              onNext={() => handleCommentNav(Math.min(navComments.length - 1, focusedCommentIndex + 1))}
            />
            <button
              className={`${styles.toggleBtn} ${diffView === 'unified' ? styles.toggleActive : ''}`}
              onClick={() => setDiffView('unified')}
              title="Unified diff"
            ><UnifiedIcon /></button>
            <button
              className={`${styles.toggleBtn} ${diffView === 'split' ? styles.toggleActive : ''}`}
              onClick={() => setDiffView('split')}
              title="Split diff"
            ><SplitIcon /></button>
          </div>
        )}
```

- [ ] **Step 8: Pass `allowDelete`, `onDelete`, and `focused` through to `DiffView` → `CommentThread`**

`DiffView` renders `CommentThread` internally via `UnifiedDiff` and `SplitDiff`. Rather than threading props all the way through, we pass `onDeleteComment` and `allowDelete` to `DiffView` which will forward them to the diff sub-components.

First, update `DiffView`'s `Props` interface in `src/renderer/src/components/DiffView/index.tsx`:

```ts
interface Props {
  file: ParsedFile
  comments: ReviewComment[]
  view: 'unified' | 'split'
  onAddComment: (payload: Omit<AddCommentPayload, 'repoPath' | 'prId' | 'reviewId'>) => Promise<void>
  readOnly?: boolean
  allowDeleteComment?: boolean
  onDeleteComment?: (commentId: string) => void
  focusedCommentId?: string
}
```

Update `DiffView`'s function signature to accept the new props and pass them through to `UnifiedDiff` and `SplitDiff`:

```tsx
export default function DiffView({
  file, comments, view, onAddComment, readOnly = false,
  allowDeleteComment, onDeleteComment, focusedCommentId,
}: Props): JSX.Element {
```

Pass the new props to both `<UnifiedDiff>` and `<SplitDiff>` inside `DiffView`:

```tsx
            <UnifiedDiff
              ...existing props...
              allowDeleteComment={allowDeleteComment}
              onDeleteComment={onDeleteComment}
              focusedCommentId={focusedCommentId}
            />
```

```tsx
            <SplitDiff
              ...existing props...
              allowDeleteComment={allowDeleteComment}
              onDeleteComment={onDeleteComment}
              focusedCommentId={focusedCommentId}
            />
```

Now update `UnifiedDiff` and `SplitDiff` to accept and pass these to `CommentThread`. In both files, update the `Props` interface to add:

```ts
  allowDeleteComment?: boolean
  onDeleteComment?: (commentId: string) => void
  focusedCommentId?: string
```

And wherever each renders `<CommentThread comment={c} />`, replace with:

```tsx
<CommentThread
  comment={c}
  allowDelete={allowDeleteComment}
  onDelete={onDeleteComment ? () => onDeleteComment(c.id) : undefined}
  focused={focusedCommentId === c.id}
/>
```

- [ ] **Step 9: In `PR.tsx` files tab, pass the new props to each `DiffView`**

Find the files tab `DiffView` render inside the `{diff.map((file) => (` loop and replace:

```tsx
                <DiffView
                  file={file}
                  comments={comments.filter((c) => c.file === file.newPath)}
                  view={diffView}
                  onAddComment={handleAddComment}
                  readOnly={workflow.isReadOnly()}
                  allowDeleteComment={review?.status === 'in_progress'}
                  onDeleteComment={handleDeleteComment}
                  focusedCommentId={navComments[focusedCommentIndex]?.id}
                />
```

- [ ] **Step 10: Add the "Previous reviews" tab content**

After the `{/* ── Files tab ── */}` block, add:

```tsx
      {/* ── Previous reviews tab ── */}
      {tab === 'previous-reviews' && (
        <PreviousReviews
          reviews={prDetail.reviews.filter((r) => r.status === 'complete')}
          repoPath={repo?.path ?? ''}
        />
      )}
```

- [ ] **Step 11: Run typecheck**

```bash
npm run typecheck 2>&1 | tail -30
```

Fix any errors before proceeding.

- [ ] **Step 12: Run all tests**

```bash
npm run test 2>&1 | tail -30
```

Expected: all pass

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/screens/PR.tsx src/renderer/src/components/DiffView/index.tsx src/renderer/src/components/DiffView/UnifiedDiff.tsx src/renderer/src/components/DiffView/SplitDiff.tsx
git commit -m "feat: wire up multi-round timeline, previous reviews tab, comment deletion, and comment navigation"
```

---

## Self-Review Checklist (completed by plan author)

| Spec requirement | Task |
|-----------------|------|
| `PrDetail.reviews: ReviewFile[]` | Task 3 |
| `PrDetail.reviewCommitCounts` | Task 3 |
| `deleteComment` ReviewStore method | Task 1 |
| `getDiffAtShas` IPC + preload | Task 4 |
| `deleteComment` IPC + preload | Task 4 |
| Timeline: multi-round, "Review submitted" with comments | Task 7 |
| Timeline: "Review feedback implemented" with commit count | Task 7 |
| Mid-review stale banner with stronger message | Task 6 |
| Bin icon on in-progress comments only | Tasks 5, 10 |
| "Previous reviews" tab (complete reviews only) | Tasks 9, 10 |
| Historic diff at review's SHAs | Task 9 |
| Comment navigation (Files tab) | Tasks 8, 10 |
| Comment navigation (Previous reviews tab) | Task 9 |
| Focused comment highlight | Task 5 |

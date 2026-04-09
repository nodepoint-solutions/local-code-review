# Multi-Round Review Timeline & Historic Diff View

**Date:** 2026-04-09  
**Status:** Approved

## Problem

The app does not handle multiple review-fix iterations well:

1. The Overview timeline shows at most one "review complete" entry and bundles all comments from all reviews into a single list.
2. The "Files changed" tab always shows the current branch diff, even for completed past rounds — there is no way to see what the code looked like at the time of a specific review.
3. There is no way to delete an in-progress comment if the code shifts beneath it mid-review.
4. There is no quick navigation between comments within the diff.

## Approach

Extend `PrDetail` with the full reviews array (all rounds, sorted oldest→newest). The active review field is preserved unchanged for workflow/capability logic. Historical diffs are fetched lazily via a new IPC handler. No new polling or eager computation.

---

## Section 1: Data Layer

### `PrDetail` — add `reviews` array

```ts
export interface PrDetail {
  pr: PRFile
  diff: ParsedFile[]
  review: ReviewFile | null   // active review (unchanged — used by PRWorkflow)
  reviews: ReviewFile[]       // all reviews, sorted oldest→newest
  isStale: boolean
}
```

The main process `getPr` handler already calls `getActiveReview`. It will additionally call `store.listReviews(repoPath, prId)` and include the sorted result.

### New IPC handler: `getDiffAtShas`

```ts
getDiffAtShas(repoPath: string, baseSha: string, compareSha: string): Promise<ParsedFile[]>
```

Runs `git diff <baseSha>..<compareSha>`, parses the output with the existing diff parser. Called lazily from the "Previous reviews" tab when a user selects a review round. Never called eagerly.

### New IPC handler: `deleteComment`

```ts
deleteComment(repoPath: string, prId: string, reviewId: string, commentId: string): Promise<ReviewFile>
```

Removes a comment from an in-progress review. Main process enforces `review.status === 'in_progress'` before mutating — returns an error object otherwise. `ReviewStore` gets a corresponding `deleteComment` method.

---

## Section 2: Overview Timeline

`ReviewTimeline` is updated to accept `reviews: ReviewFile[]` (the full array) instead of a single `review` prop. The `PR.tsx` overview tab passes `prDetail.reviews`.

**Rendering order (top to bottom):**

1. **Opened this PR** — always first, unchanged.
2. For each `ReviewFile` in `reviews` (oldest first):
   - `in_progress`: render a single "Review in progress" entry; no comments nested.
   - `submitted`: render a single "Review submitted" entry; no comments (fix not yet complete).
   - `complete`: render **two** entries for this review round:
     1. "Review submitted" — no content body (marks when it was submitted)
     2. "Review complete — N comments addressed" — comments collapsed under this entry
3. Between a `complete` review and the next round's first entry, insert a **"Fixes applied"** connector — a smaller, dimmer dot with no content body — to visually separate rounds.

The existing single-review rendering path is removed. All display logic derives from the `reviews` array.

---

## Section 3: Files Changed Tab — Mid-Review Warning & Comment Deletion

### Mid-review code change warning

When `isStale === true` AND `review?.status === 'in_progress'`, the `StaleBanner` message changes to:

> "The code has changed since you started this review. Your existing comments may be mispositioned — review them and delete any that no longer apply."

The refresh button remains. For all other `isStale` cases the existing banner message is unchanged.

### Delete (bin) icon on in-progress comments

`CommentThread` receives a new `allowDelete?: boolean` prop. When `true`, a bin icon is rendered in the comment header. Clicking it:

1. Calls `window.api.deleteComment(repoPath, prId, reviewId, commentId)`.
2. Refreshes `prDetail` via `getPr`.

`allowDelete` is set to `true` only when `review?.status === 'in_progress'`. It is `false` (or absent) for submitted/complete reviews, making the bin icon invisible. The main process also enforces this server-side.

---

## Section 4: "Previous Reviews" Tab

A new **"Previous reviews"** tab is added to the tab bar. It is only rendered when `prDetail.reviews.some(r => r.status === 'complete')`.

### Layout

Two-panel layout matching the Commits tab pattern:

- **Left panel — review list:** One entry per completed review, sorted oldest→newest. Each entry shows:
  - Round label: "Review 1", "Review 2", etc. (1-indexed position among all reviews)
  - Short `compare_sha` (7 chars)
  - `submitted_at` date (relative time)
  - Comment count

- **Right panel — historical diff:** When a review is selected, calls `getDiffAtShas(repoPath, review.base_sha, review.compare_sha)`. Renders the result read-only using the existing `DiffView` component. Comments are the selected review's `comments` array, positioned against that snapshot — they will be accurate because they were recorded at those exact SHAs. `onAddComment` is a no-op. No stale detection applies here.

A loading state ("Loading diff…") is shown while the IPC call is in flight, matching the Commits tab pattern.

---

## Section 5: Comment Navigation

"Previous / Next comment" controls appear in the tab bar toolbar row (right side, same row as the unified/split toggle) on:
- The **Files changed** tab
- The **Previous reviews** tab right panel (when a review is selected)

**Controls:** `← Prev` · `1 / 4` · `Next →`

- Count reflects visible comments in the current view (non-stale for Files changed; all comments for a selected historical review).
- Buttons are disabled when there are no comments; Previous is disabled on the first, Next on the last.

**Implementation:**
- Each rendered `CommentThread` receives a `data-comment-id` attribute.
- The parent component (Files tab / Previous reviews right panel) maintains `focusedCommentIndex` in local state.
- Next/Prev collect comment DOM nodes in document order and call `scrollIntoView({ behavior: 'smooth', block: 'center' })` on the target.
- The focused comment gets a highlight ring via a CSS class that transitions out after ~1s (CSS animation, no JS timer needed beyond toggling the class).

---

## Out of Scope

- Merging or comparing comments across review rounds.
- Marking a review round as "approved" (no such concept exists in the current workflow).
- Paginating or virtualising the diff in the Previous reviews tab.

# Comment Status Badges + Resolution Replies + Review Timeline

**Date:** 2026-04-09  
**Status:** Approved

## Overview

Two related features:
1. Surface `status` and `resolution` data on `ReviewComment` in the UI (badge + reply panel in `CommentThread`)
2. Add a timeline view to the PR overview tab showing PR opened and review submitted events with their comments

## Feature 1: CommentThread — Status Badge + Resolution Reply

### Status badge

Added to the `CommentThread` header row, next to the existing stale tag.

- `status === 'open'` → no badge rendered (unchanged)
- `status === 'resolved'` → green pill labelled "Resolved", using `--badge-added-bg`, `--badge-added-text`, `--badge-added-border` tokens
- `status === 'wont_fix'` → muted pill labelled "Won't fix", using `--bg-surface-3`, `--text-subtle`, `--border` tokens

### Resolution reply panel

Renders below `comment.body` when `comment.resolution` is non-null. Visually subordinate to the comment — indented, left border, `--bg-surface-2` background.

Contents:
- Agent label ("Claude Code") + relative timestamp derived from `resolution.resolved_at`
- `resolution.comment` text

No changes to `CommentThread`'s props interface — it already receives a full `ReviewComment` which includes `status` and `resolution`.

## Feature 2: ReviewTimeline component

### New files

- `src/renderer/src/components/ReviewTimeline.tsx`
- `src/renderer/src/components/ReviewTimeline.module.css`

### Props

```ts
interface Props {
  pr: PRFile
  review: ReviewFile | null
  comments: ReviewComment[]
}
```

### Structure

Vertical timeline with a connecting line on the left side. Two possible entries:

**Entry 1 — PR opened** (always shown)
- Unfilled circle dot on the line
- Label: "Opened this PR"
- Timestamp: `pr.created_at` formatted as absolute date

**Entry 2 — Review submitted** (only when `review !== null && review.status === 'submitted'`)
- Filled circle dot (accent color)
- Header: "Review submitted with N comment(s)" + `review.submitted_at` relative timestamp
- Body: list of non-stale comments rendered via the updated `CommentThread`

The vertical line connects Entry 1 to Entry 2. If Entry 2 is absent, the line does not render (no orphaned connector).

### Placement in PR.tsx

In the overview tab, stacked below the existing description card:

```
overviewMain:
  ┌─────────────────────┐
  │   Description card  │
  └─────────────────────┘
  ┌─────────────────────┐
  │   ReviewTimeline    │
  └─────────────────────┘
```

The `ReviewTimeline` receives `pr`, `review`, and `comments` already available in scope at the overview render site.

## Data flow

No new data fetching required. All fields (`status`, `resolution`, `review.submitted_at`) are already present in `ReviewComment` and `ReviewFile` from `schema.ts` and surfaced through `PrDetail` via `getPr`.

## Tokens used

| Purpose | Token |
|---|---|
| Resolved badge bg | `--badge-added-bg` |
| Resolved badge text | `--badge-added-text` |
| Resolved badge border | `--badge-added-border` |
| Won't fix badge bg | `--bg-surface-3` |
| Won't fix badge text | `--text-subtle` |
| Won't fix badge border | `--border` |
| Resolution reply bg | `--bg-surface-2` |
| Timeline line | `--border` |
| Timeline dot (open) | `--border` |
| Timeline dot (submitted) | `--accent` |

## Out of scope

- Filtering comments by status
- Editing or re-opening resolved comments
- Timeline events for assignment, close, reopen

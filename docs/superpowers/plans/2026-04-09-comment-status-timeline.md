# Comment Status Badges + Resolution Replies + Review Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface comment resolution status as badges and agent replies in `CommentThread`, and add a vertical timeline to the PR overview tab showing "PR opened" and "Review submitted with comments" events.

**Architecture:** Extend `CommentThread` in-place to render a status badge and a resolution reply panel below the body. Build a new `ReviewTimeline` component that renders two timeline entries using the updated `CommentThread` for each comment. Mount `ReviewTimeline` in the overview tab of `PR.tsx` below the description card.

**Tech Stack:** React, TypeScript, CSS Modules, Vitest + React Testing Library

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/renderer/src/components/CommentThread.tsx` | Add status badge + resolution reply panel |
| Modify | `src/renderer/src/components/CommentThread.module.css` | Styles for badge and resolution reply |
| Modify | `src/renderer/src/__tests__/CommentThread.test.tsx` | Tests for badge and resolution reply |
| Create | `src/renderer/src/components/ReviewTimeline.tsx` | New timeline component |
| Create | `src/renderer/src/components/ReviewTimeline.module.css` | Timeline styles |
| Create | `src/renderer/src/__tests__/ReviewTimeline.test.tsx` | Tests for timeline |
| Modify | `src/renderer/src/screens/PR.tsx` | Mount ReviewTimeline in overview tab |

---

## Task 1: Status badge in CommentThread

**Files:**
- Modify: `src/renderer/src/components/CommentThread.tsx`
- Modify: `src/renderer/src/components/CommentThread.module.css`
- Modify: `src/renderer/src/__tests__/CommentThread.test.tsx`

- [ ] **Step 1: Write failing tests for the badge**

Open `src/renderer/src/__tests__/CommentThread.test.tsx` and replace with:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommentThread from '../components/CommentThread'
import type { ReviewComment } from '../../../shared/types'

const base: ReviewComment = {
  id: 'RVW-001', file: 'src/foo.ts',
  start_line: 3, end_line: 3, side: 'right',
  body: 'This needs a null check', is_stale: false,
  context: [],
  status: 'open',
  resolution: null,
  created_at: '2026-04-08T10:00:00Z',
}

describe('CommentThread', () => {
  it('renders the comment body', () => {
    render(<CommentThread comment={base} />)
    expect(screen.getByText('This needs a null check')).toBeInTheDocument()
  })

  it('shows stale indicator for stale comments', () => {
    render(<CommentThread comment={{ ...base, is_stale: true }} />)
    expect(screen.getByText(/outdated/i)).toBeInTheDocument()
  })

  it('shows no badge for open comments', () => {
    render(<CommentThread comment={base} />)
    expect(screen.queryByText(/resolved/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/won't fix/i)).not.toBeInTheDocument()
  })

  it('shows Resolved badge for resolved comments', () => {
    render(<CommentThread comment={{ ...base, status: 'resolved' }} />)
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it("shows Won't fix badge for wont_fix comments", () => {
    render(<CommentThread comment={{ ...base, status: 'wont_fix' }} />)
    expect(screen.getByText("Won't fix")).toBeInTheDocument()
  })

  it('shows no resolution panel when resolution is null', () => {
    render(<CommentThread comment={{ ...base, status: 'resolved', resolution: null }} />)
    expect(screen.queryByText(/claude code/i)).not.toBeInTheDocument()
  })

  it('shows resolution panel with agent comment when resolution is present', () => {
    render(<CommentThread comment={{
      ...base,
      status: 'resolved',
      resolution: {
        comment: 'Added null guard on line 3.',
        resolved_by: 'Claude Code',
        resolved_at: '2026-04-08T12:00:00Z',
      }
    }} />)
    expect(screen.getByText('Added null guard on line 3.')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "CommentThread"
```

Expected: 4 new tests fail (badge and resolution panel tests).

- [ ] **Step 3: Add badge styles to CommentThread.module.css**

Append to `src/renderer/src/components/CommentThread.module.css`:

```css
.badgeResolved {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 20px;
  background: var(--badge-added-bg);
  color: var(--badge-added-text);
  border: 1px solid var(--badge-added-border);
}

.badgeWontFix {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 20px;
  background: var(--bg-surface-3);
  color: var(--text-subtle);
  border: 1px solid var(--border);
}

.resolution {
  margin-top: 10px;
  padding: 8px 12px;
  background: var(--bg-surface-2);
  border-left: 3px solid var(--border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.resolutionMeta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.resolutionAgent {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

.resolutionTime {
  font-size: 11px;
  color: var(--text-muted);
}

.resolutionComment {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  white-space: pre-wrap;
}
```

- [ ] **Step 4: Update CommentThread.tsx**

Replace the entire contents of `src/renderer/src/components/CommentThread.tsx` with:

```tsx
import type { ReviewComment } from '../../../shared/types'
import styles from './CommentThread.module.css'

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  comment: ReviewComment
}

export default function CommentThread({ comment }: Props): JSX.Element {
  const lineRange = comment.start_line === comment.end_line
    ? `Line ${comment.start_line}`
    : `Lines ${comment.start_line}–${comment.end_line}`

  return (
    <div className={`${styles.thread} ${comment.is_stale ? styles.stale : ''}`}>
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

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "CommentThread"
```

Expected: all 7 CommentThread tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/CommentThread.tsx src/renderer/src/components/CommentThread.module.css src/renderer/src/__tests__/CommentThread.test.tsx
git commit -m "feat: add status badge and resolution reply to CommentThread"
```

---

## Task 2: ReviewTimeline component

**Files:**
- Create: `src/renderer/src/components/ReviewTimeline.tsx`
- Create: `src/renderer/src/components/ReviewTimeline.module.css`
- Create: `src/renderer/src/__tests__/ReviewTimeline.test.tsx`

- [ ] **Step 1: Write failing tests for ReviewTimeline**

Create `src/renderer/src/__tests__/ReviewTimeline.test.tsx`:

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

const submittedReview: ReviewFile = {
  version: 1,
  id: 'rev-uuid',
  status: 'submitted',
  base_sha: 'abc',
  compare_sha: 'def',
  created_at: '2026-04-08T10:00:00Z',
  submitted_at: '2026-04-08T11:00:00Z',
  comments: [],
}

const inProgressReview: ReviewFile = {
  ...submittedReview,
  status: 'in_progress',
  submitted_at: null,
}

const comments: ReviewComment[] = [
  {
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
  },
  {
    id: 'RVW-002', file: 'src/bar.ts',
    start_line: 10, end_line: 12, side: 'right',
    body: 'Rename this variable', is_stale: false,
    context: [], status: 'open',
    resolution: null,
    created_at: '2026-04-08T11:05:00Z',
  },
]

describe('ReviewTimeline', () => {
  it('always shows the PR opened entry', () => {
    render(<ReviewTimeline pr={pr} review={null} comments={[]} />)
    expect(screen.getByText(/opened this pr/i)).toBeInTheDocument()
  })

  it('does not show review entry when review is null', () => {
    render(<ReviewTimeline pr={pr} review={null} comments={[]} />)
    expect(screen.queryByText(/review submitted/i)).not.toBeInTheDocument()
  })

  it('does not show review entry when review is in_progress', () => {
    render(<ReviewTimeline pr={pr} review={inProgressReview} comments={[]} />)
    expect(screen.queryByText(/review submitted/i)).not.toBeInTheDocument()
  })

  it('shows review submitted entry with comment count when submitted', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={comments} />)
    expect(screen.getByText(/review submitted with 2 comments/i)).toBeInTheDocument()
  })

  it('shows singular "comment" for one comment', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={[comments[0]]} />)
    expect(screen.getByText(/review submitted with 1 comment/i)).toBeInTheDocument()
  })

  it('renders comment bodies under the review entry', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={comments} />)
    expect(screen.getByText('Add null check here')).toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('does not render stale comments in the timeline', () => {
    const staleComment = { ...comments[0], is_stale: true }
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={[staleComment, comments[1]]} />)
    expect(screen.queryByText('Add null check here')).not.toBeInTheDocument()
    expect(screen.getByText('Rename this variable')).toBeInTheDocument()
  })

  it('renders resolution reply for resolved comments', () => {
    render(<ReviewTimeline pr={pr} review={submittedReview} comments={comments} />)
    expect(screen.getByText('Fixed with optional chaining.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "ReviewTimeline"
```

Expected: all 8 tests fail with "Cannot find module".

- [ ] **Step 3: Create ReviewTimeline.module.css**

Create `src/renderer/src/components/ReviewTimeline.module.css`:

```css
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.entry {
  display: flex;
  gap: 16px;
  position: relative;
}

/* Vertical connecting line between entries */
.entry:not(:last-child) .rail::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 16px;
  bottom: -8px;
  width: 2px;
  background: var(--border);
}

.rail {
  position: relative;
  flex-shrink: 0;
  width: 16px;
  padding-top: 2px;
}

.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: var(--bg);
  position: relative;
  z-index: 1;
}

.dotActive {
  border-color: var(--accent);
  background: var(--accent);
}

.content {
  flex: 1;
  padding-bottom: 24px;
}

.entryHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  min-height: 16px;
}

.entryTitle {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.entryTime {
  font-size: 12px;
  color: var(--text-muted);
}

.commentList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 4: Create ReviewTimeline.tsx**

Create `src/renderer/src/components/ReviewTimeline.tsx`:

```tsx
import type { PRFile, ReviewFile, ReviewComment } from '../../../shared/types'
import CommentThread from './CommentThread'
import styles from './ReviewTimeline.module.css'

function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  pr: PRFile
  review: ReviewFile | null
  comments: ReviewComment[]
}

export default function ReviewTimeline({ pr, review, comments }: Props): JSX.Element {
  const showReview = review !== null && review.status === 'submitted'
  const visibleComments = comments.filter((c) => !c.is_stale)
  const commentCount = visibleComments.length

  return (
    <div className={styles.timeline}>
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

      {showReview && (
        <div className={styles.entry}>
          <div className={styles.rail}>
            <div className={`${styles.dot} ${styles.dotActive}`} />
          </div>
          <div className={styles.content}>
            <div className={styles.entryHeader}>
              <span className={styles.entryTitle}>
                Review submitted with {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </span>
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
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | grep -A 3 "ReviewTimeline"
```

Expected: all 8 ReviewTimeline tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ReviewTimeline.tsx src/renderer/src/components/ReviewTimeline.module.css src/renderer/src/__tests__/ReviewTimeline.test.tsx
git commit -m "feat: add ReviewTimeline component for PR overview tab"
```

---

## Task 3: Mount ReviewTimeline in PR overview tab

**Files:**
- Modify: `src/renderer/src/screens/PR.tsx`

No new tests needed — `PR.tsx` is an integration screen; the component-level tests cover the behaviour.

- [ ] **Step 1: Add the import**

In `src/renderer/src/screens/PR.tsx`, add after the existing `ReviewPanel` import (line 8):

Find:
```tsx
import ReviewPanel from '../components/ReviewPanel'
```

Replace with:
```tsx
import ReviewPanel from '../components/ReviewPanel'
import ReviewTimeline from '../components/ReviewTimeline'
```

- [ ] **Step 2: Mount ReviewTimeline below the description card**

In `PR.tsx`, find the overview tab's `overviewMain` div (around line 344). The current structure is:

```tsx
<div className={styles.overviewMain}>
  <div className={styles.descriptionCard}>
    <div className={styles.cardHeader}>
      <span className={styles.cardTitle}>Description</span>
    </div>
    {pr.description ? (
      <div className={styles.descriptionBody}>{pr.description}</div>
    ) : (
      <div className={styles.descriptionEmpty}>No description provided.</div>
    )}
  </div>
</div>
```

Replace with:
```tsx
<div className={styles.overviewMain}>
  <div className={styles.descriptionCard}>
    <div className={styles.cardHeader}>
      <span className={styles.cardTitle}>Description</span>
    </div>
    {pr.description ? (
      <div className={styles.descriptionBody}>{pr.description}</div>
    ) : (
      <div className={styles.descriptionEmpty}>No description provided.</div>
    )}
  </div>
  <div className={styles.descriptionCard}>
    <div className={styles.cardHeader}>
      <span className={styles.cardTitle}>Activity</span>
    </div>
    <ReviewTimeline pr={pr} review={review} comments={comments} />
  </div>
</div>
```

- [ ] **Step 3: Run full test suite to verify nothing is broken**

```bash
npm run test:renderer -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/PR.tsx
git commit -m "feat: mount ReviewTimeline in PR overview tab"
```

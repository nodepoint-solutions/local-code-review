# Diff Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search bar to the "Files changed" tab that finds text within the diff lines, highlights all matching rows, and lets the user navigate between matches with Prev/Next buttons.

**Architecture:** Search state lives in `PR.tsx`. Match computation scans the in-memory `diff` data (case-insensitive string `includes`). Two derived values — `matchedLineNumbers: Set<number>` and `activeMatchLineNumber: number | null` — thread down through `DiffView → UnifiedDiff/SplitDiff → DiffLine`, which applies CSS classes for dim/bright row highlights. A floating `DiffSearchBar` component renders inside `diffPane` above the scrollable diff content. Scrolling to the active match uses a `data-diff-line-number` attribute on each `<tr>`.

**Tech Stack:** React, TypeScript, CSS Modules, Electron/Vite

---

## File Map

| File                                                            | Action | What changes                                                                                                                                             |
| --------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/App.css`                                      | Modify | Add `--search-match-bg`, `--search-match-active-bg`, `--search-match-active-border` CSS variables to both `:root`/dark and `[data-theme="light"]` blocks |
| `src/renderer/src/components/DiffView/DiffLine.module.css`      | Modify | Add `.searchMatch` and `.activeSearchMatch` rules                                                                                                        |
| `src/renderer/src/components/DiffView/DiffLine.tsx`             | Modify | Add `data-diff-line-number` attr to `<tr>`, accept `isSearchMatch?` and `isActiveSearchMatch?` props                                                     |
| `src/renderer/src/components/DiffView/UnifiedDiff.tsx`          | Modify | Accept `matchedLineNumbers?` + `activeMatchLineNumber?`, pass booleans to `DiffLine`                                                                     |
| `src/renderer/src/components/DiffView/SplitDiff.tsx`            | Modify | Same as UnifiedDiff                                                                                                                                      |
| `src/renderer/src/components/DiffView/index.tsx`                | Modify | Accept + forward `matchedLineNumbers?` + `activeMatchLineNumber?` to UnifiedDiff/SplitDiff                                                               |
| `src/renderer/src/components/DiffView/DiffSearchBar.tsx`        | Create | Search input, match count label, Prev/Next/Close buttons                                                                                                 |
| `src/renderer/src/components/DiffView/DiffSearchBar.module.css` | Create | Styles for the search bar strip                                                                                                                          |
| `src/renderer/src/screens/PR.tsx`                               | Modify | Search state, match computation, scroll effect, toolbar button, diffPane restructure, DiffSearchBar render, pass new props to DiffView                   |
| `src/renderer/src/screens/PR.module.css`                        | Modify | Change `.diffPane` to flex column, add `.diffScrollContent`                                                                                              |

---

### Task 1: CSS variables and DiffLine highlight rules

**Files:**

- Modify: `src/renderer/src/App.css`
- Modify: `src/renderer/src/components/DiffView/DiffLine.module.css`

- [ ] **Step 1: Add search highlight CSS variables to App.css**

In `src/renderer/src/App.css`, inside the `[data-theme="dark"]` / `:root` block (around line 43, after `--selection-border`), add:

```css
--search-match-bg: rgba(255, 200, 0, 0.12);
--search-match-active-bg: rgba(255, 185, 0, 0.32);
--search-match-active-border: #c99700;
```

In the `[data-theme="light"]` block (around line 127, after `--selection-border`), add:

```css
--search-match-bg: rgba(200, 150, 0, 0.12);
--search-match-active-bg: rgba(200, 140, 0, 0.28);
--search-match-active-border: #8a6200;
```

- [ ] **Step 2: Add search highlight rules to DiffLine.module.css**

At the bottom of `src/renderer/src/components/DiffView/DiffLine.module.css`, add:

```css
/* ─── Search highlight ────────────────────── */
.searchMatch .code {
  background: var(--search-match-bg);
}
.activeSearchMatch .code {
  background: var(--search-match-active-bg);
  box-shadow: inset 3px 0 0 var(--search-match-active-border);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.css src/renderer/src/components/DiffView/DiffLine.module.css
git commit -m "feat: add search highlight CSS variables and DiffLine rules"
```

---

### Task 2: DiffLine — data attribute and new props

**Files:**

- Modify: `src/renderer/src/components/DiffView/DiffLine.tsx`

- [ ] **Step 1: Add `isSearchMatch` and `isActiveSearchMatch` props and `data-diff-line-number` attribute**

Replace the `Props` interface (lines 5–17) with:

```tsx
interface Props {
  line: ParsedLine
  comments: ReviewComment[]
  language?: string | null
  onStartComment: (diffLineNumber: number, side: 'left' | 'right') => void
  onExtendComment: (diffLineNumber: number) => void
  onHoverLine?: (lineNumber: number) => void
  isSelecting: boolean
  selectionStart: number | null
  selectionEnd?: number | null
  hoverLine?: number | null
  side?: 'left' | 'right'
  isSearchMatch?: boolean
  isActiveSearchMatch?: boolean
}
```

Update the function signature to destructure the new props (replace lines 19–31):

```tsx
export default function DiffLine({
  line,
  comments,
  language = null,
  onStartComment,
  onExtendComment,
  onHoverLine = () => {},
  isSelecting,
  selectionStart,
  selectionEnd = null,
  hoverLine = null,
  side = 'right',
  isSearchMatch = false,
  isActiveSearchMatch = false,
}: Props): JSX.Element | null {
```

Update the `lineClass` computation (replace lines 60–65):

```tsx
const lineClass = [
  styles.line,
  styles[line.type],
  isInSelection ? styles.inSelection : '',
  hasReviewComments ? styles.hasReviewComment : '',
  isActiveSearchMatch ? styles.activeSearchMatch : isSearchMatch ? styles.searchMatch : '',
]
  .filter(Boolean)
  .join(' ')
```

Add `data-diff-line-number` to the `<tr>` (replace the opening `<tr` tag at line 72):

```tsx
    <tr
      data-diff-line-number={line.diffLineNumber}
      className={lineClass}
      onMouseEnter={handleMouseEnter}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/DiffView/DiffLine.tsx
git commit -m "feat: add search highlight props and data-diff-line-number to DiffLine"
```

---

### Task 3: Thread search props through UnifiedDiff

**Files:**

- Modify: `src/renderer/src/components/DiffView/UnifiedDiff.tsx`

- [ ] **Step 1: Add search props to UnifiedDiff's Props interface**

In `src/renderer/src/components/DiffView/UnifiedDiff.tsx`, add to the `Props` interface (after line 26, before the closing `}`):

```tsx
  matchedLineNumbers?: Set<number>
  activeMatchLineNumber?: number | null
```

- [ ] **Step 2: Destructure the new props in the function signature**

Update the function signature (lines 28–35) to include the new props:

```tsx
export default function UnifiedDiff({
  file, comments, language,
  onStartComment, onExtendComment, onHoverLine,
  isSelecting, selectionStart, selectionEnd, hoverLine,
  allowDeleteComment, onDeleteComment, focusedCommentId,
  showCommentBox, commentBoxEndLine, commentBoxStartLine,
  onCommentBoxSubmit, onCommentBoxCancel,
  matchedLineNumbers, activeMatchLineNumber,
}: Props): JSX.Element {
```

- [ ] **Step 3: Pass booleans to each DiffLine**

In the `<DiffLine>` render inside `.map` (around line 50), add two props:

```tsx
<DiffLine
  key={`line-${line.diffLineNumber}`}
  line={line}
  language={language}
  comments={comments.filter(
    (c) => c.start_line <= line.diffLineNumber && c.end_line >= line.diffLineNumber
  )}
  onStartComment={onStartComment}
  onExtendComment={onExtendComment}
  onHoverLine={onHoverLine}
  isSelecting={isSelecting}
  selectionStart={selectionStart}
  selectionEnd={selectionEnd}
  hoverLine={hoverLine}
  side="right"
  isSearchMatch={matchedLineNumbers?.has(line.diffLineNumber) ?? false}
  isActiveSearchMatch={activeMatchLineNumber === line.diffLineNumber}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/DiffView/UnifiedDiff.tsx
git commit -m "feat: thread search highlight props through UnifiedDiff"
```

---

### Task 4: Thread search props through SplitDiff

**Files:**

- Modify: `src/renderer/src/components/DiffView/SplitDiff.tsx`

- [ ] **Step 1: Add search props to SplitDiff's Props interface**

In `src/renderer/src/components/DiffView/SplitDiff.tsx`, add to the `Props` interface (after line 26, before the closing `}`):

```tsx
  matchedLineNumbers?: Set<number>
  activeMatchLineNumber?: number | null
```

- [ ] **Step 2: Destructure the new props in the function signature**

Update the function signature (lines 55–62) to include the new props:

```tsx
export default function SplitDiff({
  file, comments, language,
  onStartComment, onExtendComment, onHoverLine,
  isSelecting, selectionStart, selectionEnd, hoverLine,
  allowDeleteComment, onDeleteComment, focusedCommentId,
  showCommentBox, commentBoxEndLine, commentBoxStartLine,
  onCommentBoxSubmit, onCommentBoxCancel,
  matchedLineNumbers, activeMatchLineNumber,
}: Props): JSX.Element {
```

- [ ] **Step 3: Pass booleans to the left DiffLine**

Find the left-side `<DiffLine>` (around line 96) and add the two props:

```tsx
<DiffLine
  line={pair.left}
  language={language}
  comments={[]}
  onStartComment={onStartComment}
  onExtendComment={onExtendComment}
  onHoverLine={onHoverLine}
  isSelecting={isSelecting}
  selectionStart={selectionStart}
  selectionEnd={selectionEnd}
  hoverLine={hoverLine}
  side="left"
  isSearchMatch={matchedLineNumbers?.has(pair.left.diffLineNumber) ?? false}
  isActiveSearchMatch={activeMatchLineNumber === pair.left.diffLineNumber}
/>
```

- [ ] **Step 4: Pass booleans to the right DiffLine**

Find the right-side `<DiffLine>` (around line 115) and add the two props:

```tsx
<DiffLine
  line={pair.right}
  language={language}
  comments={[]}
  onStartComment={onStartComment}
  onExtendComment={onExtendComment}
  onHoverLine={onHoverLine}
  isSelecting={isSelecting}
  selectionStart={selectionStart}
  selectionEnd={selectionEnd}
  hoverLine={hoverLine}
  side="right"
  isSearchMatch={matchedLineNumbers?.has(pair.right.diffLineNumber) ?? false}
  isActiveSearchMatch={activeMatchLineNumber === pair.right.diffLineNumber}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/DiffView/SplitDiff.tsx
git commit -m "feat: thread search highlight props through SplitDiff"
```

---

### Task 5: Thread search props through DiffView/index.tsx

**Files:**

- Modify: `src/renderer/src/components/DiffView/index.tsx`

- [ ] **Step 1: Add search props to the DiffView Props interface**

In `src/renderer/src/components/DiffView/index.tsx`, update the `Props` interface (lines 9–18) to add:

```tsx
interface Props {
  file: ParsedFile
  comments: ReviewComment[]
  view: 'unified' | 'split'
  onAddComment: (
    payload: Omit<AddCommentPayload, 'repoPath' | 'prId' | 'reviewId'>
  ) => Promise<void>
  readOnly?: boolean
  allowDeleteComment?: boolean
  onDeleteComment?: (commentId: string) => void
  focusedCommentId?: string
  matchedLineNumbers?: Set<number>
  activeMatchLineNumber?: number | null
}
```

- [ ] **Step 2: Destructure and forward the new props**

Update the function signature (lines 36–39) to include the new props:

```tsx
export default function DiffView({
  file, comments, view, onAddComment, readOnly = false,
  allowDeleteComment, onDeleteComment, focusedCommentId,
  matchedLineNumbers, activeMatchLineNumber,
}: Props): JSX.Element {
```

Pass the new props to `UnifiedDiff` (around line 149):

```tsx
<UnifiedDiff
  file={file}
  comments={comments}
  language={language}
  onStartComment={handleStartComment}
  onExtendComment={handleExtendComment}
  onHoverLine={handleHoverLine}
  isSelecting={isSelecting}
  selectionStart={selectionStart}
  selectionEnd={selectionEnd}
  hoverLine={hoverLine}
  allowDeleteComment={allowDeleteComment}
  onDeleteComment={onDeleteComment}
  focusedCommentId={focusedCommentId}
  showCommentBox={showCommentBox}
  commentBoxEndLine={
    selectionStart !== null && selectionEnd !== null ? Math.max(selectionStart, selectionEnd) : null
  }
  commentBoxStartLine={
    selectionStart !== null && selectionEnd !== null ? Math.min(selectionStart, selectionEnd) : null
  }
  onCommentBoxSubmit={handleSubmitComment}
  onCommentBoxCancel={handleCancelComment}
  matchedLineNumbers={matchedLineNumbers}
  activeMatchLineNumber={activeMatchLineNumber}
/>
```

Pass the new props to `SplitDiff` (around line 170):

```tsx
<SplitDiff
  file={file}
  comments={comments}
  language={language}
  onStartComment={handleStartComment}
  onExtendComment={handleExtendComment}
  onHoverLine={handleHoverLine}
  isSelecting={isSelecting}
  selectionStart={selectionStart}
  selectionEnd={selectionEnd}
  hoverLine={hoverLine}
  allowDeleteComment={allowDeleteComment}
  onDeleteComment={onDeleteComment}
  focusedCommentId={focusedCommentId}
  showCommentBox={showCommentBox}
  commentBoxEndLine={
    selectionStart !== null && selectionEnd !== null ? Math.max(selectionStart, selectionEnd) : null
  }
  commentBoxStartLine={
    selectionStart !== null && selectionEnd !== null ? Math.min(selectionStart, selectionEnd) : null
  }
  onCommentBoxSubmit={handleSubmitComment}
  onCommentBoxCancel={handleCancelComment}
  matchedLineNumbers={matchedLineNumbers}
  activeMatchLineNumber={activeMatchLineNumber}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/DiffView/index.tsx
git commit -m "feat: thread search highlight props through DiffView"
```

---

### Task 6: Create DiffSearchBar component

**Files:**

- Create: `src/renderer/src/components/DiffView/DiffSearchBar.tsx`
- Create: `src/renderer/src/components/DiffView/DiffSearchBar.module.css`

- [ ] **Step 1: Create DiffSearchBar.tsx**

Create `src/renderer/src/components/DiffView/DiffSearchBar.tsx` with this content:

```tsx
import { useEffect, useRef } from 'react'
import styles from './DiffSearchBar.module.css'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  activeIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

function SearchIcon(): JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export default function DiffSearchBar({
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onPrev,
  onNext,
  onClose,
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      if (e.shiftKey) onPrev()
      else onNext()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const matchLabel =
    query === '' ? '' : matchCount === 0 ? 'No results' : `${activeIndex + 1} of ${matchCount}`

  return (
    <div className={styles.bar}>
      <span className={styles.icon}>
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in diff…"
      />
      {matchLabel && (
        <span className={`${styles.count} ${matchCount === 0 ? styles.noResults : ''}`}>
          {matchLabel}
        </span>
      )}
      <button
        className={styles.navBtn}
        onClick={onPrev}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
      >
        ↑
      </button>
      <button
        className={styles.navBtn}
        onClick={onNext}
        disabled={matchCount === 0}
        title="Next match (Enter)"
      >
        ↓
      </button>
      <button className={styles.closeBtn} onClick={onClose} title="Close search">
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create DiffSearchBar.module.css**

Create `src/renderer/src/components/DiffView/DiffSearchBar.module.css` with this content:

```css
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 1;
}

.icon {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.input {
  flex: 1;
  max-width: 280px;
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  outline: none;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

.count {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 60px;
}
.noResults {
  color: var(--removed-text);
}

.navBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background var(--transition),
    color var(--transition);
}
.navBtn:hover:not(:disabled) {
  background: var(--bg-surface-2);
  color: var(--text);
  border-color: transparent;
}
.navBtn:disabled {
  opacity: 0.4;
  cursor: default;
}

.closeBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 13px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  margin-left: 2px;
  transition:
    background var(--transition),
    color var(--transition);
}
.closeBtn:hover {
  background: var(--bg-surface-2);
  color: var(--text);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/DiffView/DiffSearchBar.tsx src/renderer/src/components/DiffView/DiffSearchBar.module.css
git commit -m "feat: create DiffSearchBar component"
```

---

### Task 7: Wire up search in PR.tsx and PR.module.css

**Files:**

- Modify: `src/renderer/src/screens/PR.tsx`
- Modify: `src/renderer/src/screens/PR.module.css`

- [ ] **Step 1: Add `useMemo` to the React import in PR.tsx**

Change line 1 from:

```tsx
import React, { useEffect, useRef, useState } from 'react'
```

to:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
```

- [ ] **Step 2: Import DiffSearchBar in PR.tsx**

After the existing `import DiffView from '../components/DiffView'` line, add:

```tsx
import DiffSearchBar from '../components/DiffView/DiffSearchBar'
```

- [ ] **Step 3: Add a SearchIcon component in PR.tsx**

After the existing `ReviewIcon` function (around line 49), add:

```tsx
function SearchIcon(): JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
```

- [ ] **Step 4: Add search state in the PR component**

In the `PR` function, after the existing state declarations (after the `dragStartWidth` ref around line 113), add:

```tsx
const [searchOpen, setSearchOpen] = useState(false)
const [searchQuery, setSearchQuery] = useState('')
const [searchMatchIndex, setSearchMatchIndex] = useState(0)
```

- [ ] **Step 5: Add match computation**

After the search state declarations, add:

```tsx
const searchMatches = useMemo(() => {
  if (!searchQuery || !prDetail) return []
  const q = searchQuery.toLowerCase()
  const matches: Array<{ diffLineNumber: number }> = []
  for (const file of diff) {
    for (const line of file.lines) {
      if (line.type !== 'hunk-header' && line.content.toLowerCase().includes(q)) {
        matches.push({ diffLineNumber: line.diffLineNumber })
      }
    }
  }
  return matches
}, [searchQuery, prDetail])

const matchedLineNumbers = useMemo(
  () => new Set(searchMatches.map((m) => m.diffLineNumber)),
  [searchMatches]
)
const activeMatchLineNumber = searchMatches[searchMatchIndex]?.diffLineNumber ?? null
```

Note: `diff` and `prDetail` are declared later in the component (around line 394). The `useMemo` depends on `prDetail` which covers `diff` — this is fine; `prDetail` is in scope at the point where this code is inserted (it's used throughout the component). Place this block just before the `useEffect` calls rather than immediately after the state declarations if TypeScript complains about `diff` not yet being in scope — `diff` is destructured from `prDetail` on line 394. Instead, reference `prDetail?.diff ?? []`:

```tsx
const searchMatches = useMemo(() => {
  if (!searchQuery || !prDetail) return []
  const q = searchQuery.toLowerCase()
  const matches: Array<{ diffLineNumber: number }> = []
  for (const file of prDetail.diff ?? []) {
    for (const line of file.lines) {
      if (line.type !== 'hunk-header' && line.content.toLowerCase().includes(q)) {
        matches.push({ diffLineNumber: line.diffLineNumber })
      }
    }
  }
  return matches
}, [searchQuery, prDetail])

const matchedLineNumbers = useMemo(
  () => new Set(searchMatches.map((m) => m.diffLineNumber)),
  [searchMatches]
)
const activeMatchLineNumber = searchMatches[searchMatchIndex]?.diffLineNumber ?? null
```

- [ ] **Step 6: Add reset and scroll effects**

After the match computation block, add two effects:

```tsx
useEffect(() => {
  setSearchMatchIndex(0)
}, [searchQuery])

useEffect(() => {
  if (activeMatchLineNumber === null) return
  const el = document.querySelector(`tr[data-diff-line-number="${activeMatchLineNumber}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, [activeMatchLineNumber])
```

- [ ] **Step 7: Add `handleSearchClose` helper**

After the existing `scrollToFile` function (around line 381), add:

```tsx
function handleSearchClose(): void {
  setSearchOpen(false)
  setSearchQuery('')
}
```

- [ ] **Step 8: Add the search button to the toolbar**

In the `viewToggle` div (around lines 496–514 in the `tab === 'files'` condition), add the search button after the split button:

```tsx
{
  tab === 'files' && (
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
      >
        <UnifiedIcon />
      </button>
      <button
        className={`${styles.toggleBtn} ${diffView === 'split' ? styles.toggleActive : ''}`}
        onClick={() => setDiffView('split')}
        title="Split diff"
      >
        <SplitIcon />
      </button>
      <button
        className={`${styles.toggleBtn} ${searchOpen ? styles.toggleActive : ''}`}
        onClick={() => setSearchOpen((o) => !o)}
        title="Search in diff"
      >
        <SearchIcon />
      </button>
    </div>
  )
}
```

- [ ] **Step 9: Restructure the files tab — diffPane becomes a flex column**

In the `tab === 'files'` block (around lines 836–866), replace the `diffPane` div so it contains `DiffSearchBar` and an inner scroll wrapper:

```tsx
{
  tab === 'files' && (
    <div className={`${styles.filesBody} ${reviewPanelOpen ? styles.bodyShifted : ''}`}>
      <div ref={treePanelRef} className={styles.treePanel} style={{ width: treeWidth }}>
        <FileTree files={diff} onSelect={scrollToFile} />
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      <div ref={diffPaneRef} className={styles.diffPane}>
        {searchOpen && (
          <DiffSearchBar
            query={searchQuery}
            onQueryChange={(q) => setSearchQuery(q)}
            matchCount={searchMatches.length}
            activeIndex={searchMatchIndex}
            onPrev={() =>
              setSearchMatchIndex(
                (i) =>
                  (i - 1 + Math.max(1, searchMatches.length)) % Math.max(1, searchMatches.length)
              )
            }
            onNext={() => setSearchMatchIndex((i) => (i + 1) % Math.max(1, searchMatches.length))}
            onClose={handleSearchClose}
          />
        )}
        <div className={styles.diffScrollContent}>
          {diff.map((file) => (
            <div
              key={file.newPath}
              ref={(el) => {
                fileRefs.current[file.newPath] = el
              }}
            >
              <DiffView
                file={file}
                comments={comments.filter((c) => c.file === file.newPath)}
                view={diffView}
                onAddComment={handleAddComment}
                readOnly={
                  workflow.phase === 'reviewed' ||
                  workflow.phase === 'in_fix' ||
                  workflow.phase === 'closed'
                }
                allowDeleteComment={review?.status === 'in_progress'}
                onDeleteComment={handleDeleteComment}
                focusedCommentId={navComments[focusedCommentIndex]?.id}
                matchedLineNumbers={matchedLineNumbers}
                activeMatchLineNumber={activeMatchLineNumber}
              />
            </div>
          ))}
        </div>
      </div>
      {!reviewPanelOpen && (
        <CommentOutline
          comments={navComments}
          focusedIndex={focusedCommentIndex}
          onSelect={handleCommentNav}
        />
      )}
    </div>
  )
}
```

Note: `CommentOutline` stays as a flex sibling of `diffPane` inside `filesBody` (it has `width: 220px; flex-shrink: 0` and is not absolutely positioned — moving it inside `diffPane` would break the layout).

- [ ] **Step 10: Update `.diffPane` and add `.diffScrollContent` in PR.module.css**

Replace the `.diffPane` rule (around line 820) and add `.diffScrollContent`:

```css
.diffPane {
  flex: 1;
  overflow: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.diffScrollContent {
  flex: 1;
  overflow-y: auto;
}
```

- [ ] **Step 11: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/src/screens/PR.tsx src/renderer/src/screens/PR.module.css
git commit -m "feat: wire up diff search in PR screen"
```

---

## Manual Verification Checklist

After all tasks are complete, start the dev server and verify:

```bash
npm run dev
```

- [ ] "Files changed" tab shows a magnifier button in the toolbar alongside unified/split buttons
- [ ] Clicking the magnifier opens the search bar; button gets the active style
- [ ] Typing in the search bar highlights all matching rows with a dim yellow background
- [ ] The first match gets the bright yellow highlight with left-border accent
- [ ] The match count shows "1 of N" correctly
- [ ] Next button / Enter advances to the next match (wraps around)
- [ ] Prev button / Shift+Enter goes to the previous match (wraps around)
- [ ] Clicking ✕ or pressing Escape closes the bar and clears highlights
- [ ] "No results" appears in red when the query has no matches
- [ ] Diff type colours (green added, red removed) still show through the highlight
- [ ] The unified/split toggle still works while search is open
- [ ] Comment navigation (CommentOutline, CommentNav) still works while search is open
- [ ] Works in both unified and split views

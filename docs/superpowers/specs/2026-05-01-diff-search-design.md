# Diff Search — Design Spec

**Date:** 2026-05-01  
**Status:** Approved

## Overview

Add a search dialog to the "Files changed" tab that lets the user search for a string within the rendered diff content (the PR's changed lines), with next/previous navigation between matches.

## Scope

- Searches only the diff line content already in memory (`ParsedFile[].lines[].content`), not the repository filesystem.
- Available only on the "Files changed" tab.
- Line-level highlighting: entire matching rows are highlighted, not individual characters within syntax-highlighted HTML.

## Architecture

### State (PR.tsx)

Three new state values:

```ts
const [searchOpen, setSearchOpen] = useState(false)
const [searchQuery, setSearchQuery] = useState('')
const [searchMatchIndex, setSearchMatchIndex] = useState(0)
```

### Match computation (PR.tsx)

Computed (not state) whenever `searchQuery` or `diff` changes:

```ts
type SearchMatch = { diffLineNumber: number }
```

Scan all `diff[fileIndex].lines[lineIndex].content` with a case-insensitive `includes` check. Collect a flat `SearchMatch[]` list in file-then-line order. Derive:

- `matchedLineNumbers: Set<number>` — all matching `diffLineNumber` values (for dim highlight)
- `activeMatchLineNumber: number | null` — `matches[searchMatchIndex]?.diffLineNumber ?? null` (for bright highlight)

### Scrolling (PR.tsx)

A `useEffect` watches `activeMatchLineNumber`. When it changes and is non-null:

```ts
document.querySelector(`tr[data-diff-line-number="${activeMatchLineNumber}"]`)
  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
```

If the file containing the match is collapsed (rows not in DOM), the scroll is a no-op. No auto-expand for now.

### DiffLine.tsx

- Add `data-diff-line-number={line.diffLineNumber}` to the `<tr>`.
- Accept two new optional props: `isSearchMatch?: boolean`, `isActiveSearchMatch?: boolean`.
- Apply CSS classes `styles.searchMatch` and `styles.activeSearchMatch` accordingly.

### UnifiedDiff.tsx / SplitDiff.tsx

Accept and forward `matchedLineNumbers?: Set<number>` and `activeMatchLineNumber?: number | null`, computing the two boolean props for each `DiffLine`.

### DiffView/index.tsx

Accept and forward the same two props to `UnifiedDiff` / `SplitDiff`.

### PR.tsx — files tab render

Pass `matchedLineNumbers` and `activeMatchLineNumber` to each `DiffView` instance in the files tab.

## New Component: DiffSearchBar

**File:** `src/renderer/src/components/DiffView/DiffSearchBar.tsx`  
**CSS:** `DiffSearchBar.module.css`

Props:

```ts
interface Props {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  activeIndex: number        // 0-based
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}
```

Layout (left to right):

1. Magnifier icon (decorative)
2. `<input>` — autofocused on mount, `type="text"`, placeholder `"Search in diff…"`
3. Match count label — `"X of N"` when matches exist, `"No results"` when `matchCount === 0` and `query` is non-empty, empty when `query` is empty
4. Prev button (`↑`) — disabled when `matchCount === 0`
5. Next button (`↓`) — disabled when `matchCount === 0`
6. Close button (`✕`)

Keyboard:
- `Enter` → `onNext`
- `Shift+Enter` → `onPrev`
- `Escape` → `onClose`

Positioned as a non-scrolling strip pinned to the top of `diffPane`, above the file list scroll container. To achieve this, `diffPane` becomes a `flex-direction: column` container with two children: `DiffSearchBar` (fixed height, non-scrolling) and an inner `diffScrollContent` div (`flex: 1; overflow-y: auto`) that wraps the `DiffView` instances. The `DiffSearchBar` is only rendered when `searchOpen === true`.

## Toolbar Button

A search/magnifier icon button added to the `viewToggle` group in `PR.tsx` (right side of the tab bar, alongside unified/split buttons). Uses the existing `toggleBtn` / `toggleActive` CSS classes. Active when `searchOpen === true`.

Closing the search bar (✕ or Escape) sets `searchOpen = false` and clears `searchQuery`.

## CSS

New variables in the existing theme:

```css
--search-match-bg: rgba(255, 200, 0, 0.18);
--search-match-active-bg: rgba(255, 185, 0, 0.40);
--search-match-active-border: #e6a800;
```

`DiffLine.module.css` additions:

```css
.searchMatch td.code {
  background: var(--search-match-bg);
}
.activeSearchMatch td.code {
  background: var(--search-match-active-bg);
  box-shadow: inset 3px 0 0 var(--search-match-active-border);
}
```

These have lower specificity than the existing `.added` / `.removed` backgrounds, so diff type colouring still shows through (the match highlight blends additively).

## Navigation Logic

`onNext`: `setSearchMatchIndex((i) => (i + 1) % matchCount)`  
`onPrev`: `setSearchMatchIndex((i) => (i - 1 + matchCount) % matchCount)`  
Reset `searchMatchIndex` to `0` whenever `searchQuery` changes.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/screens/PR.tsx` | Search state, match computation, scroll effect, toolbar button, DiffSearchBar render |
| `src/renderer/src/screens/PR.module.css` | CSS variables for search highlight colours |
| `src/renderer/src/components/DiffView/index.tsx` | Accept + forward `matchedLineNumbers`, `activeMatchLineNumber` |
| `src/renderer/src/components/DiffView/UnifiedDiff.tsx` | Accept + forward, pass booleans to DiffLine |
| `src/renderer/src/components/DiffView/SplitDiff.tsx` | Accept + forward, pass booleans to DiffLine |
| `src/renderer/src/components/DiffView/DiffLine.tsx` | `data-diff-line-number` attr, two new optional props + classes |
| `src/renderer/src/components/DiffView/DiffLine.module.css` | `.searchMatch`, `.activeSearchMatch` |
| `src/renderer/src/components/DiffView/DiffSearchBar.tsx` | New component |
| `src/renderer/src/components/DiffView/DiffSearchBar.module.css` | New styles |

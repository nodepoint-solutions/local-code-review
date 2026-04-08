# AGENTS.md — local-code-review

Guidance for AI agents working in this repository.

## Project

A local Electron desktop app for reviewing git diffs in a simulated GitHub-style PR workflow. Branch vs branch diff, inline comments, staged review submission, LLM-friendly export (Markdown + JSON).

Design spec: `docs/superpowers/specs/2026-04-08-pr-reviewer-design.md`
Implementation plan: `docs/superpowers/plans/2026-04-08-local-code-review.md`

## Architecture

```
src/
  main/       # Node.js — all business logic (DB, git, IPC handlers, export)
  preload/    # contextBridge — typed window.api surface
  renderer/   # React — purely presentational, no direct DB or git access
  shared/     # TypeScript types and utilities shared across all three layers
```

- **Never** import main process code from the renderer. Shared utilities go in `src/shared/`.
- All git operations go through `src/main/git/runner.ts` (spawns system `git`).
- All DB operations go through `src/main/db/` functions — no raw SQL outside those files.
- IPC channel names follow `noun:verb` convention (e.g. `repos:list`, `prs:create`).

## Tech Stack

- Electron + electron-vite, React 18, TypeScript
- better-sqlite3 (synchronous SQLite — no async DB calls)
- Zustand (renderer state), react-router-dom (HashRouter)
- Vitest + @testing-library/react, CSS Modules

## Development

```bash
npm install
npx electron-rebuild -f -w better-sqlite3   # required after install
npm run dev        # dev mode with hot reload
npm test           # all tests
npm run test:main  # main process tests (Node env)
npm run test:renderer  # renderer tests (jsdom)
```

## Coding Standards

- TypeScript strict mode. No `any` unless unavoidable and commented.
- TDD: write the failing test first, then implement.
- One responsibility per file. Keep files focused and small.
- CSS Modules for all component styles. No inline styles except dynamic values.
- No `console.log` left in committed code.
- Commits are atomic and follow: `feat:`, `fix:`, `chore:`, `test:`, `docs:` prefixes.

## Testing

- Main process tests: `src/main/__tests__/` — use in-memory SQLite (`new Database(':memory:')`)
- Renderer tests: `src/renderer/src/__tests__/` — use React Testing Library
- No mocking of the DB layer in main tests — use real in-memory SQLite
- Test the behaviour, not the implementation

## Key Constraints

- No cloud APIs, no network calls, no server process.
- System `git` must be on PATH — no git libraries.
- Unified/split diff view toggle is purely visual — comments are anchored by diff line number in the DB and must render correctly in both views.
- Stale comments are excluded from exports.
- Worktrees live in `.worktrees/` (gitignored).

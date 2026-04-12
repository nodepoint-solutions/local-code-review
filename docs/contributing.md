# Contributing

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron |
| Build tooling | electron-vite |
| Renderer | React + Vite |
| State management | Zustand |
| Database | SQLite (better-sqlite3, stored in platform userData) |
| Git | System `git` binary — no git libraries |

## Getting started

**Prerequisites:** Node.js 20+, `git` on your `$PATH`.

```bash
npm install
npm run dev
```

On first launch, point Local Code Review at a directory to scan for git repositories. Open a repo, create a PR, and start reviewing.

To connect your AI agent, go to **Settings → MCP Integrations** and click **Install / Repair All**. This writes the MCP server config and installs the agent skill into every detected tool.

## Building for distribution

```bash
npm run build        # compile renderer + main + MCP server
npm run dist         # package into a distributable (output: out/)
```

Platform-specific builds are produced automatically based on the host OS. Use a CI matrix (macOS, Windows, Linux) to produce all three.

## Running tests

```bash
npm test
```

Tests use Vitest and cover the main process (diff parser, branch utilities, review store, export) and renderer components.

## Architecture

```
src/
├── main/        # Node.js — git ops, SQLite, diff parsing, IPC handlers
├── mcp-server/  # Standalone MCP server process
├── preload/     # contextBridge — exposes typed IPC API to renderer
├── renderer/    # React — pure UI, calls preload API, renders diffs + comments
└── shared/      # Types and utilities shared across process boundaries
```

**IPC pattern:** Renderer calls `window.api.someMethod(args)` → preload forwards via `ipcRenderer.invoke` → main handles (queries SQLite or shells out to git) → returns typed result → renderer updates Zustand store.

All business logic lives in the main process. The renderer is purely presentational.

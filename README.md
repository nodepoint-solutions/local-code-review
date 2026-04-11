# Local Review

A desktop app for reviewing AI-generated code before it reaches GitHub. Built for developers who use agent-driven workflows and want a quality gate that keeps premature code off the team's radar.

---

## Why

Spec-driven and agentic workflows produce great functional results but imperfect code. The "agent reviews" built into tools like GSD and Superpowers handle most of the heavy lifting — but there's still value in a manual pass before publishing.

The alternative is reviewing in GitHub (or a draft PR), which steals focus, creates noise for your team, and makes "work in progress" feel more official than it is.

Local Review keeps the entire process offline until you decide it's ready.

### Workflow comparison

**Traditional (Copilot in VS Code):**
```
prompt → review code → fix code → repeat
```

**Agentic + Local Review:**
```
you: up-front design (most of your effort)
agent: builds the feature
agent: internal reviews within the workflow
you: one manual review pass in Local Review
agent: resolves your comments via MCP
repeat if needed, then push to GitHub
```

Bigger batches, less context switching, no premature GitHub noise.

![Local Review — PR view showing a diff with inline review comments, a comment thread, and the review timeline](docs/screenshot.png)

---

## Features

### Local PR workflow

- Open any local git repository
- Create a simulated PR by picking two branches (compare → base)
- Review the diff with inline comments, just like GitHub
- Submit the review when done

### Diff viewer

- Unified and split diff views (toggle per PR)
- File tree sidebar with jump-to-file navigation
- Click a line (or drag across lines) to open a comment box
- Comments are persisted in a local SQLite database
- Staleness detection: if branches move after a review, affected comments are flagged

### Review rounds

PRs move through a clear lifecycle:

```
awaiting review → reviewing → reviewed → in fix → fix complete
                     ↑__________________________________|
                            (start new review round)
```

Once a review is submitted, you assign it to an agent. The agent resolves comments via MCP. When all comments are resolved, you can start another review round or close the PR.

### MCP server for agent integration

Local Review runs an MCP server that AI agents connect to directly. Once connected, the agent can:

| Tool | Description |
|---|---|
| `list_prs` | List all PRs in a repository |
| `get_pr` | Get PR metadata and review summary |
| `get_review` | Get full review content with all comments |
| `get_open_issues` | Get only unresolved comments (defaults to latest review) |
| `mark_resolved` | Mark a comment resolved with an explanation |
| `mark_wont_fix` | Mark a comment as won't fix with a reason |
| `complete_assignment` | Signal that all issues are addressed; unassigns the agent |

The agent is expected to fix, commit, and mark issues — in that order, one logical group at a time. The skill installed alongside the MCP server enforces this workflow automatically.

### Agent skill auto-install

When you install the MCP integration, Local Review also installs a skill into your AI tools. The skill tells the agent exactly how to work through a review assignment: load open issues, organise them into logical commits, fix and commit each group, mark issues resolved, and call `complete_assignment` when done.

Supported tools:

- Claude Code
- Claude Desktop
- VS Code (GitHub Copilot)
- Cursor
- Windsurf

### Export

At any point you can export a review to Markdown and JSON for feeding to an LLM manually. Exports include:

- PR metadata (title, branches, SHAs)
- Each comment with surrounding context lines
- Sequential issue IDs (`RVW-001`, `RVW-002`, ...) for easy LLM reference
- Stale comments excluded automatically

### Push to GitHub

Once you're happy with the code, a button transfers the PR to GitHub for team review. Everything stays local until you choose to publish.

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron |
| Build tooling | electron-vite |
| Renderer | React + Vite |
| State management | Zustand |
| Database | SQLite (better-sqlite3, stored in platform userData) |
| Git | System `git` binary — no git libraries |

---

## Requirements

- macOS, Windows, or Linux
- `git` installed and on `$PATH`
- One or more of: Claude Code, Claude Desktop, VS Code, Cursor, or Windsurf (for MCP integration)

---

## Getting started

```bash
npm install
npm run dev
```

On first launch, point Local Review at a directory to scan for git repositories. Open a repo, create a PR, and start reviewing.

To connect your AI agent, go to **Settings → MCP Integrations** and click **Install / Repair All**. This writes the MCP server config and installs the agent skill into every detected tool.

# Install Skills — Design Spec
*Date: 2026-04-10*

## Overview

Add a skill-based workflow for AI-powered code review fixes. Instead of embedding a long prompt at launch time, the app installs a spec-compliant Agent Skill into each AI ecosystem and invokes it with a short command. A guided setup wizard gates first use, ensuring MCP and skill are installed before the app is usable.

---

## Section 1 — Skill file

A single `local-code-review` skill is authored inside the app and written to disk during installation. It conforms to the [Agent Skills specification](https://agentskills.io/specification) — a directory containing `SKILL.md` with YAML frontmatter.

**Install paths (per ecosystem):**
- Claude Code / Claude Desktop → `~/.claude/skills/local-code-review/SKILL.md`
- VS Code / Cursor / Windsurf → `~/.copilot/skills/local-code-review/SKILL.md`

**Skill workflow (encoded in `SKILL.md`):**
1. Accept `repo_path`, `pr_id`, `review_id` as invocation arguments
2. Call `get_open_issues(repo_path, pr_id, review_id)` — if empty, call `complete_assignment` and stop
3. Group open comments into logical batches (same file, same concern, dependency order) and output a brief plan before writing any code
4. Per group: implement fixes → `git commit` with descriptive message → call `mark_resolved` or `mark_wont_fix` for each comment (never without a `resolution_comment`)
5. Repeat until all comments addressed, then call `complete_assignment(repo_path, pr_id)`

**Launch prompt (both ecosystems):**
```
/local-code-review repo_path="<path>" pr_id="<id>" review_id="<id>"
```
- Claude: passed as argument to the `claude` CLI, launched in Terminal
- VS Code: copied to clipboard; app shows notification "Prompt copied — paste it into the Copilot agent window to start."

---

## Section 2 — Install mechanism

**Rule: MCP and skill are installed as a pair, per ecosystem. All-or-nothing within each.**

Changes to `src/main/integrations.ts`:
- `SKILL_CONTENT` constant holds the full `SKILL.md` body (authored in the app)
- `skillPath(ecosystem)` returns the correct `SKILL.md` path for `'claude'` or `'copilot'`
- `isSkillInstalled(ecosystem)` checks whether that path exists
- `installSkill(ecosystem)` writes the skill directory + `SKILL.md` atomically
- `installIntegrations()` extended: for each detected tool, installs MCP config **and** the corresponding skill — if the tool is not detected, neither is installed
- `getIntegrations()` extended: each `IntegrationStatus` entry gains `skillInstalled: boolean`

Changes to `src/shared/types.ts`:
- `IntegrationStatus` gains `skillInstalled: boolean`

---

## Section 3 — Setup wizard (`/setup` route)

**Gate:** `App.tsx` reads `setup_complete` setting on mount. If unset, redirects to `/setup`. All other routes are unreachable until the flag is set.

**Setup screen sections:**

1. **AI Tools**
   - Lists all supported tools using the same three-state display as the PR dropdown (not installed / not configured / configured)
   - Single "Install" button — installs all detected ecosystems at once (all-or-nothing per ecosystem)
   - If no tools are detected (all show "Not installed"): "Local Review works best with AI tools installed — you can add them at any time from Settings."

2. **Scan directory**
   - Same directory picker as Settings

**"Finish Setup" button:**
- Always enabled
- If clicked with no tool having both `installed && skillInstalled`, shows inline warning but still sets `setup_complete = 'true'` and navigates to `/`
- User can repair at any time via Settings

---

## Section 4 — Settings (repair)

The existing Settings screen gains:
- A `skillInstalled` status column alongside the existing MCP install status in the integrations table
- The "Install / Repair All" button now also installs/repairs skills alongside MCP configs (same all-or-nothing logic)
- No structural changes to the page

---

## Section 5 — PR assign dropdown

All supported tools are always shown in the dropdown. Three states:

| State | Display |
|---|---|
| Software not on machine | Disabled — "Not installed" |
| Software detected, MCP+skill not configured | Disabled — "Not configured — see settings" |
| Software detected, MCP+skill configured | Selectable |

Implementation: remove the `detected`-only filter; replace with explicit three-way check using `detected`, `installed`, and `skillInstalled`.

---

## Section 6 — Launch prompt

**Before:** full inline prompt embedded in `src/main/index.ts` (~10 lines)

**After:** single skill invocation line for both ecosystems:
```
/local-code-review repo_path="<path>" pr_id="<id>" review_id="<id>"
```

- **Claude:** passed as CLI argument, opened in Terminal (unchanged launch mechanism)
- **VS Code:** copied to clipboard + in-app notification shown: "Prompt copied — paste it into the Copilot agent window to start."

---

## Files changed

| File | Change |
|---|---|
| `src/main/integrations.ts` | Add skill content, install/check helpers, extend get/install functions |
| `src/shared/types.ts` | Add `skillInstalled: boolean` to `IntegrationStatus` |
| `src/main/index.ts` | Replace inline prompt with skill invocation; add VS Code clipboard notification IPC |
| `src/preload/index.ts` | Expose new notification IPC if needed |
| `src/renderer/src/App.tsx` | Add `/setup` route + setup gate on mount |
| `src/renderer/src/screens/Setup.tsx` | New setup wizard screen |
| `src/renderer/src/screens/Setup.module.css` | Styles for setup wizard |
| `src/renderer/src/screens/Settings.tsx` | Add `skillInstalled` column, repair covers skills |
| `src/renderer/src/screens/PR.tsx` | Three-state assign dropdown |

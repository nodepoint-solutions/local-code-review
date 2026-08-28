// src/main/integrations.ts
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { app } from 'electron'
import type { IntegrationStatus } from '../shared/types'

const SKILL_CONTENT = `---
name: local-code-review
description: Resolve the open review comments on a Local Code Review pull request so the work becomes ready to merge or push. Use when assigned a fix session from Local Code Review (repo_path, pr_id, review_id), when the user asks to address review feedback on a local PR, or when a review round has left comments waiting on this branch. Not for review comments left on GitHub or GitLab.
compatibility: Requires git and the local-code-review MCP server configured in the client.
---

You are implementing fixes for a code review assignment via Local Code Review.

## Parameters

Provided when this skill is invoked:
- \`repo_path\` — absolute path to the git repository
- \`pr_id\` — the PR identifier
- \`review_id\` — the specific review to address

## Workflow

### Step 1 — Load open issues

Call \`get_open_issues(repo_path, pr_id, review_id)\`.

If the list is empty, call \`complete_assignment(repo_path, pr_id)\` and stop.

### Step 2 — Plan your groups

Before touching any code, organise the open comments into logical groups. Each group becomes one commit.

Grouping rules:
- Same file or closely related files (e.g. component + its test) → one group
- Same concern across files (e.g. all error-handling fixes, all type-safety issues) → one group
- Foundation first: types, interfaces, and shared utilities before feature code; feature code before tests
- Atomic units: a group should be explainable in a single commit message; split if in doubt

Output a short plan — list each group, the comment IDs it contains, and the proposed commit message — before writing any code.

### Step 3 — Fix, commit, and resolve (repeat per group)

For each group in order:

1. Read and implement
   - Read the relevant files and surrounding context
   - Make the fix, keeping changes minimal and consistent with work already done in this session
   - If a comment is already addressed by a previous group's changes, note it — do not re-fix

2. Commit
   \`\`\`bash
   git add <files changed in this group>
   git commit -m "<commit message>"
   \`\`\`
   Use a clear, lowercase imperative message (e.g. "fix: remove unused import in UserService").

3. Mark every comment in the group
   - For each resolved comment: call \`mark_resolved(repo_path, pr_id, comment_id, resolution_comment)\`
   - For each skipped comment: call \`mark_wont_fix(repo_path, pr_id, comment_id, resolution_comment)\`
   - \`resolution_comment\` must name the file and describe what changed (or why it was skipped)
   - Never call mark_resolved or mark_wont_fix without a resolution_comment

### Step 4 — Complete the assignment

Once every open comment is marked, call \`complete_assignment(repo_path, pr_id)\`.

This signals to the reviewer that your fix session has ended.

## Rules

- Always commit before marking issues — the commit proves the fix exists in history
- Never batch all fixes into one commit; each logical group gets its own commit
- If you are unsure how to fix a comment, implement the most conservative interpretation and note the uncertainty in resolution_comment
- Do not reopen closed comments or modify comments from previous reviews
`

const CREATE_PR_SKILL_CONTENT = `---
name: local-code-review-create-pr
description: Open a pull request in Local Code Review so the developer can review a finished unit of work before it is pushed to a remote host such as GitHub or GitLab. Use when a feature, fix, or other work unit on a branch is complete, when the user asks to open or create a PR, or before completed work would be pushed or merged. Not for opening PRs on a remote host — GitHub and GitLab PRs are out of scope.
compatibility: Requires git and the local-code-review MCP server configured in the client.
---

You are opening a pull request in Local Code Review.

## Workflow

1. Identify the branches
   - Compare branch: the current branch unless one is named
   - Base branch: the repo's default branch (main, master, …) unless one is named

2. Check the base branch is in sync with origin
   A PR diffed against a stale base does not match what a remote host
   (GitHub, GitLab) would show for the same branches.
   \`\`\`bash
   git fetch origin
   git rev-list --left-right --count <base>...origin/<base>
   \`\`\`
   The counts are commits only on <base> (ahead) and only on origin/<base>
   (behind). Then:
   - No origin remote, or origin has no <base>: skip this check
   - 0 0 — in sync: continue
   - Behind only: fast-forward <base> (\`git pull --ff-only\` when it is
     checked out, \`git fetch origin <base>:<base>\` otherwise). With a
     developer present, ask first; in an autonomous session, fast-forward
     and record it in your report. Continue once it succeeds
   - Ahead or diverged: stop and ask the developer to reconcile <base> with
     origin/<base> first

3. Understand the change
   \`\`\`bash
   git log --oneline <base>..<compare>
   git diff --stat <base>...<compare>
   \`\`\`

4. Derive title and description
   - Title: one imperative sentence summarising the change, in Simple
     Technical English
   - If the work belongs to a ticket, prefix the title with its identifier:
     "<ticket>: <rest of title>". The ticket may be known from the current
     session, or encoded in the compare branch name — e.g. "feature/123-my-branch"
     or "PROJ-123-my-branch" gives ticket 123 or PROJ-123. Use the identifier
     exactly as found; never invent one when no ticket is evident.
   - Description: follow "Description format" below
   - Every statement in the title and description must trace to the commits,
     the diff, the ticket, or this session — never invented
   - In an autonomous session, have a second agent review the drafted title
     and description against "Description format" before creating the PR

5. Create the PR
   Call \`create_pr(repo_path, title, description, base_branch, compare_branch)\`.
   You become the PR's assignee: after each review is submitted you will be
   asked to fix the comments.

6. Report the created PR id and title.

## Description format

The repo's own convention wins: if the repo has a PR template
(e.g. .github/PULL_REQUEST_TEMPLATE.md) or an established style in past PRs,
follow that. Otherwise:

Structure
- Open with a 1–2 line summary of what the change is and why it exists. No heading.
- Then at most three sections, in this order, each only when it has content:
  - \`# Architecture\` — prose on how the new parts fit together. Only for
    non-trivial structure.
  - \`# Key changes\` — bullet list of the concrete changes a reviewer should
    focus on, with the reasoning a diff cannot show.
  - \`# Out of scope\` — related work that is contained within the wider ticket
    or planned work within this coding session, but deliberately left out of this PR.
    Don't invent out of scope work, only do this if it was in the ticket originally
    or discussed with the developer and intentionally deferred.
- Those are the only headings. Use them exactly, in that order, and add none
  of your own — no Testing, Verification, Deployment, Risks, Notes or Summary
  sections. Anything worth saying belongs inside one of them, or is left out.

Content
- Describe the diff between the compare branch HEAD and the base branch HEAD.
  Intra-branch churn — fixup commits, reverted experiments — is irrelevant.
- The diff already shows what changed line by line; the description earns its
  place by giving intent: why this change, why this shape.
- Say what the change is; never define it by negation.
- Explain non-obvious decisions and how their risks are mitigated.
- Skip what the repo already establishes: a convention the codebase follows
  everywhere needs no description.

Language
- Simple Technical English: short sentences, active voice, one idea per
  sentence, concrete nouns.
- No self-congratulation, LLM filler, overly mechanical terms, etc.

## Rules

- Local branches only — never push, and never write to a remote. The
  read-only fetch in step 2 is the only remote operation
- If create_pr reports the repository is not set up, tell the user to add it in the Local Code Review app and stop
`

const SKILLS: { dirName: string; content: string }[] = [
  { dirName: 'local-code-review', content: SKILL_CONTENT },
  { dirName: 'local-code-review-create-pr', content: CREATE_PR_SKILL_CONTENT },
]

const home = os.homedir()
const appdata = process.env['APPDATA'] ?? home
const platform = process.platform

function xdgConfig(): string {
  return process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config')
}

interface ToolConfig {
  id: IntegrationStatus['id']
  name: string
  configPath: string
  keyPath: string[]
}

function resolveConfigs(): ToolConfig[] {
  return [
    {
      id: 'claudeCode',
      name: 'Claude Code',
      configPath: path.join(home, '.claude.json'),
      keyPath: ['mcpServers'],
    },
    {
      id: 'claudeDesktop',
      name: 'Claude Desktop',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Claude', 'claude_desktop_config.json')
          : platform === 'darwin'
            ? path.join(
                home,
                'Library',
                'Application Support',
                'Claude',
                'claude_desktop_config.json'
              )
            : path.join(xdgConfig(), 'Claude', 'claude_desktop_config.json'),
      keyPath: ['mcpServers'],
    },
    {
      id: 'vscode',
      name: 'VS Code',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Code', 'User', 'mcp.json')
          : platform === 'darwin'
            ? path.join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json')
            : path.join(xdgConfig(), 'Code', 'User', 'mcp.json'),
      keyPath: ['servers'],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Cursor', 'User', 'settings.json')
          : platform === 'darwin'
            ? path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json')
            : path.join(xdgConfig(), 'Cursor', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Windsurf', 'User', 'settings.json')
          : platform === 'darwin'
            ? path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'settings.json')
            : path.join(xdgConfig(), 'Windsurf', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
    },
  ]
}

function mcpBinaryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-server', 'index.js')
  }
  return path.join(app.getAppPath(), 'dist', 'mcp-server', 'index.js')
}

function resolveNodePath(): string {
  try {
    return execSync('which node', { encoding: 'utf8' }).trim()
  } catch {
    return 'node'
  }
}

const TOOL_IDENTITY: Record<IntegrationStatus['id'], string> = {
  claudeCode: 'Claude Code',
  claudeDesktop: 'Claude Desktop',
  vscode: 'Copilot',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
}

function buildEntry(id: IntegrationStatus['id']) {
  const command = resolveNodePath()
  const args = [mcpBinaryPath()]
  const env = { LOCAL_REVIEW_IDENTITY: TOOL_IDENTITY[id] }
  return { type: 'stdio', command, args, env }
}

function toolEcosystem(id: IntegrationStatus['id']): 'claude' | 'copilot' {
  // claudeCode and claudeDesktop → claude ecosystem; all VS Code-family tools → copilot
  return id === 'claudeCode' || id === 'claudeDesktop' ? 'claude' : 'copilot'
}

function skillDir(ecosystem: 'claude' | 'copilot', dirName: string): string {
  const base =
    ecosystem === 'claude'
      ? path.join(home, '.claude', 'skills')
      : path.join(home, '.copilot', 'skills') // per Agent Skills spec (agentskills.io)
  return path.join(base, dirName)
}

function isSkillInstalled(ecosystem: 'claude' | 'copilot'): boolean {
  return SKILLS.every((skill) =>
    fs.existsSync(path.join(skillDir(ecosystem, skill.dirName), 'SKILL.md'))
  )
}

function installSkill(ecosystem: 'claude' | 'copilot'): void {
  for (const skill of SKILLS) {
    const dir = skillDir(ecosystem, skill.dirName)
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, 'SKILL.md')
    const tmp = dest + '.tmp'
    fs.writeFileSync(tmp, skill.content, 'utf8')
    fs.renameSync(tmp, dest)
  }
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function deepGet(obj: Record<string, unknown>, keyPath: string[]): Record<string, unknown> {
  let cur: unknown = obj
  for (const key of keyPath) {
    if (typeof cur !== 'object' || cur === null) return {}
    cur = (cur as Record<string, unknown>)[key]
  }
  return (typeof cur === 'object' && cur !== null ? cur : {}) as Record<string, unknown>
}

function deepSet(obj: Record<string, unknown>, keyPath: string[], value: unknown): void {
  let cur = obj
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i]
    if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {}
    cur = cur[key] as Record<string, unknown>
  }
  cur[keyPath[keyPath.length - 1]] = value
}

function isInstalled(config: ToolConfig): boolean {
  const obj = readJson(config.configPath)
  const servers = deepGet(obj, config.keyPath)
  return 'local-code-review' in servers
}

export function getIntegrations(): IntegrationStatus[] {
  return resolveConfigs().map((config) => ({
    id: config.id,
    name: config.name,
    detected: fs.existsSync(path.dirname(config.configPath)),
    installed: fs.existsSync(config.configPath) && isInstalled(config),
    skillInstalled: isSkillInstalled(toolEcosystem(config.id)),
  }))
}

export function installIntegrations(): void {
  const ecosystemsInstalled = new Set<'claude' | 'copilot'>()

  for (const config of resolveConfigs()) {
    const dir = path.dirname(config.configPath)
    if (!fs.existsSync(dir)) continue

    const obj = readJson(config.configPath)
    const servers = deepGet(obj, config.keyPath)
    servers['local-code-review'] = buildEntry(config.id)
    deepSet(obj, config.keyPath, servers)

    fs.mkdirSync(dir, { recursive: true })
    const tmp = config.configPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    fs.renameSync(tmp, config.configPath)

    ecosystemsInstalled.add(toolEcosystem(config.id))
  }

  for (const ecosystem of ecosystemsInstalled) {
    installSkill(ecosystem)
  }
}

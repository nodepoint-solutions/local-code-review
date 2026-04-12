// src/main/integrations.ts
import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import type { IntegrationStatus } from '../shared/types'

const SKILL_CONTENT = `---
name: local-code-review
description: Fix all open review comments for a Local Code Review PR assignment. Groups related comments, implements fixes with commits between groups, and marks issues resolved via the local-code-review MCP tools. Use when assigned to fix code review issues in Local Code Review.
compatibility: Requires git and the local-code-review MCP server to be running.
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

This unassigns you from the PR and signals to the reviewer that the work is done.

## Rules

- Always commit before marking issues — the commit proves the fix exists in history
- Never batch all fixes into one commit; each logical group gets its own commit
- If you are unsure how to fix a comment, implement the most conservative interpretation and note the uncertainty in resolution_comment
- Do not reopen closed comments or modify comments from previous reviews
`

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
  entryShape: 'claude' | 'vscode'
}

function resolveConfigs(): ToolConfig[] {
  return [
    {
      id: 'claudeCode',
      name: 'Claude Code',
      configPath: path.join(home, '.claude.json'),
      keyPath: ['mcpServers'],
      entryShape: 'claude',
    },
    {
      id: 'claudeDesktop',
      name: 'Claude Desktop',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Claude', 'claude_desktop_config.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
          : path.join(xdgConfig(), 'Claude', 'claude_desktop_config.json'),
      keyPath: ['mcpServers'],
      entryShape: 'claude',
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
      entryShape: 'vscode',
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
      entryShape: 'vscode',
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
      entryShape: 'vscode',
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
  const { execSync } = require('child_process') as typeof import('child_process')
  try {
    return execSync('which node', { encoding: 'utf8' }).trim()
  } catch {
    return 'node'
  }
}

function buildEntry(shape: 'claude' | 'vscode') {
  const command = resolveNodePath()
  const args = [mcpBinaryPath()]
  if (shape === 'claude') {
    return { type: 'stdio', command, args, env: {} }
  }
  return { type: 'stdio', command, args }
}

function toolEcosystem(id: IntegrationStatus['id']): 'claude' | 'copilot' {
  // claudeCode and claudeDesktop → claude ecosystem; all VS Code-family tools → copilot
  return id === 'claudeCode' || id === 'claudeDesktop' ? 'claude' : 'copilot'
}

function skillDir(ecosystem: 'claude' | 'copilot'): string {
  const base = ecosystem === 'claude'
    ? path.join(home, '.claude', 'skills')
    : path.join(home, '.copilot', 'skills') // per Agent Skills spec (agentskills.io)
  return path.join(base, 'local-code-review')
}

function isSkillInstalled(ecosystem: 'claude' | 'copilot'): boolean {
  return fs.existsSync(path.join(skillDir(ecosystem), 'SKILL.md'))
}

function installSkill(ecosystem: 'claude' | 'copilot'): void {
  const dir = skillDir(ecosystem)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, 'SKILL.md')
  const tmp = dest + '.tmp'
  fs.writeFileSync(tmp, SKILL_CONTENT, 'utf8')
  fs.renameSync(tmp, dest)
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
    servers['local-code-review'] = buildEntry(config.entryShape)
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

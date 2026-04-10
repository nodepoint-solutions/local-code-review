# Install Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install spec-compliant AI skills alongside the MCP server for each detected ecosystem, gate first use behind a setup wizard, and replace the inline launch prompt with a short skill invocation.

**Architecture:** Skills conform to the [Agent Skills spec](https://agentskills.io/specification) (a `SKILL.md` file inside a named directory). `integrations.ts` installs MCP + skill as an all-or-nothing pair per ecosystem on each `installIntegrations()` call. A new `/setup` route blocks all other routes until `setup_complete` is written to the settings DB. The PR assign dropdown shows all tools with a three-state status label. The launch prompt shrinks to one line invoking the skill by name.

**Tech Stack:** Electron + React + TypeScript + CSS Modules + React Router (HashRouter) + Zustand (existing) + Electron IPC (existing)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/shared/types.ts` | Modify | Add `skillInstalled: boolean` to `IntegrationStatus` |
| `src/main/integrations.ts` | Modify | SKILL.md constant; skill path/check/install helpers; extend get/install |
| `src/main/index.ts` | Modify | Replace inline prompt with skill invocation; return notification for VS Code |
| `src/preload/index.ts` | Modify | Widen `launchFix` return type to include `notification?: string` |
| `src/renderer/src/App.tsx` | Modify | Setup gate — async check on mount, `/setup` route, redirect if not complete |
| `src/renderer/src/screens/Setup.tsx` | Create | Setup wizard: tool status list, install button, scan dir, finish |
| `src/renderer/src/screens/Setup.module.css` | Create | Styles for setup wizard |
| `src/renderer/src/screens/Settings.tsx` | Modify | Add `skillInstalled` status column to integrations table |
| `src/renderer/src/screens/PR.tsx` | Modify | Three-state assign dropdown; toast notification for VS Code clipboard |
| `src/renderer/src/screens/PR.module.css` | Modify | Styles for disabled dropdown items, status labels, notification toast |

---

## Task 1: Add `skillInstalled` to `IntegrationStatus`

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Update the type**

In `src/shared/types.ts`, find the `IntegrationStatus` interface (line 94) and add the new field:

```typescript
export interface IntegrationStatus {
  id: 'claudeCode' | 'claudeDesktop' | 'vscode' | 'cursor' | 'windsurf'
  name: string
  detected: boolean
  installed: boolean
  skillInstalled: boolean
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nodepoint/Development/nodepoint/local-code-review
npm run typecheck 2>&1 | head -40
```

Expected: errors about `getIntegrations()` not returning `skillInstalled` — that's fine, they'll be fixed in Task 2. No other errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add skillInstalled to IntegrationStatus"
```

---

## Task 2: Skill content constant and helpers in `integrations.ts`

**Files:**
- Modify: `src/main/integrations.ts`

- [ ] **Step 1: Add the SKILL.md content constant**

Add after the existing imports at the top of `src/main/integrations.ts` (after line 7, before `const home = ...`):

```typescript
const SKILL_CONTENT = `---
name: local-code-review
description: Fix all open review comments for a Local Review PR assignment. Groups related comments, implements fixes with commits between groups, and marks issues resolved via the local-code-review MCP tools. Use when assigned to fix code review issues in Local Review.
compatibility: Requires git and the local-code-review MCP server to be running.
---

You are implementing fixes for a code review assignment via Local Review.

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
```

- [ ] **Step 2: Add ecosystem helper and skill path/check/install functions**

Add these functions after the `buildEntry` function (after line ~107) in `src/main/integrations.ts`:

```typescript
function toolEcosystem(id: IntegrationStatus['id']): 'claude' | 'copilot' {
  return id === 'claudeCode' || id === 'claudeDesktop' ? 'claude' : 'copilot'
}

function skillDir(ecosystem: 'claude' | 'copilot'): string {
  const base = ecosystem === 'claude'
    ? path.join(home, '.claude', 'skills')
    : path.join(home, '.copilot', 'skills')
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
```

- [ ] **Step 3: Update `getIntegrations` to include `skillInstalled`**

Replace the existing `getIntegrations` function in `src/main/integrations.ts`:

```typescript
export function getIntegrations(): IntegrationStatus[] {
  return resolveConfigs().map((config) => ({
    id: config.id,
    name: config.name,
    detected: fs.existsSync(path.dirname(config.configPath)),
    installed: fs.existsSync(config.configPath) && isInstalled(config),
    skillInstalled: isSkillInstalled(toolEcosystem(config.id)),
  }))
}
```

- [ ] **Step 4: Update `installIntegrations` to install skills alongside MCP**

Replace the existing `installIntegrations` function in `src/main/integrations.ts`:

```typescript
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
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 6: Manually verify skill install**

In the app, go to Settings → click "Install / Repair All". Then check:

```bash
ls ~/.claude/skills/local-code-review/
# Expected: SKILL.md

cat ~/.claude/skills/local-code-review/SKILL.md | head -5
# Expected: frontmatter with name: local-code-review
```

- [ ] **Step 7: Commit**

```bash
git add src/main/integrations.ts
git commit -m "feat: install SKILL.md alongside MCP config per ecosystem"
```

---

## Task 3: Update launch prompt in `index.ts`

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Replace the inline prompt with skill invocation**

In `src/main/index.ts`, replace the entire `fix:launch` handler body (lines 179–210) with:

```typescript
ipcMain.handle('fix:launch', (_e, tool: string, repoPath: string, prId: string, reviewId: string) => {
  const prompt = `/local-code-review repo_path="${repoPath}" pr_id="${prId}" review_id="${reviewId}"`

  if (tool === 'claude') {
    const safeRepo = repoPath.replace(/'/g, "'\\''")
    const safePrompt = prompt.replace(/'/g, "'\\''")
    const shellCmd = `cd '${safeRepo}' && claude '${safePrompt}'`
    const appleScript = `tell application "Terminal" to do script "${shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    const { spawn } = require('child_process') as typeof import('child_process')
    spawn('osascript', ['-e', appleScript], { detached: true, stdio: 'ignore' }).unref()
    return {}
  }

  if (tool === 'vscode') {
    const { clipboard } = require('electron') as typeof import('electron')
    clipboard.writeText(prompt)
    const { spawn } = require('child_process') as typeof import('child_process')
    spawn('open', ['-a', 'Visual Studio Code', repoPath], { detached: true, stdio: 'ignore' }).unref()
    return { notification: 'Prompt copied — paste it into the Copilot agent window to start.' }
  }

  return { error: `Unknown tool: ${tool}` }
})
```

- [ ] **Step 2: Widen the `launchFix` return type in the preload**

In `src/preload/index.ts`, find the `launchFix` line (~line 86) and update it:

```typescript
launchFix: (tool: 'claude' | 'vscode', repoPath: string, prId: string, reviewId: string): Promise<{ error?: string; notification?: string }> =>
  ipcRenderer.invoke('fix:launch', tool, repoPath, prId, reviewId),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: replace inline launch prompt with skill invocation"
```

---

## Task 4: Setup gate in `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Rewrite `App.tsx` with setup gate**

Replace the entire contents of `src/renderer/src/App.tsx` with:

```typescript
import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store'
import Home from './screens/Home'
import Repo from './screens/Repo'
import OpenPR from './screens/OpenPR'
import PR from './screens/PR'
import Settings from './screens/Settings'
import Setup from './screens/Setup'
import './App.css'

function ThemeApplier(): null {
  const { theme } = useStore()
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return null
}

export default function App(): JSX.Element {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.getSetting('setup_complete').then((val) => setSetupComplete(val === 'true'))
  }, [])

  if (setupComplete === null) return <></>

  return (
    <HashRouter>
      <ThemeApplier />
      <Routes>
        <Route path="/setup" element={<Setup onComplete={() => setSetupComplete(true)} />} />
        {!setupComplete ? (
          <Route path="*" element={<Navigate to="/setup" replace />} />
        ) : (
          <>
            <Route path="/" element={<Home />} />
            <Route path="/repo/:repoId" element={<Repo />} />
            <Route path="/repo/:repoId/open-pr" element={<OpenPR />} />
            <Route path="/repo/:repoId/pr/:prId" element={<PR />} />
            <Route path="/settings" element={<Settings />} />
          </>
        )}
      </Routes>
    </HashRouter>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: error about `Setup` not existing yet — that's fine, Task 5 adds it. No other errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: gate app behind setup_complete check, add /setup route"
```

---

## Task 5: Setup screen

**Files:**
- Create: `src/renderer/src/screens/Setup.tsx`
- Create: `src/renderer/src/screens/Setup.module.css`

- [ ] **Step 1: Create `Setup.module.css`**

Create `src/renderer/src/screens/Setup.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 48px 32px 32px;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

.subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.5;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sectionTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.toolTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.toolTable td {
  padding: 6px 0;
}

.toolName {
  color: var(--text);
  width: 160px;
}

.toolStatus {
  color: var(--text-muted);
  font-size: 12px;
}

.toolStatusOk {
  color: var(--green);
}

.warning {
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 14px;
  line-height: 1.5;
}

.finishWarning {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 6px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.scanRow {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scanPath {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--text);
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scanNone {
  font-style: italic;
  color: var(--text-subtle);
}
```

- [ ] **Step 2: Create `Setup.tsx`**

Create `src/renderer/src/screens/Setup.tsx`:

```typescript
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IntegrationStatus } from '../../../shared/types'
import styles from './Setup.module.css'

interface SetupProps {
  onComplete: () => void
}

function toolStatusLabel(i: IntegrationStatus): { text: string; ok: boolean } {
  if (i.installed && i.skillInstalled) return { text: '✓ Configured', ok: true }
  if (i.installed && !i.skillInstalled) return { text: 'MCP installed, skill missing', ok: false }
  if (i.detected) return { text: 'Not installed', ok: false }
  return { text: 'Not installed', ok: false }
}

export default function Setup({ onComplete }: SetupProps): JSX.Element {
  const navigate = useNavigate()
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [installing, setInstalling] = useState(false)
  const [scanDir, setScanDir] = useState<string | null>(null)
  const [showFinishWarning, setShowFinishWarning] = useState(false)

  useEffect(() => {
    window.api.getIntegrations().then(setIntegrations)
    window.api.getSetting('scan_base_dir').then(setScanDir)
  }, [])

  const anyDetected = integrations.some((i) => i.detected)
  const anyConfigured = integrations.some((i) => i.installed && i.skillInstalled)

  async function handleInstall(): Promise<void> {
    setInstalling(true)
    await window.api.installIntegrations()
    const updated = await window.api.getIntegrations()
    setIntegrations(updated)
    setInstalling(false)
  }

  async function handleChangeScanDir(): Promise<void> {
    const result = await window.api.openScanDirPicker()
    if (!result) return
    await window.api.setSetting('scan_base_dir', result)
    setScanDir(result)
  }

  async function handleFinish(): Promise<void> {
    await window.api.setSetting('setup_complete', 'true')
    onComplete()
    if (!anyConfigured) {
      setShowFinishWarning(true)
      setTimeout(() => navigate('/'), 1500)
    } else {
      navigate('/')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Welcome to Local Review</h1>
          <p className={styles.subtitle}>
            Set up your AI tools to get the most out of Local Review.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>AI Tools</h2>
          {!anyDetected && (
            <div className={styles.warning}>
              Local Review works best with AI tools installed — you can add them at any time from Settings.
            </div>
          )}
          <table className={styles.toolTable}>
            <tbody>
              {integrations.map((i) => {
                const { text, ok } = toolStatusLabel(i)
                return (
                  <tr key={i.id}>
                    <td className={styles.toolName}>{i.name}</td>
                    <td className={ok ? styles.toolStatusOk : styles.toolStatus}>{text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className={styles.actions}>
            <button onClick={handleInstall} disabled={installing || !anyDetected}>
              {installing ? 'Installing…' : 'Install'}
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Scan directory</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Local Review scans this directory to auto-discover git repositories.
          </p>
          <div className={styles.scanRow}>
            <span className={styles.scanPath}>
              {scanDir ?? <em className={styles.scanNone}>Not configured</em>}
            </span>
            <button onClick={handleChangeScanDir}>
              {scanDir ? 'Change' : 'Set directory'}
            </button>
          </div>
        </div>

        <div>
          <div className={styles.actions}>
            <button onClick={handleFinish}>Finish Setup</button>
          </div>
          {showFinishWarning && (
            <p className={styles.finishWarning}>
              No AI tools configured yet — you can install them later from Settings.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Manual test — first launch gate**

1. Open the app. It should redirect to `/setup` (assuming `setup_complete` is not set in your DB).
2. Verify the tools table shows all integrations with correct status.
3. Click "Install" — verify status updates to "✓ Configured" for detected tools.
4. Click "Finish Setup" — verify you land on `/`.
5. Reload the app — verify it no longer redirects to `/setup`.

To re-test the gate: In Settings → Danger Zone → Reset to factory settings. This clears `setup_complete`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/screens/Setup.tsx src/renderer/src/screens/Setup.module.css
git commit -m "feat: add setup wizard screen with AI tools install and scan dir"
```

---

## Task 6: Settings — skill status column

**Files:**
- Modify: `src/renderer/src/screens/Settings.tsx`

- [ ] **Step 1: Update the integrations table to show `skillInstalled`**

In `src/renderer/src/screens/Settings.tsx`, replace the integrations table rows (lines 110–122):

```tsx
{integrations.map((tool) => (
  <tr key={tool.id} style={{ opacity: tool.detected ? 1 : 0.4 }}>
    <td style={{ padding: '6px 0', width: 160 }}>{tool.name}</td>
    <td style={{ fontSize: 12, color: 'var(--text-muted)', width: 140 }}>
      {!tool.detected
        ? '(not detected)'
        : tool.installed
        ? '✓ MCP installed'
        : 'MCP not installed'}
    </td>
    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
      {!tool.detected
        ? ''
        : tool.skillInstalled
        ? '✓ Skill installed'
        : 'Skill not installed'}
    </td>
  </tr>
))}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Manual test**

Open Settings → MCP Integrations. Verify each row shows both MCP and Skill status. Click "Install / Repair All" and verify both columns update.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/Settings.tsx
git commit -m "feat: show skill install status alongside MCP status in settings"
```

---

## Task 7: PR assign dropdown — three-state display + VS Code notification

**Files:**
- Modify: `src/renderer/src/screens/PR.tsx`
- Modify: `src/renderer/src/screens/PR.module.css`

- [ ] **Step 1: Add CSS for disabled dropdown items and notification toast**

Append to `src/renderer/src/screens/PR.module.css`:

```css
.assigneeDropdownItem:disabled {
  cursor: default;
  opacity: 1;
}

.assigneeDropdownItem:disabled:hover {
  background: none;
}

.assigneeItemRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.assigneeStatusLabel {
  font-size: 11px;
  color: var(--text-muted);
}

.notification {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text);
  z-index: 1000;
  white-space: nowrap;
}
```

- [ ] **Step 2: Add helper function, options constant, and notification state to `PR.tsx`**

First, add `IntegrationStatus` to the existing type import at line 14 of `src/renderer/src/screens/PR.tsx`:

```typescript
import type { AddCommentPayload, ReviewComment, Commit, ParsedFile, PrDetail, IntegrationStatus } from '../../../shared/types'
```

Then add the following just before the component definition (before `export default function PR()`):

```typescript
function getAssigneeStatus(
  integrations: IntegrationStatus[],
  ids: IntegrationStatus['id'][]
): 'configured' | 'not-configured' | 'not-installed' {
  const tools = integrations.filter((i) => ids.includes(i.id))
  if (tools.some((i) => i.detected && i.installed && i.skillInstalled)) return 'configured'
  if (tools.some((i) => i.detected && i.installed)) return 'not-configured'
  return 'not-installed'
}

const ASSIGNEE_OPTIONS: { key: 'claude' | 'vscode'; label: string; ids: IntegrationStatus['id'][] }[] = [
  { key: 'claude', label: 'Claude Code', ids: ['claudeCode', 'claudeDesktop'] },
  { key: 'vscode', label: 'Copilot (VS Code)', ids: ['vscode', 'cursor', 'windsurf'] },
]
```

Add `notification` state alongside the other state declarations in the PR component (near line 74):

```typescript
const [notification, setNotification] = useState<string | null>(null)
```

- [ ] **Step 3: Update `handleAssign` to handle the notification return**

Replace `handleAssign` (lines 156–165 in `src/renderer/src/screens/PR.tsx`):

```typescript
async function handleAssign(tool: 'claude' | 'vscode'): Promise<void> {
  if (!repo || !prId) return
  setAssigneeDropdownOpen(false)
  await window.api.assignPr(repo.path, prId, tool)
  const updated = await window.api.getPr(repo.path, prId)
  if (updated && !('error' in updated)) setPrDetail(updated as any)
  if (prDetail?.review) {
    const result = await window.api.launchFix(tool, repo.path, prId, prDetail.review.id)
    if (result?.notification) {
      setNotification(result.notification)
      setTimeout(() => setNotification(null), 5000)
    }
  }
}
```

- [ ] **Step 4: Update `handleNudge` to handle the notification return**

Replace `handleNudge` (lines 167–170 in `src/renderer/src/screens/PR.tsx`):

```typescript
async function handleNudge(): Promise<void> {
  if (!repo || !prId || !prDetail?.pr.assignee || !prDetail?.review) return
  const result = await window.api.launchFix(
    prDetail.pr.assignee as 'claude' | 'vscode',
    repo.path,
    prId,
    prDetail.review.id
  )
  if (result?.notification) {
    setNotification(result.notification)
    setTimeout(() => setNotification(null), 5000)
  }
}
```

- [ ] **Step 5: Replace the assign dropdown JSX with three-state version**

In `src/renderer/src/screens/PR.tsx`, replace the dropdown menu (lines 472–491):

```tsx
{assigneeDropdownOpen && (
  <div className={styles.assigneeDropdownMenu}>
    {ASSIGNEE_OPTIONS.map(({ key, label, ids }) => {
      const status = getAssigneeStatus(integrations, ids)
      return (
        <button
          key={key}
          className={styles.assigneeDropdownItem}
          disabled={status !== 'configured'}
          onClick={status === 'configured' ? () => handleAssign(key) : undefined}
        >
          <span className={styles.assigneeItemRow}>
            <span>{label}</span>
            {status === 'not-installed' && (
              <span className={styles.assigneeStatusLabel}>Not installed</span>
            )}
            {status === 'not-configured' && (
              <span className={styles.assigneeStatusLabel}>Not configured — see settings</span>
            )}
          </span>
        </button>
      )
    })}
  </div>
)}
```

- [ ] **Step 6: Add notification toast to the PR page JSX**

In `src/renderer/src/screens/PR.tsx`, add the notification toast just before the closing `</div>` of the outermost `.page` div:

```tsx
{notification && (
  <div className={styles.notification}>{notification}</div>
)}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 8: Manual test — dropdown states**

1. Open a PR with a submitted review.
2. Open the assignee dropdown — verify both "Claude Code" and "Copilot (VS Code)" always appear.
3. For a tool with MCP+skill installed: verify it is clickable with no label.
4. For a tool with MCP installed but skill missing: verify it is disabled with "Not configured — see settings".
5. For a tool not detected: verify it is disabled with "Not installed".
6. Assign to VS Code — verify a toast appears at the bottom saying "Prompt copied — paste it into the Copilot agent window to start."

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/screens/PR.tsx src/renderer/src/screens/PR.module.css
git commit -m "feat: three-state assign dropdown and VS Code clipboard notification"
```

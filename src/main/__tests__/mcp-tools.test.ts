// src/main/__tests__/mcp-tools.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { callTool, buildTools } from '../../mcp-server/tools'
import { drainPendingRepos } from '../../shared/agent-bridge'
import { ReviewStore } from '../../shared/review-store'
import type { SocketClient } from '../../mcp-server/socket-client'

// create_pr records every repository it touches for the app to pick up, so
// every test in this file needs its own state directory to write into.
let stateDir: string
const originalStateDir = process.env['LOCAL_REVIEW_STATE_DIR']

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tools-state-'))
  process.env['LOCAL_REVIEW_STATE_DIR'] = stateDir
})

afterEach(() => {
  if (originalStateDir === undefined) delete process.env['LOCAL_REVIEW_STATE_DIR']
  else process.env['LOCAL_REVIEW_STATE_DIR'] = originalStateDir
  fs.rmSync(stateDir, { recursive: true, force: true })
})

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tools-test-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir })
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'],
    { cwd: dir }
  )
  execFileSync('git', ['branch', 'feature/x'], { cwd: dir })
  execFileSync('git', ['branch', 'feature/y'], { cwd: dir })
  execFileSync('git', ['branch', 'develop'], { cwd: dir })
  return dir
}

function resultJson(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text)
}

async function createPr(
  repoPath: string,
  socket: SocketClient,
  compareBranch = 'feature/x'
): Promise<string> {
  const result = await callTool(
    'create_pr',
    { repo_path: repoPath, title: 'T', base_branch: 'main', compare_branch: compareBranch },
    socket,
    'Claude Code'
  )
  if (result.isError) throw new Error(result.content[0].text)
  return resultJson(result).pr_id as string
}

function listJson(result: { content: { text: string }[] }): Array<Record<string, unknown>> {
  return JSON.parse(result.content[0].text)
}

describe('create_pr', () => {
  let repoPath: string
  let socket: SocketClient

  beforeEach(() => {
    repoPath = makeGitRepo()
    socket = { emit: vi.fn() } as unknown as SocketClient
  })

  afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }))

  it('is advertised with its input schema', () => {
    const tool = buildTools().find((t) => t.name === 'create_pr')
    expect(tool).toBeDefined()
    expect(tool!.inputSchema.required).toEqual([
      'repo_path',
      'title',
      'base_branch',
      'compare_branch',
    ])
  })

  it('registers a repository the app does not manage yet, instead of refusing', async () => {
    const result = await callTool(
      'create_pr',
      {
        repo_path: repoPath,
        title: 'T',
        base_branch: 'main',
        compare_branch: 'feature/x',
      },
      socket,
      'Claude Code'
    )

    expect(result.isError).toBeUndefined()
    expect(fs.existsSync(path.join(repoPath, '.reviews'))).toBe(true)
    // Live channel for a running app…
    expect(socket.emit).toHaveBeenCalledWith({ event: 'repo:registered', repoPath })
    // …and a durable one for an app that was closed
    expect(drainPendingRepos()).toEqual([repoPath])
  })

  it('refuses a path that is not a git repository', async () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'))

    const result = await callTool(
      'create_pr',
      { repo_path: notARepo, title: 'T', base_branch: 'main', compare_branch: 'feature/x' },
      socket,
      'Claude Code'
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Not a git repository')
    expect(fs.existsSync(path.join(notARepo, '.reviews'))).toBe(false)

    fs.rmSync(notARepo, { recursive: true, force: true })
  })

  it('refuses an unknown branch without registering the repository', async () => {
    const result = await callTool(
      'create_pr',
      {
        repo_path: repoPath,
        title: 'T',
        base_branch: 'main',
        compare_branch: 'no-such-branch',
      },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Branch not found: no-such-branch')
    expect(drainPendingRepos()).toEqual([])
  })

  it('creates the PR owned by the calling agent and notifies the app', async () => {
    fs.mkdirSync(path.join(repoPath, '.reviews'))
    const result = await callTool(
      'create_pr',
      {
        repo_path: repoPath,
        title: 'Add auth',
        description: 'Adds the auth middleware',
        base_branch: 'main',
        compare_branch: 'feature/x',
      },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBeUndefined()
    const data = resultJson(result)
    expect(data.assignee).toBe('claude')
    expect(socket.emit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pr:updated', repoPath, prId: data.pr_id })
    )

    const listed = await callTool(
      'get_pr',
      { repo_path: repoPath, pr_id: data.pr_id as string },
      socket,
      'Claude Code'
    )
    const pr = (resultJson(listed) as { pr: { assignee: string; assigned_at: string } }).pr
    expect(pr.assignee).toBe('claude')
    expect(pr.assigned_at).not.toBeNull()
  })

  it('refuses a second open PR for the same compare branch and names the existing one', async () => {
    const existing = await createPr(repoPath, socket, 'feature/x')
    vi.mocked(socket.emit).mockClear()

    const result = await callTool(
      'create_pr',
      { repo_path: repoPath, title: 'Again', base_branch: 'main', compare_branch: 'feature/x' },
      socket,
      'Claude Code'
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(existing)
    expect(result.content[0].text).toContain('update_pr')
    expect(new ReviewStore().listPRs(repoPath)).toHaveLength(1)
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('creates a new PR when the earlier PR for the branch is closed', async () => {
    const closed = await createPr(repoPath, socket, 'feature/x')
    new ReviewStore().updatePRStatus(repoPath, closed, 'closed')

    const result = await callTool(
      'create_pr',
      { repo_path: repoPath, title: 'Again', base_branch: 'main', compare_branch: 'feature/x' },
      socket,
      'Claude Code'
    )

    expect(result.isError).toBeUndefined()
    expect(resultJson(result).pr_id).not.toBe(closed)
  })

  it('refuses a base branch equal to the compare branch', async () => {
    const result = await callTool(
      'create_pr',
      { repo_path: repoPath, title: 'T', base_branch: 'feature/x', compare_branch: 'feature/x' },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('must differ')
    expect(fs.existsSync(path.join(repoPath, '.reviews'))).toBe(false)
  })

  it('maps non-Claude identities to the copilot assignee', async () => {
    fs.mkdirSync(path.join(repoPath, '.reviews'))
    const result = await callTool(
      'create_pr',
      { repo_path: repoPath, title: 'T', base_branch: 'main', compare_branch: 'feature/x' },
      socket,
      'Copilot'
    )
    expect(resultJson(result).assignee).toBe('copilot')
  })
})

describe('complete_assignment', () => {
  it('ends the fix session without removing the assignee', async () => {
    const repoPath = makeGitRepo()
    fs.mkdirSync(path.join(repoPath, '.reviews'), { recursive: true })
    const socket = { emit: vi.fn() } as unknown as SocketClient
    const created = resultJson(
      await callTool(
        'create_pr',
        { repo_path: repoPath, title: 'T', base_branch: 'main', compare_branch: 'feature/x' },
        socket,
        'Claude Code'
      )
    )
    const prId = created.pr_id as string
    const { ReviewStore } = await import('../../shared/review-store')
    const store = new ReviewStore()
    const review = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    store.submitReview(repoPath, prId, review.id)
    store.startFix(repoPath, prId, review.id)

    const result = await callTool(
      'complete_assignment',
      { repo_path: repoPath, pr_id: prId },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBeUndefined()
    expect(store.getReview(repoPath, prId, review.id).fix_started_at).toBeNull()
    expect(store.getPR(repoPath, prId).assignee).toBe('claude')
    fs.rmSync(repoPath, { recursive: true, force: true })
  })

  it('durably returns a legacy PR with open comments to reviewed', async () => {
    const repoPath = makeGitRepo()
    fs.mkdirSync(path.join(repoPath, '.reviews'), { recursive: true })
    const socket = { emit: vi.fn() } as unknown as SocketClient
    const { ReviewStore } = await import('../../shared/review-store')
    const store = new ReviewStore()
    const prId = store.createPR(repoPath, {
      title: 'T',
      description: null,
      base_branch: 'main',
      compare_branch: 'feature/x',
    }).id
    const review = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    store.addComment(repoPath, prId, review.id, {
      file: 'src/a.ts',
      start_line: 1,
      end_line: 1,
      side: 'right',
      body: 'Fix this',
      context: [],
    })
    store.submitReview(repoPath, prId, review.id)
    // Rewrite the review as a genuine legacy file: no fix_started_at key,
    // submitted before the assignment that follows.
    const reviewPath = path.join(repoPath, '.reviews', prId, 'reviews', `${review.id}.json`)
    const raw = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
    raw.submitted_at = new Date(Date.now() - 60_000).toISOString()
    delete raw.fix_started_at
    fs.writeFileSync(reviewPath, JSON.stringify(raw))
    store.assignPR(repoPath, prId, 'claude')

    // The one-shot migration stamps the legacy mid-fix review
    expect(store.listReviews(repoPath, prId)[0].fix_started_at).not.toBeNull()

    const result = await callTool(
      'complete_assignment',
      { repo_path: repoPath, pr_id: prId },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBeUndefined()
    // Cleared, and it stays cleared on subsequent reads — the migration
    // cannot re-stamp a file that now carries the key.
    expect(store.listReviews(repoPath, prId)[0].fix_started_at).toBeNull()
    expect(store.listReviews(repoPath, prId)[0].fix_started_at).toBeNull()
    fs.rmSync(repoPath, { recursive: true, force: true })
  })
})

describe('list_prs', () => {
  let repoPath: string
  let socket: SocketClient
  let store: ReviewStore

  beforeEach(() => {
    repoPath = makeGitRepo()
    socket = { emit: vi.fn() } as unknown as SocketClient
    store = new ReviewStore()
  })

  afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }))

  it('advertises the status and compare_branch filters', () => {
    const tool = buildTools().find((t) => t.name === 'list_prs')!
    expect(Object.keys(tool.inputSchema.properties)).toEqual(
      expect.arrayContaining(['status', 'compare_branch'])
    )
    expect(tool.inputSchema.required).toEqual(['repo_path'])
  })

  it('returns an empty list for a repository with no PRs, with filters given', async () => {
    const result = await callTool(
      'list_prs',
      { repo_path: repoPath, status: 'open', compare_branch: 'feature/x' },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBeUndefined()
    expect(listJson(result)).toEqual([])
  })

  it('gives each PR its workflow phase and open comment count', async () => {
    const prId = await createPr(repoPath, socket)
    const review = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    store.addComment(repoPath, prId, review.id, {
      file: 'a.ts',
      start_line: 1,
      end_line: 1,
      side: 'right',
      body: 'Fix this',
      context: [],
    })
    store.submitReview(repoPath, prId, review.id)

    const [pr] = listJson(
      await callTool('list_prs', { repo_path: repoPath }, socket, 'Claude Code')
    )
    expect(pr.id).toBe(prId)
    expect(pr.workflow_phase).toBe('reviewed')
    expect(pr.open_comments).toBe(1)
  })

  it('filters by status and by compare branch together', async () => {
    const openX = await createPr(repoPath, socket, 'feature/x')
    const closedY = await createPr(repoPath, socket, 'feature/y')
    store.updatePRStatus(repoPath, closedY, 'closed')

    const byStatus = listJson(
      await callTool('list_prs', { repo_path: repoPath, status: 'closed' }, socket, 'Claude Code')
    )
    expect(byStatus.map((p) => p.id)).toEqual([closedY])

    const byBranch = listJson(
      await callTool(
        'list_prs',
        { repo_path: repoPath, compare_branch: 'feature/x' },
        socket,
        'Claude Code'
      )
    )
    expect(byBranch.map((p) => p.id)).toEqual([openX])

    const both = listJson(
      await callTool(
        'list_prs',
        { repo_path: repoPath, status: 'open', compare_branch: 'feature/y' },
        socket,
        'Claude Code'
      )
    )
    expect(both).toEqual([])
  })
})

describe('get_pr', () => {
  it('includes the workflow phase and open comment count', async () => {
    const repoPath = makeGitRepo()
    const socket = { emit: vi.fn() } as unknown as SocketClient
    const prId = await createPr(repoPath, socket)

    const data = resultJson(
      await callTool('get_pr', { repo_path: repoPath, pr_id: prId }, socket, 'Claude Code')
    )
    expect(data.workflow_phase).toBe('awaiting_review')
    expect(data.open_comments).toBe(0)
    expect((data.pr as { id: string }).id).toBe(prId)
    fs.rmSync(repoPath, { recursive: true, force: true })
  })
})

describe('update_pr', () => {
  let repoPath: string
  let socket: SocketClient
  let store: ReviewStore
  let prId: string

  beforeEach(async () => {
    repoPath = makeGitRepo()
    socket = { emit: vi.fn() } as unknown as SocketClient
    store = new ReviewStore()
    prId = await createPr(repoPath, socket)
    vi.mocked(socket.emit).mockClear()
  })

  afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }))

  function update(changes: Record<string, string>) {
    return callTool(
      'update_pr',
      { repo_path: repoPath, pr_id: prId, ...changes },
      socket,
      'Claude Code'
    )
  }

  it('is advertised with only repo_path and pr_id required', () => {
    const tool = buildTools().find((t) => t.name === 'update_pr')!
    expect(tool.inputSchema.required).toEqual(['repo_path', 'pr_id'])
    expect(Object.keys(tool.inputSchema.properties)).toEqual(
      expect.arrayContaining(['title', 'description', 'base_branch'])
    )
  })

  it('changes the title and description and notifies the app', async () => {
    const result = await update({ title: 'New title', description: 'New body' })
    expect(result.isError).toBeUndefined()
    const pr = store.getPR(repoPath, prId)
    expect(pr.title).toBe('New title')
    expect(pr.description).toBe('New body')
    expect(socket.emit).toHaveBeenCalledWith({ event: 'pr:updated', repoPath, prId })
  })

  it('clears the description when given an empty string', async () => {
    await update({ description: 'Something' })
    await update({ description: '' })
    expect(store.getPR(repoPath, prId).description).toBeNull()
  })

  it('refuses an empty title', async () => {
    const result = await update({ title: '   ' })
    expect(result.isError).toBe(true)
    expect(store.getPR(repoPath, prId).title).toBe('T')
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('refuses a call with no changes', async () => {
    const result = await update({})
    expect(result.isError).toBe(true)
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('changes the base branch when no review is active', async () => {
    const result = await update({ base_branch: 'develop' })
    expect(result.isError).toBeUndefined()
    expect(store.getPR(repoPath, prId).base_branch).toBe('develop')
  })

  it('changes the base branch after a review round is complete', async () => {
    const review = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    store.submitReview(repoPath, prId, review.id)
    store.completeReview(repoPath, prId, review.id)
    const result = await update({ base_branch: 'develop' })
    expect(result.isError).toBeUndefined()
  })

  it('refuses an unknown base branch', async () => {
    const result = await update({ base_branch: 'no-such-branch' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Branch not found: no-such-branch')
  })

  it('refuses a base branch equal to the compare branch', async () => {
    const result = await update({ base_branch: 'feature/x' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('must differ')
  })

  it.each([
    ['reviewing', false, false],
    ['reviewed', true, false],
    ['in_fix', true, true],
  ])('refuses a base branch change in phase %s', async (phase, submit, startFix) => {
    const review = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    if (submit) store.submitReview(repoPath, prId, review.id)
    if (startFix) store.startFix(repoPath, prId, review.id)

    const result = await update({ base_branch: 'develop' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(phase)
    expect(store.getPR(repoPath, prId).base_branch).toBe('main')
  })

  it('writes nothing when one field of several is invalid', async () => {
    const before = store.getPR(repoPath, prId)
    const result = await update({ title: 'Good title', base_branch: 'no-such-branch' })
    expect(result.isError).toBe(true)
    expect(store.getPR(repoPath, prId)).toEqual(before)
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('returns an error for an unknown pr_id', async () => {
    const result = await callTool(
      'update_pr',
      { repo_path: repoPath, pr_id: '00000000-0000-4000-8000-000000000000', title: 'X' },
      socket,
      'Claude Code'
    )
    expect(result.isError).toBe(true)
    expect(socket.emit).not.toHaveBeenCalled()
  })
})

describe('close_pr and reopen_pr', () => {
  let repoPath: string
  let socket: SocketClient
  let store: ReviewStore
  let prId: string

  beforeEach(async () => {
    repoPath = makeGitRepo()
    socket = { emit: vi.fn() } as unknown as SocketClient
    store = new ReviewStore()
    prId = await createPr(repoPath, socket)
    vi.mocked(socket.emit).mockClear()
  })

  afterEach(() => fs.rmSync(repoPath, { recursive: true, force: true }))

  const call = (name: string, id = prId) =>
    callTool(name, { repo_path: repoPath, pr_id: id }, socket, 'Claude Code')

  it('advertises both tools with repo_path and pr_id required', () => {
    for (const name of ['close_pr', 'reopen_pr']) {
      const tool = buildTools().find((t) => t.name === name)!
      expect(tool.inputSchema.required).toEqual(['repo_path', 'pr_id'])
    }
  })

  it('closes a PR, tells the agent how to undo it, and notifies the app', async () => {
    const result = await call('close_pr')
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('reopen_pr')
    expect(store.getPR(repoPath, prId).status).toBe('closed')
    expect(socket.emit).toHaveBeenCalledWith({ event: 'pr:updated', repoPath, prId })
  })

  it('reopens a closed PR', async () => {
    await call('close_pr')
    const result = await call('reopen_pr')
    expect(result.isError).toBeUndefined()
    expect(store.getPR(repoPath, prId).status).toBe('open')
  })

  it('keeps the review and fix state across a close and reopen mid-fix', async () => {
    const review = store.createReview(repoPath, prId, {
      base_sha: 'a'.repeat(40),
      compare_sha: 'b'.repeat(40),
    })
    store.submitReview(repoPath, prId, review.id)
    store.startFix(repoPath, prId, review.id)
    const before = store.getReview(repoPath, prId, review.id)

    await call('close_pr')
    await call('reopen_pr')

    expect(store.getReview(repoPath, prId, review.id)).toEqual(before)
    const data = resultJson(await call('get_pr'))
    expect(data.workflow_phase).toBe('in_fix')
  })

  it('refuses to reopen a merged PR', async () => {
    store.mergePR(repoPath, prId)
    const result = await call('reopen_pr')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('merged')
    expect(store.getPR(repoPath, prId).status).toBe('closed')
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('returns an error for an unknown pr_id', async () => {
    const result = await call('close_pr', '00000000-0000-4000-8000-000000000000')
    expect(result.isError).toBe(true)
    expect(socket.emit).not.toHaveBeenCalled()
  })
})

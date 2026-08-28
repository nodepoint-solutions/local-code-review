// src/main/__tests__/mcp-tools.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { callTool, buildTools } from '../../mcp-server/tools'
import type { SocketClient } from '../../mcp-server/socket-client'

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tools-test-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir })
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'],
    { cwd: dir }
  )
  execFileSync('git', ['branch', 'feature/x'], { cwd: dir })
  return dir
}

function resultJson(result: { content: { text: string }[] }): Record<string, unknown> {
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

  it('refuses a repository the app does not manage yet', async () => {
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
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not set up in Local Code Review')
  })

  it('refuses an unknown branch', async () => {
    fs.mkdirSync(path.join(repoPath, '.reviews'))
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

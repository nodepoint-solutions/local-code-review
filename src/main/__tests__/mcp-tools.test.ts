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

  it('maps VS Code-family identities to the vscode assignee', async () => {
    fs.mkdirSync(path.join(repoPath, '.reviews'))
    const result = await callTool(
      'create_pr',
      { repo_path: repoPath, title: 'T', base_branch: 'main', compare_branch: 'feature/x' },
      socket,
      'Copilot'
    )
    expect(resultJson(result).assignee).toBe('vscode')
  })
})

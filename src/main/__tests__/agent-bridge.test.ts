// src/main/__tests__/agent-bridge.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { socketPath, recordPendingRepo, drainPendingRepos } from '../../shared/agent-bridge'

describe('agent bridge', () => {
  let stateDir: string
  const originalStateDir = process.env['LOCAL_REVIEW_STATE_DIR']
  const originalSocket = process.env['LOCAL_REVIEW_SOCKET']

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-'))
    process.env['LOCAL_REVIEW_STATE_DIR'] = stateDir
    delete process.env['LOCAL_REVIEW_SOCKET']
  })

  afterEach(() => {
    if (originalStateDir === undefined) delete process.env['LOCAL_REVIEW_STATE_DIR']
    else process.env['LOCAL_REVIEW_STATE_DIR'] = originalStateDir
    if (originalSocket === undefined) delete process.env['LOCAL_REVIEW_SOCKET']
    else process.env['LOCAL_REVIEW_SOCKET'] = originalSocket
    fs.rmSync(stateDir, { recursive: true, force: true })
  })

  describe.runIf(process.platform !== 'win32')('socket location', () => {
    it('sits in the state directory, so both processes compute the same path', () => {
      expect(socketPath()).toBe(path.join(stateDir, 'app.sock'))
    })
  })

  it('prefers an explicitly configured socket path', () => {
    process.env['LOCAL_REVIEW_SOCKET'] = path.join(stateDir, 'explicit.sock')
    expect(socketPath()).toBe(path.join(stateDir, 'explicit.sock'))
  })

  it('hands a recorded repository to the next drain, and only once', () => {
    recordPendingRepo('/tmp/repo-a')
    recordPendingRepo('/tmp/repo-b')

    expect(drainPendingRepos()).toEqual(['/tmp/repo-a', '/tmp/repo-b'])
    expect(drainPendingRepos()).toEqual([])
  })

  it('records a repository once however many PRs it receives', () => {
    recordPendingRepo('/tmp/repo-a')
    recordPendingRepo('/tmp/repo-a')

    expect(drainPendingRepos()).toEqual(['/tmp/repo-a'])
  })

  it('drains nothing when no agent has written', () => {
    expect(drainPendingRepos()).toEqual([])
  })

  it('starts over from a corrupt handoff file', () => {
    fs.writeFileSync(path.join(stateDir, 'pending-repos.json'), '{ truncated', 'utf8')

    expect(drainPendingRepos()).toEqual([])

    recordPendingRepo('/tmp/repo-a')
    expect(drainPendingRepos()).toEqual(['/tmp/repo-a'])
  })

  it('creates the state directory on first record', () => {
    fs.rmSync(stateDir, { recursive: true, force: true })

    recordPendingRepo('/tmp/repo-a')

    expect(drainPendingRepos()).toEqual(['/tmp/repo-a'])
  })
})

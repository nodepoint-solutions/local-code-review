// src/shared/agent-bridge.ts
//
// The channel between the app and the MCP server instances that agents start
// for themselves. Both sides compute these locations from the same rules, so
// a server spawned by Claude Code or VS Code reaches the app without being
// told where it is. The socket carries events while the app is running; the
// handoff file carries repositories across an app that was closed.
import fs from 'fs'
import os from 'os'
import path from 'path'

export interface ReviewUpdatedEvent {
  event: 'review:updated'
  repoPath: string
  prId: string
  reviewId: string
}

export interface PrUpdatedEvent {
  event: 'pr:updated'
  repoPath: string
  prId: string
}

/** An agent wrote a PR to this repository, so the app should manage it. */
export interface RepoRegisteredEvent {
  event: 'repo:registered'
  repoPath: string
}

export type SocketEvent = ReviewUpdatedEvent | PrUpdatedEvent | RepoRegisteredEvent

/** Directory holding the state the app shares with agent-side processes. */
export function stateDir(): string {
  return process.env['LOCAL_REVIEW_STATE_DIR'] ?? path.join(os.homedir(), '.local-code-review')
}

/** The socket the app listens on for agent events. */
export function socketPath(): string {
  const configured = process.env['LOCAL_REVIEW_SOCKET']
  if (configured) return configured
  const dir = stateDir()
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\${path.basename(dir)}`
    : path.join(dir, 'app.sock')
}

function pendingReposPath(): string {
  return path.join(stateDir(), 'pending-repos.json')
}

function readPendingRepos(): string[] {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(pendingReposPath(), 'utf8'))
    return Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    // Missing or unreadable — treat as nothing pending, and let the next
    // record start a fresh file.
    return []
  }
}

/**
 * Records a repository an agent has written to, so the app registers it on
 * its next look even when it was closed at the time. Best effort: the socket
 * is the live channel, and a failure here must never fail the agent's call.
 */
export function recordPendingRepo(repoPath: string): void {
  try {
    const pending = readPendingRepos()
    if (pending.includes(repoPath)) return
    const filePath = pendingReposPath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify([...pending, repoPath], null, 2), 'utf8')
    fs.renameSync(tmpPath, filePath)
  } catch {
    // ignore — the repository still reaches the app over the socket, or
    // through scan discovery once its .reviews directory exists
  }
}

/** Returns the recorded repositories and clears the file. */
export function drainPendingRepos(): string[] {
  const pending = readPendingRepos()
  try {
    fs.rmSync(pendingReposPath(), { force: true })
  } catch {
    // ignore — a repository registered twice is harmless
  }
  return pending
}

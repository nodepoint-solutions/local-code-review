// src/main/__tests__/socket-client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { SocketClient } from '../../mcp-server/socket-client'

// Counts the socket handles that keep the event loop alive, which is what
// decides whether the MCP server process stays running.
function liveSocketHandles(): number {
  return process.getActiveResourcesInfo().filter((r) => r === 'PipeWrap').length
}

let dir: string
let socketPath: string
let server: net.Server
let client: SocketClient

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'socket-client-'))
  socketPath =
    process.platform === 'win32' ? `\\\\.\\pipe\\${path.basename(dir)}` : path.join(dir, 'app.sock')
  // The app's side of each connection is unref'd, so the count reflects the
  // client socket alone
  server = net.createServer((socket) => socket.unref())
  server.unref()
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  client = new SocketClient()
})

afterEach(async () => {
  client.disconnect()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  fs.rmSync(dir, { recursive: true, force: true })
})

async function connected(): Promise<void> {
  await new Promise<void>((resolve) => server.once('connection', () => resolve()))
}

describe('SocketClient', () => {
  it('lets a stdio server exit once its MCP client has gone', async () => {
    const before = liveSocketHandles()
    const connection = connected()
    client.connect(socketPath)
    await connection

    expect(liveSocketHandles()).toBe(before)
  })

  it('keeps the app-spawned daemon running while the app is listening', async () => {
    const before = liveSocketHandles()
    const connection = connected()
    client.connect(socketPath, { keepAlive: true })
    await connection

    expect(liveSocketHandles()).toBe(before + 1)
  })
})

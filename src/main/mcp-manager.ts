// src/main/mcp-manager.ts
import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import os from 'os'
import path from 'path'
import { app } from 'electron'

export interface McpEvent {
  event: string
  repoPath: string
  prId: string
  reviewId?: string
}

export class McpManager {
  private child: ChildProcess | null = null
  private socketServer: net.Server | null = null
  private socketPath: string

  constructor(private onEvent: (event: McpEvent) => void) {
    const suffix = process.platform === 'win32' ? `local-review-${process.pid}` : `local-review-${process.pid}.sock`
    this.socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${suffix}`
        : path.join(os.tmpdir(), suffix)
  }

  get running(): boolean {
    return this.child !== null && !this.child.killed
  }

  start(): void {
    if (this.running) return
    this.startSocketServer()
    this.spawnChild()
  }

  stop(): void {
    this.child?.kill('SIGTERM')
    this.child = null
    this.socketServer?.close()
    this.socketServer = null
  }

  private mcpBinaryPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'mcp-server', 'index.js')
    }
    return path.join(app.getAppPath(), 'dist', 'mcp-server', 'index.js')
  }

  private spawnChild(): void {
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      LOCAL_REVIEW_SOCKET: this.socketPath,
      LOCAL_REVIEW_IDENTITY: 'mcp',
    }

    this.child = spawn(process.execPath, [this.mcpBinaryPath()], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child.on('close', () => {
      this.child = null
    })

    this.child.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[mcp-server] ${data.toString()}`)
    })
  }

  private startSocketServer(): void {
    this.socketServer = net.createServer((socket) => {
      let buf = ''
      socket.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as McpEvent
            this.onEvent(event)
          } catch {
            // ignore malformed lines
          }
        }
      })
    })

    this.socketServer.listen(this.socketPath)
  }
}

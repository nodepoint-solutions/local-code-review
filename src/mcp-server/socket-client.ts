// src/mcp-server/socket-client.ts
import net from 'net'
import type { SocketEvent } from '../shared/agent-bridge'

export type {
  SocketEvent,
  ReviewUpdatedEvent,
  PrUpdatedEvent,
  RepoRegisteredEvent,
} from '../shared/agent-bridge'

export class SocketClient {
  private client: net.Socket | null = null

  connect(socketPath: string, { keepAlive = false }: { keepAlive?: boolean } = {}): void {
    this.client = net.createConnection(socketPath)
    // For a server an agent started, the connection is a side channel: the
    // stdio client decides its lifetime, so it exits once that client has
    // gone. The daemon the app spawns has no stdio client, so the connection
    // holds it open for as long as the app listens.
    if (!keepAlive) this.client.unref()
    this.client.on('error', () => {
      // Silently ignore — Electron may not be listening (e.g. unit test context)
    })
  }

  emit(event: SocketEvent): void {
    if (!this.client || this.client.destroyed) return
    try {
      this.client.write(JSON.stringify(event) + '\n')
    } catch {
      // ignore write errors
    }
  }

  disconnect(): void {
    this.client?.destroy()
    this.client = null
  }
}

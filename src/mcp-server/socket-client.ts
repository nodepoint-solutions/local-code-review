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

  connect(socketPath: string): void {
    this.client = net.createConnection(socketPath)
    // The connection is a side channel: it must never be the reason this
    // process stays alive once its MCP client has gone.
    this.client.unref()
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

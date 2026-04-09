// src/mcp-server/socket-client.ts
import net from 'net'

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

export type SocketEvent = ReviewUpdatedEvent | PrUpdatedEvent

export class SocketClient {
  private client: net.Socket | null = null

  connect(socketPath: string): void {
    this.client = net.createConnection(socketPath)
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

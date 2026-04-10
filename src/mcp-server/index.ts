// src/mcp-server/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { SocketClient } from './socket-client'
import { buildTools, callTool } from './tools'

const SOCKET_PATH = process.env['LOCAL_REVIEW_SOCKET'] ?? ''
const RESOLVED_BY = process.env['LOCAL_REVIEW_IDENTITY'] ?? 'mcp'

const socketClient = new SocketClient()
if (SOCKET_PATH) socketClient.connect(SOCKET_PATH)

const server = new Server(
  { name: 'local-code-review', version: '1.0.0' },
  { capabilities: { tools: {}, prompts: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: buildTools(),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, string>
  return callTool(request.params.name, args, socketClient, RESOLVED_BY)
})

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'fix-review',
      description: 'Workflow prompt for implementing fixes from a local code review',
    },
  ],
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== 'fix-review') {
    throw new Error(`Unknown prompt: ${request.params.name}`)
  }
  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are implementing fixes from a local code review.

Use get_open_issues() to find open issues in this repository. For each open issue:
1. Read the context and understand what needs to change
2. Implement the fix in the codebase
3. Call mark_resolved() or mark_wont_fix() with a clear explanation of what you did or why you skipped it

Rules:
- Never mark an issue without a resolution_comment
- Work through all open issues before finishing
- If an issue is already fixed by the time you get to it, mark_resolved() and explain what you observed
- When all issues are addressed, call complete_assignment() to unassign yourself and signal that you are done`,
        },
      },
    ],
  }
})

// Connect the stdio transport so MCP clients (Claude Code, VS Code) can
// call tools. When spawned as a background daemon by the Electron app,
// stdin is not a real stream and the transport will throw — swallow that
// and keep running for the socket connection only.
try {
  const transport = new StdioServerTransport()
  server.connect(transport).catch(() => {})
} catch {
  // Running as daemon without a stdio client — socket-only mode.
}

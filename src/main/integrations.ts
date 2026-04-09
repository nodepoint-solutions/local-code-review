// src/main/integrations.ts
import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import type { IntegrationStatus } from '../shared/types'

const home = os.homedir()
const appdata = process.env['APPDATA'] ?? home
const platform = process.platform

function xdgConfig(): string {
  return process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config')
}

interface ToolConfig {
  id: IntegrationStatus['id']
  name: string
  configPath: string
  keyPath: string[]
  entryShape: 'claude' | 'vscode'
}

function resolveConfigs(): ToolConfig[] {
  return [
    {
      id: 'claudeCode',
      name: 'Claude Code',
      configPath: path.join(home, '.claude.json'),
      keyPath: ['mcpServers'],
      entryShape: 'claude',
    },
    {
      id: 'claudeDesktop',
      name: 'Claude Desktop',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Claude', 'claude_desktop_config.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
          : path.join(xdgConfig(), 'Claude', 'claude_desktop_config.json'),
      keyPath: ['mcpServers'],
      entryShape: 'claude',
    },
    {
      id: 'vscode',
      name: 'VS Code',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Code', 'User', 'settings.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json')
          : path.join(xdgConfig(), 'Code', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
      entryShape: 'vscode',
    },
    {
      id: 'cursor',
      name: 'Cursor',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Cursor', 'User', 'settings.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json')
          : path.join(xdgConfig(), 'Cursor', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
      entryShape: 'vscode',
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      configPath:
        platform === 'win32'
          ? path.join(appdata, 'Windsurf', 'User', 'settings.json')
          : platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'settings.json')
          : path.join(xdgConfig(), 'Windsurf', 'User', 'settings.json'),
      keyPath: ['mcp', 'servers'],
      entryShape: 'vscode',
    },
  ]
}

function mcpBinaryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-server', 'index.js')
  }
  return path.join(app.getAppPath(), 'dist', 'mcp-server', 'index.js')
}

function resolveNodePath(): string {
  const { execSync } = require('child_process') as typeof import('child_process')
  try {
    return execSync('which node', { encoding: 'utf8' }).trim()
  } catch {
    return 'node'
  }
}

function buildEntry(shape: 'claude' | 'vscode') {
  const command = resolveNodePath()
  const args = [mcpBinaryPath()]
  if (shape === 'claude') {
    return { type: 'stdio', command, args, env: {} }
  }
  return { type: 'stdio', command, args }
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function deepGet(obj: Record<string, unknown>, keyPath: string[]): Record<string, unknown> {
  let cur: unknown = obj
  for (const key of keyPath) {
    if (typeof cur !== 'object' || cur === null) return {}
    cur = (cur as Record<string, unknown>)[key]
  }
  return (typeof cur === 'object' && cur !== null ? cur : {}) as Record<string, unknown>
}

function deepSet(obj: Record<string, unknown>, keyPath: string[], value: unknown): void {
  let cur = obj
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i]
    if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {}
    cur = cur[key] as Record<string, unknown>
  }
  cur[keyPath[keyPath.length - 1]] = value
}

function isInstalled(config: ToolConfig): boolean {
  const obj = readJson(config.configPath)
  const servers = deepGet(obj, config.keyPath)
  return 'local-code-review' in servers
}

export function getIntegrations(): IntegrationStatus[] {
  return resolveConfigs().map((config) => ({
    id: config.id,
    name: config.name,
    detected: fs.existsSync(path.dirname(config.configPath)),
    installed: fs.existsSync(config.configPath) && isInstalled(config),
  }))
}

export function installIntegrations(): void {
  for (const config of resolveConfigs()) {
    const dir = path.dirname(config.configPath)
    if (!fs.existsSync(dir)) continue

    const obj = readJson(config.configPath)
    const servers = deepGet(obj, config.keyPath)
    servers['local-code-review'] = buildEntry(config.entryShape)
    deepSet(obj, config.keyPath, servers)

    fs.mkdirSync(dir, { recursive: true })
    const tmp = config.configPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    fs.renameSync(tmp, config.configPath)
  }
}

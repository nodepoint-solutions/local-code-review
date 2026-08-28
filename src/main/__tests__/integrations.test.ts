// src/main/__tests__/integrations.test.ts
//
// refreshInstalledIntegrations writes into the user's own tool configs, so
// these tests run against a throwaway home directory.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Hoisted above the imports, so it cannot use them
const { fakeHome, nodePath } = vi.hoisted(() => ({
  fakeHome: `${process.env['TMPDIR'] ?? '/tmp'}/lcr-integrations-home-${process.pid}`,
  nodePath: { value: '/usr/local/bin/node' as string | null },
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/opt/local-code-review' },
}))

vi.mock('child_process', () => ({
  execSync: () => {
    if (nodePath.value === null) throw new Error('node not found on PATH')
    return `${nodePath.value}\n`
  },
}))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return { ...actual, default: { ...actual, homedir: () => fakeHome }, homedir: () => fakeHome }
})

const { refreshInstalledIntegrations, getIntegrations } = await import('../integrations')

const claudeConfig = path.join(fakeHome, '.claude.json')
const claudeSkill = path.join(fakeHome, '.claude', 'skills', 'local-code-review', 'SKILL.md')
const createPrSkill = path.join(
  fakeHome,
  '.claude',
  'skills',
  'local-code-review-create-pr',
  'SKILL.md'
)

function readJson(filePath: string): Record<string, never> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

describe('refreshInstalledIntegrations', () => {
  beforeEach(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true })
    fs.mkdirSync(fakeHome, { recursive: true })
    nodePath.value = '/usr/local/bin/node'
  })

  afterEach(() => fs.rmSync(fakeHome, { recursive: true, force: true }))

  it('updates an entry the user already connected, keeping the rest of the file', () => {
    fs.writeFileSync(
      claudeConfig,
      JSON.stringify({
        projects: { '/work/thing': { history: ['a'] } },
        mcpServers: {
          'local-code-review': { type: 'stdio', command: 'node', args: ['/old/path.js'] },
          'other-server': { command: 'other' },
        },
      }),
      'utf8'
    )

    refreshInstalledIntegrations()

    const config = readJson(claudeConfig) as never as {
      projects: unknown
      mcpServers: Record<string, { args: string[]; env: Record<string, string> }>
    }
    expect(config.mcpServers['local-code-review'].args).toEqual([
      path.join('/opt/local-code-review', 'dist', 'mcp-server', 'index.js'),
    ])
    expect(config.mcpServers['local-code-review'].env['LOCAL_REVIEW_STATE_DIR']).toBeTruthy()
    // Nothing else in the user's file is disturbed
    expect(config.mcpServers['other-server']).toEqual({ command: 'other' })
    expect(config.projects).toEqual({ '/work/thing': { history: ['a'] } })
  })

  it('leaves a tool the user never connected alone', () => {
    fs.writeFileSync(claudeConfig, JSON.stringify({ mcpServers: { 'other-server': {} } }), 'utf8')

    refreshInstalledIntegrations()

    const config = readJson(claudeConfig) as never as { mcpServers: Record<string, unknown> }
    expect(config.mcpServers['local-code-review']).toBeUndefined()
    expect(getIntegrations().find((i) => i.id === 'claudeCode')!.installed).toBe(false)
  })

  it('writes no config at all when the tool has never been set up', () => {
    refreshInstalledIntegrations()

    expect(fs.existsSync(claudeConfig)).toBe(false)
  })

  it('touches nothing on a launch that changes neither config nor skills', () => {
    fs.writeFileSync(
      claudeConfig,
      JSON.stringify({
        mcpServers: { 'local-code-review': { type: 'stdio', command: 'x', args: [] } },
      }),
      'utf8'
    )
    fs.mkdirSync(path.dirname(claudeSkill), { recursive: true })
    fs.writeFileSync(claudeSkill, 'stale', 'utf8')
    // First launch brings both up to date
    refreshInstalledIntegrations()

    const writes = vi.spyOn(fs, 'writeFileSync')
    refreshInstalledIntegrations()

    expect(writes).not.toHaveBeenCalled()
    writes.mockRestore()
  })

  it('keeps a resolved node path when this launch cannot find node', () => {
    fs.writeFileSync(
      claudeConfig,
      JSON.stringify({
        mcpServers: {
          'local-code-review': { type: 'stdio', command: '/opt/homebrew/bin/node', args: [] },
        },
      }),
      'utf8'
    )
    // A launch from Finder gets a minimal PATH
    nodePath.value = null

    refreshInstalledIntegrations()

    const config = readJson(claudeConfig) as never as {
      mcpServers: Record<string, { command: string }>
    }
    expect(config.mcpServers['local-code-review'].command).toBe('/opt/homebrew/bin/node')
  })

  it('brings an installed skill up to the current text', () => {
    fs.mkdirSync(path.dirname(claudeSkill), { recursive: true })
    fs.writeFileSync(claudeSkill, 'old skill text', 'utf8')

    refreshInstalledIntegrations()

    expect(fs.readFileSync(claudeSkill, 'utf8')).not.toBe('old skill text')
    expect(fs.readFileSync(claudeSkill, 'utf8')).toContain('name: local-code-review')
    // A skill added by a later version arrives with the refresh
    expect(fs.existsSync(createPrSkill)).toBe(true)
    expect(fs.readFileSync(createPrSkill, 'utf8')).toContain('create_pr adds it to the app')
  })

  it('installs no skills for an ecosystem the user never connected', () => {
    refreshInstalledIntegrations()

    expect(fs.existsSync(claudeSkill)).toBe(false)
  })
})

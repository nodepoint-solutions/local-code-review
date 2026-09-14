// src/main/__tests__/fix-launcher.test.ts
import { describe, it, expect } from 'vitest'
import { buildFixPrompt, buildLaunchCommand, resolveShell } from '../fix-launcher'

const repo = '/Users/me/my repo'
const prompt = '/local-code-review repo_path="/Users/me/my repo" pr_id="p1" review_id="r1"'
const shell = '/bin/zsh'

describe('buildFixPrompt', () => {
  it('produces the skill invocation line', () => {
    expect(buildFixPrompt(repo, 'p1', 'r1')).toBe(prompt)
  })
})

describe('resolveShell', () => {
  it('keeps a shell whose script syntax matches the wrapper', () => {
    expect(resolveShell('/bin/zsh')).toBe('/bin/zsh')
    expect(resolveShell('/bin/bash')).toBe('/bin/bash')
    expect(resolveShell('/opt/homebrew/bin/bash')).toBe('/opt/homebrew/bin/bash')
  })

  it('falls back to zsh for shells that read `"$@"` differently', () => {
    expect(resolveShell('/opt/homebrew/bin/fish')).toBe('/bin/zsh')
  })

  it('falls back to zsh when the account records no shell', () => {
    expect(resolveShell(undefined)).toBe('/bin/zsh')
  })
})

describe('buildLaunchCommand', () => {
  describe('claude', () => {
    it('Terminal launches claude via osascript with argv-passed strings', () => {
      const { command, args } = buildLaunchCommand('claude', 'Terminal', repo, prompt)
      expect(command).toBe('osascript')
      // repo and prompt travel as argv items, never interpolated into the script
      expect(args.slice(-2)).toEqual([repo, prompt])
      expect(args.join('\n')).toContain('tell application "Terminal"')
      expect(args.join('\n')).toContain('&& claude "')
    })

    it('iTerm types the command into a new window session', () => {
      const { command, args } = buildLaunchCommand('claude', 'iTerm', repo, prompt)
      expect(command).toBe('osascript')
      expect(args.slice(-2)).toEqual([repo, prompt])
      expect(args.join('\n')).toContain('tell application "iTerm"')
      expect(args.join('\n')).toContain('write text')
      expect(args.join('\n')).toContain('&& claude "')
    })

    it('Ghostty resolves the agent through an interactive login shell', () => {
      const { command, args } = buildLaunchCommand('claude', 'Ghostty', repo, prompt, shell)
      expect(command).toBe('open')
      expect(args).toEqual([
        '-na',
        'Ghostty',
        '--args',
        `--working-directory=${repo}`,
        '-e',
        '/bin/zsh',
        '-ilc',
        '"$@"',
        'lcr-fix',
        'claude',
        prompt,
      ])
    })

    it('Ghostty falls back to the account shell when the caller names none', () => {
      // The production call site passes four arguments, so the default is the
      // only path that ever runs outside these tests.
      const { args } = buildLaunchCommand('claude', 'Ghostty', repo, prompt)
      expect(args[4]).toBe('-e')
      expect(args[5]).toMatch(/^\//)
      expect(args.slice(6, 9)).toEqual(['-ilc', '"$@"', 'lcr-fix'])
    })

    it('Ghostty keeps the prompt as one argv item the shell never splits', () => {
      const { args } = buildLaunchCommand('claude', 'Ghostty', repo, prompt, shell)
      expect(args[args.length - 1]).toBe(prompt)
      expect(args.filter((a) => a.includes('repo_path='))).toHaveLength(1)
    })
  })

  describe('copilot', () => {
    it('Terminal runs copilot with the prompt passed via -p', () => {
      const { command, args } = buildLaunchCommand('copilot', 'Terminal', repo, prompt)
      expect(command).toBe('osascript')
      expect(args.slice(-2)).toEqual([repo, prompt])
      expect(args.join('\n')).toContain('tell application "Terminal"')
      expect(args.join('\n')).toContain('&& copilot -p "')
    })

    it('iTerm types the copilot command into a new window session', () => {
      const { command, args } = buildLaunchCommand('copilot', 'iTerm', repo, prompt)
      expect(command).toBe('osascript')
      expect(args.slice(-2)).toEqual([repo, prompt])
      expect(args.join('\n')).toContain('tell application "iTerm"')
      expect(args.join('\n')).toContain('&& copilot -p "')
    })

    it('Ghostty keeps the window open after the copilot run exits', () => {
      const { command, args } = buildLaunchCommand('copilot', 'Ghostty', repo, prompt, shell)
      expect(command).toBe('open')
      expect(args).toEqual([
        '-na',
        'Ghostty',
        '--args',
        `--working-directory=${repo}`,
        '--wait-after-command=true',
        '-e',
        '/bin/zsh',
        '-ilc',
        '"$@"',
        'lcr-fix',
        'copilot',
        '-p',
        prompt,
      ])
    })
  })
})

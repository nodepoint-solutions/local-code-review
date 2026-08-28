// src/main/__tests__/fix-launcher.test.ts
import { describe, it, expect } from 'vitest'
import { buildFixPrompt, buildLaunchCommand } from '../fix-launcher'

const repo = '/Users/me/my repo'
const prompt = '/local-code-review repo_path="/Users/me/my repo" pr_id="p1" review_id="r1"'

describe('buildFixPrompt', () => {
  it('produces the skill invocation line', () => {
    expect(buildFixPrompt(repo, 'p1', 'r1')).toBe(prompt)
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

    it('Ghostty opens a new window with the working directory and command as verbatim argv', () => {
      const { command, args } = buildLaunchCommand('claude', 'Ghostty', repo, prompt)
      expect(command).toBe('open')
      expect(args).toEqual([
        '-na',
        'Ghostty',
        '--args',
        `--working-directory=${repo}`,
        '-e',
        'claude',
        prompt,
      ])
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
      const { command, args } = buildLaunchCommand('copilot', 'Ghostty', repo, prompt)
      expect(command).toBe('open')
      expect(args).toEqual([
        '-na',
        'Ghostty',
        '--args',
        `--working-directory=${repo}`,
        '--wait-after-command=true',
        '-e',
        'copilot',
        '-p',
        prompt,
      ])
    })
  })
})

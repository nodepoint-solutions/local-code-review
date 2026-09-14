// src/main/fix-launcher.ts
//
// Pure construction of the "fix with agent" launch commands, so each
// terminal's invocation is unit-testable without spawning anything.
import fs from 'fs'
import os from 'os'

export type TerminalApp = 'Terminal' | 'iTerm' | 'Ghostty'
export type FixTool = 'claude' | 'copilot'

// Static argv for each agent CLI. claude opens an interactive session with
// the prompt pre-submitted; copilot runs the prompt to completion via -p
// (its programmatic mode — permission prompts still appear in the terminal).
const AGENT_ARGV: Record<FixTool, string[]> = {
  claude: ['claude'],
  copilot: ['copilot', '-p'],
}

// Shells that read `"$@"` as "the rest of my argv", which is what the Ghostty
// wrapper script relies on. A shell outside this set gets the macOS default,
// so its own syntax is never handed a script written for these.
const POSIX_SHELLS = new Set(['zsh', 'bash', 'sh', 'dash', 'ksh'])
const DEFAULT_SHELL = '/bin/zsh'

export function resolveShell(shell: string | null | undefined): string {
  if (!shell) return DEFAULT_SHELL
  return POSIX_SHELLS.has(shell.split('/').pop() ?? '') ? shell : DEFAULT_SHELL
}

export function buildFixPrompt(repoPath: string, prId: string, reviewId: string): string {
  return `/local-code-review repo_path="${repoPath}" pr_id="${prId}" review_id="${reviewId}"`
}

/**
 * repoPath and prompt travel as separate argv items so no shell ever
 * tokenises them. osascript quoting uses AppleScript's `quoted form of`;
 * `open --args` passes argv to the app verbatim. The agent argv itself is
 * a static literal per tool, so it can sit inside the script text safely.
 */
export function buildLaunchCommand(
  tool: FixTool,
  terminal: TerminalApp,
  repoPath: string,
  prompt: string,
  shell: string = resolveShell(os.userInfo().shell)
): { command: string; args: string[] } {
  const agentCall = AGENT_ARGV[tool].join(' ')
  if (terminal === 'Ghostty') {
    // Ghostty has no scripting interface for existing sessions, so this opens
    // a new window. It runs its -e command through `login`, which execs that
    // command with the PATH a GUI app inherits from launchd — /usr/bin:/bin
    // and friends. Agent CLIs live on the PATH a shell rc file builds, so the
    // agent is handed to an interactive login shell and resolved there. `-i`
    // carries its own weight: a login shell reads .zprofile and .zlogin, while
    // PATH is commonly extended in .zshrc, which only an interactive shell
    // reads. `lcr-fix` becomes the wrapper shell's $0 — a name that shows up
    // in `ps`, rather than an argument to the agent — and the agent and prompt
    // follow as separate argv items, which `"$@"` passes through without word
    // splitting. The wrapper shell exits when the agent does, so Ghostty sees
    // the same child-exit event it would see from a direct command.
    return {
      command: 'open',
      args: [
        '-na',
        'Ghostty',
        '--args',
        `--working-directory=${repoPath}`,
        ...(tool === 'copilot' ? ['--wait-after-command=true'] : []),
        '-e',
        shell,
        '-ilc',
        '"$@"',
        'lcr-fix',
        ...AGENT_ARGV[tool],
        prompt,
      ],
    }
  }
  if (terminal === 'iTerm') {
    return {
      command: 'osascript',
      args: [
        '-e',
        'on run argv',
        '-e',
        '  tell application "iTerm"',
        '-e',
        '    set newWindow to (create window with default profile)',
        '-e',
        '    tell current session of newWindow',
        '-e',
        `      write text ("cd " & quoted form of item 1 of argv & " && ${agentCall} " & quoted form of item 2 of argv)`,
        '-e',
        '    end tell',
        '-e',
        '  end tell',
        '-e',
        'end run',
        '--',
        repoPath,
        prompt,
      ],
    }
  }
  return {
    command: 'osascript',
    args: [
      '-e',
      'on run argv',
      '-e',
      `  tell application "Terminal" to do script ("cd " & quoted form of item 1 of argv & " && ${agentCall} " & quoted form of item 2 of argv)`,
      '-e',
      'end run',
      '--',
      repoPath,
      prompt,
    ],
  }
}

const TERMINAL_APP_PATHS: Record<TerminalApp, string[]> = {
  Terminal: ['/System/Applications/Utilities/Terminal.app', '/Applications/Utilities/Terminal.app'],
  iTerm: ['/Applications/iTerm.app'],
  Ghostty: ['/Applications/Ghostty.app'],
}

export function detectTerminals(): TerminalApp[] {
  const home = os.homedir()
  return (Object.keys(TERMINAL_APP_PATHS) as TerminalApp[]).filter((app) =>
    [
      ...TERMINAL_APP_PATHS[app],
      `${home}/Applications/${app === 'iTerm' ? 'iTerm' : app}.app`,
    ].some((p) => fs.existsSync(p))
  )
}

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
  prompt: string
): { command: string; args: string[] } {
  const agentCall = AGENT_ARGV[tool].join(' ')
  if (terminal === 'Ghostty') {
    // Ghostty has no scripting interface for existing sessions — a new
    // window with -e running the agent directly is the supported invocation.
    // copilot -p exits when the run completes, so that window waits for a
    // keypress before closing and the user can read the output.
    return {
      command: 'open',
      args: [
        '-na',
        'Ghostty',
        '--args',
        `--working-directory=${repoPath}`,
        ...(tool === 'copilot' ? ['--wait-after-command=true'] : []),
        '-e',
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

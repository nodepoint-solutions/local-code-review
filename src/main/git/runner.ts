import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export class GitError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly code: number | null
  ) {
    super(message)
    this.name = 'GitError'
  }
}

export async function execGit(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      maxBuffer: 50 * 1024 * 1024,
    })
    return stdout
  } catch (err) {
    const e = err as Partial<{ message: string; stderr: string; code: number | null }>
    throw new GitError(
      `git ${args[0]} failed: ${e.message ?? String(err)}`,
      e.stderr ?? '',
      e.code ?? null
    )
  }
}

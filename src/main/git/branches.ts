import { execGit } from './runner'

export async function listBranches(repoPath: string): Promise<string[]> {
  const output = await execGit(repoPath, ['branch', '--format=%(refname:short)'])
  return output
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
}

export async function resolveSha(repoPath: string, ref: string): Promise<string> {
  const output = await execGit(repoPath, ['rev-parse', '--verify', ref])
  return output.trim()
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await execGit(dirPath, ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

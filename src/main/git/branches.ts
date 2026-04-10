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

export async function getRemoteOriginUrl(repoPath: string): Promise<string | null> {
  try {
    const output = await execGit(repoPath, ['remote', 'get-url', 'origin'])
    return output.trim() || null
  } catch {
    return null
  }
}

export function parseGithubRemote(url: string): { owner: string; repo: string } | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }
  // HTTPS: https://github.com/owner/repo[.git]
  const httpsMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
}

export async function isWorkingDirClean(repoPath: string): Promise<boolean> {
  const output = await execGit(repoPath, ['status', '--porcelain'])
  return output.trim() === ''
}

export async function isBranchPushed(repoPath: string, branch: string): Promise<boolean> {
  const output = await execGit(repoPath, ['ls-remote', '--heads', 'origin', branch])
  return output.trim() !== ''
}

export async function pushBranch(repoPath: string, branch: string): Promise<void> {
  await execGit(repoPath, ['push', 'origin', branch])
}

export async function fetchOrigin(repoPath: string): Promise<void> {
  try {
    await execGit(repoPath, ['fetch', 'origin'])
  } catch {
    // non-fatal — no network, no remote, etc.
  }
}

export async function isMergedIntoRemote(
  repoPath: string,
  compareSha: string,
  baseBranch: string,
): Promise<boolean> {
  try {
    await execGit(repoPath, ['merge-base', '--is-ancestor', compareSha, `origin/${baseBranch}`])
    return true
  } catch {
    return false
  }
}

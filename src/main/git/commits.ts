import { execGit } from './runner'
import { parseDiff } from './diff-parser'
import type { Commit, ParsedFile } from '../../shared/types'

/** Returns commits reachable from compareSha but not baseSha. */
export async function listCommits(repoPath: string, baseSha: string, compareSha: string): Promise<Commit[]> {
  const raw = await execGit(repoPath, [
    'log',
    '--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at',
    `${baseSha}..${compareSha}`,
  ])
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, authorName, authorEmail, ts] = line.split('\x00')
      return { hash, shortHash, subject, authorName, authorEmail, timestamp: parseInt(ts, 10) }
    })
}

/** Returns the number of commits reachable from toSha but not fromSha. */
export async function countCommitsBetween(repoPath: string, fromSha: string, toSha: string): Promise<number> {
  if (fromSha === toSha) return 0
  try {
    const raw = await execGit(repoPath, ['rev-list', '--count', `${fromSha}..${toSha}`])
    return parseInt(raw.trim(), 10) || 0
  } catch {
    return 0
  }
}

/** Returns the file diffs introduced by a single commit. */
export async function getCommitDiff(repoPath: string, hash: string): Promise<ParsedFile[]> {
  try {
    const raw = await execGit(repoPath, ['diff-tree', '--no-commit-id', '-p', '-r', '--unified=3', hash])
    return parseDiff(raw)
  } catch {
    // Fallback for merge commits / root commits where diff-tree gives nothing
    const raw = await execGit(repoPath, ['show', '--format=', '-p', '--unified=3', hash])
    return parseDiff(raw.replace(/^[^\n]*\n/, ''))
  }
}

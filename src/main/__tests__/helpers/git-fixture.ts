// src/main/__tests__/helpers/git-fixture.ts
//
// Real on-disk git repos for service-level tests: a main branch with one
// commit and a feature branch two commits ahead, mirroring the smallest PR
// the app can show.
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export function git(repoPath: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' })
}

export interface GitFixture {
  repoPath: string
  cleanup: () => void
}

export function makeGitRepo(): GitFixture {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-service-test-'))
  git(repoPath, 'init', '-q', '-b', 'main')
  git(repoPath, 'config', 'user.email', 'test@example.com')
  git(repoPath, 'config', 'user.name', 'Test User')

  fs.writeFileSync(path.join(repoPath, 'app.js'), 'console.log("v1")\n')
  git(repoPath, 'add', '-A')
  git(repoPath, 'commit', '-qm', 'chore: initial commit')

  git(repoPath, 'switch', '-qc', 'feature/change')
  fs.writeFileSync(path.join(repoPath, 'app.js'), 'console.log("v2")\n')
  git(repoPath, 'commit', '-qam', 'feat: change output')
  fs.writeFileSync(path.join(repoPath, 'extra.js'), 'module.exports = 1\n')
  git(repoPath, 'add', '-A')
  git(repoPath, 'commit', '-qm', 'feat: add extra module')
  git(repoPath, 'switch', '-q', 'main')

  return {
    repoPath,
    cleanup: () => fs.rmSync(repoPath, { recursive: true, force: true }),
  }
}

/** Adds one more commit to the feature branch, so pinned reviews go stale. */
export function advanceFeatureBranch(repoPath: string): void {
  git(repoPath, 'switch', '-q', 'feature/change')
  fs.appendFileSync(path.join(repoPath, 'extra.js'), '// moved on\n')
  git(repoPath, 'commit', '-qam', 'chore: move the branch forward')
  git(repoPath, 'switch', '-q', 'main')
}

export function shaOf(repoPath: string, ref: string): string {
  return git(repoPath, 'rev-parse', ref).trim()
}

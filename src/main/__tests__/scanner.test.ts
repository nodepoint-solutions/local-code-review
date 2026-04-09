import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import path from 'path'
import { scanForRepos } from '../git/scanner'

const execFileAsync = promisify(execFile)

async function gitInit(dir: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: dir })
}

describe('scanForRepos', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'scanner-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('finds a repo one level deep', async () => {
    const repoDir = path.join(tmpDir, 'my-repo')
    await mkdir(repoDir)
    await gitInit(repoDir)
    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(repoDir)
    expect(results[0].name).toBe('my-repo')
  })

  it('finds multiple repos at the same level', async () => {
    const repoA = path.join(tmpDir, 'repo-a')
    const repoB = path.join(tmpDir, 'repo-b')
    await mkdir(repoA)
    await mkdir(repoB)
    await gitInit(repoA)
    await gitInit(repoB)
    const results = await scanForRepos(tmpDir)
    const paths = results.map((r) => r.path).sort()
    expect(paths).toEqual([repoA, repoB].sort())
  })

  it('does not recurse into repo subdirectories', async () => {
    const repoDir = path.join(tmpDir, 'my-repo')
    const srcDir = path.join(repoDir, 'src')
    await mkdir(repoDir)
    await mkdir(srcDir)
    await gitInit(repoDir)
    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(repoDir)
  })

  it('finds repos nested in non-repo directories', async () => {
    const groupDir = path.join(tmpDir, 'company')
    const repoDir = path.join(groupDir, 'project')
    await mkdir(groupDir)
    await mkdir(repoDir)
    await gitInit(repoDir)
    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(repoDir)
  })

  it('returns empty array when no repos found', async () => {
    const results = await scanForRepos(tmpDir)
    expect(results).toHaveLength(0)
  })

  it('respects maxDepth', async () => {
    // repo is 3 dirs deep from tmpDir — reaches depth 4, which is > maxDepth 3
    const deep = path.join(tmpDir, 'a', 'b', 'c')
    await mkdir(deep, { recursive: true })
    await gitInit(deep)
    const shallow = await scanForRepos(tmpDir, 3)
    expect(shallow).toHaveLength(0)
    const deeper = await scanForRepos(tmpDir, 4)
    expect(deeper).toHaveLength(1)
  })

  it('returns empty array for non-existent base path', async () => {
    const results = await scanForRepos('/nonexistent/path/scanner-test-xyz')
    expect(results).toHaveLength(0)
  })
})

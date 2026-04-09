import { promises as fs } from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { DiscoveredRepo } from '../../shared/types'

const execFileAsync = promisify(execFile)

async function isInsideWorkTree(dirPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dirPath,
    })
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

export async function scanForRepos(
  basePath: string,
  maxDepth = 5
): Promise<DiscoveredRepo[]> {
  const results: DiscoveredRepo[] = []

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return

    if (await isInsideWorkTree(dirPath)) {
      results.push({ path: dirPath, name: path.basename(dirPath) })
      return
    }

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    const subdirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(dirPath, e.name))

    await Promise.all(subdirs.map((sub) => walk(sub, depth + 1)))
  }

  await walk(basePath, 1)
  return results
}

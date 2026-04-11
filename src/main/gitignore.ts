import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const execFileAsync = promisify(execFile)

async function getGlobalExcludesFile(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--global', 'core.excludesfile'])
    const configured = stdout.trim()
    if (configured) {
      return configured.startsWith('~')
        ? path.join(os.homedir(), configured.slice(1))
        : configured
    }
  } catch {
    // Not configured — fall through to default
  }
  return path.join(os.homedir(), '.gitignore_global')
}

export async function checkGlobalGitignore(): Promise<{ installed: boolean; filePath: string }> {
  const filePath = await getGlobalExcludesFile()
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n').map((l) => l.trim())
    const installed = lines.includes('.reviews') || lines.includes('.reviews/')
    return { installed, filePath }
  } catch {
    return { installed: false, filePath }
  }
}

export async function installGlobalGitignore(): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const filePath = await getGlobalExcludesFile()

    let content = ''
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      // File doesn't exist yet — start fresh
    }

    const lines = content.split('\n').map((l) => l.trim())
    if (!lines.includes('.reviews') && !lines.includes('.reviews/')) {
      const separator = content && !content.endsWith('\n') ? '\n' : ''
      await fs.writeFile(filePath, `${content}${separator}.reviews\n`, 'utf-8')
    }

    // Ensure git global config points to this file
    try {
      const { stdout } = await execFileAsync('git', ['config', '--global', 'core.excludesfile'])
      if (!stdout.trim()) {
        await execFileAsync('git', ['config', '--global', 'core.excludesfile', filePath])
      }
    } catch {
      await execFileAsync('git', ['config', '--global', 'core.excludesfile', filePath])
    }

    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

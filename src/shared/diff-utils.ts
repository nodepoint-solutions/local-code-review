import type { ParsedLine } from './types'

export interface ContextLineOutput {
  diffLineNumber: number
  type: 'added' | 'removed' | 'context'
  content: string
}

export function extractContext(
  fileLines: ParsedLine[],
  startLine: number,
  endLine: number
): ContextLineOutput[] {
  const codeLines = fileLines.filter((l) => l.type !== 'hunk-header')
  const startIdx = codeLines.findIndex((l) => l.diffLineNumber === startLine)
  const endIdx = codeLines.findIndex((l) => l.diffLineNumber === endLine)
  if (startIdx === -1 || endIdx === -1) return []
  const from = Math.max(0, startIdx - 3)
  const to = Math.min(codeLines.length - 1, endIdx + 3)
  return codeLines.slice(from, to + 1).map((l) => ({
    diffLineNumber: l.diffLineNumber,
    type: l.type as 'added' | 'removed' | 'context',
    content: l.content,
  }))
}

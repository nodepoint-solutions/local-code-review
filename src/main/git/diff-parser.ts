import type { ParsedFile, ParsedLine } from '../../shared/types'

export function parseDiff(raw: string): ParsedFile[] {
  if (!raw.trim()) return []

  const files: ParsedFile[] = []
  const fileBlocks = raw.split(/^diff --git /m).filter(Boolean)

  for (const block of fileBlocks) {
    const lines = block.split('\n')
    const headerLine = lines[0]
    const [aPath, bPath] = headerLine.trim().split(' ')
    const oldPath = aPath.replace(/^a\//, '')
    const newPath = bPath.replace(/^b\//, '')

    const isNew = block.includes('\nnew file mode')
    const isDeleted = block.includes('\ndeleted file mode')
    const isRenamed = oldPath !== newPath

    const parsedLines: ParsedLine[] = []
    let diffLineNumber = 0
    let oldLine = 0
    let newLine = 0
    let inHunk = false

    for (const rawLine of lines) {
      if (rawLine.startsWith('@@')) {
        inHunk = true
        const match = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match) {
          oldLine = parseInt(match[1], 10)
          newLine = parseInt(match[2], 10)
          if (isNew) oldLine = 0
          if (isDeleted) newLine = 0
        }
        diffLineNumber++
        parsedLines.push({
          diffLineNumber,
          type: 'hunk-header',
          content: rawLine,
          oldLineNumber: null,
          newLineNumber: null,
        })
        continue
      }

      if (!inHunk) continue

      if (
        rawLine.startsWith('index ') ||
        rawLine.startsWith('--- ') ||
        rawLine.startsWith('+++ ') ||
        rawLine.startsWith('Binary') ||
        rawLine.startsWith('new file') ||
        rawLine.startsWith('deleted file') ||
        rawLine.startsWith('rename ')
      ) {
        continue
      }

      if (rawLine.startsWith('+')) {
        diffLineNumber++
        parsedLines.push({ diffLineNumber, type: 'added', content: rawLine.slice(1), oldLineNumber: null, newLineNumber: newLine })
        newLine++
      } else if (rawLine.startsWith('-')) {
        diffLineNumber++
        parsedLines.push({ diffLineNumber, type: 'removed', content: rawLine.slice(1), oldLineNumber: oldLine, newLineNumber: null })
        oldLine++
      } else if (rawLine.startsWith(' ')) {
        diffLineNumber++
        parsedLines.push({ diffLineNumber, type: 'context', content: rawLine.slice(1), oldLineNumber: oldLine, newLineNumber: newLine })
        oldLine++
        newLine++
      }
    }

    files.push({ oldPath, newPath, isNew, isDeleted, isRenamed, lines: parsedLines })
  }

  return files
}

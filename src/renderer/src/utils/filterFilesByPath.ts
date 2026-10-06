import type { ParsedFile } from '../../../shared/types'

/** Keep the files whose path contains the query, in any letter case. An empty query keeps every file. */
export function filterFilesByPath(files: ParsedFile[], query: string): ParsedFile[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return files
  return files.filter((file) => file.newPath.toLowerCase().includes(needle))
}

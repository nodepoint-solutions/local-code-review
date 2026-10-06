import { describe, it, expect } from 'vitest'
import { filterFilesByPath } from '../utils/filterFilesByPath'
import type { ParsedFile } from '../../../shared/types'

function makeFile(newPath: string): ParsedFile {
  return {
    oldPath: newPath,
    newPath,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
    lines: [],
  }
}

const files = [
  makeFile('a/hello.txt'),
  makeFile('a/hi.txt'),
  makeFile('a/bye.txt'),
  makeFile('b/goodbye.txt'),
]

function paths(query: string, from: ParsedFile[] = files): string[] {
  return filterFilesByPath(from, query).map((f) => f.newPath)
}

describe('filterFilesByPath', () => {
  it('returns every file for an empty query', () => {
    expect(paths('')).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt', 'b/goodbye.txt'])
    expect(paths('   ')).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt', 'b/goodbye.txt'])
  })

  it('matches a partial path', () => {
    expect(paths('a/h')).toEqual(['a/hello.txt', 'a/hi.txt'])
    expect(paths('a/')).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt'])
    expect(paths('b/')).toEqual(['b/goodbye.txt'])
  })

  it('matches text anywhere in the path', () => {
    expect(paths('.txt')).toEqual(['a/hello.txt', 'a/hi.txt', 'a/bye.txt', 'b/goodbye.txt'])
    expect(paths('bye')).toEqual(['a/bye.txt', 'b/goodbye.txt'])
  })

  it('matches a folder at any depth', () => {
    expect(paths('/a/', [makeFile('x/a/hi.txt'), makeFile('x/b/hi.txt')])).toEqual(['x/a/hi.txt'])
  })

  it('ignores letter case', () => {
    expect(paths('A/H')).toEqual(['a/hello.txt', 'a/hi.txt'])
    expect(paths('readme', [makeFile('docs/README.md')])).toEqual(['docs/README.md'])
  })

  it('matches the path as shown, which has no leading slash', () => {
    expect(paths('/a/')).toEqual([])
  })

  it('returns no files when nothing matches', () => {
    expect(paths('c/')).toEqual([])
  })
})

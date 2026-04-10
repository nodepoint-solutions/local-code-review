import { describe, it, expect } from 'vitest'
import { parseGithubRemote } from '../../main/git/branches'

describe('parseGithubRemote', () => {
  it('parses SSH URL', () => {
    expect(parseGithubRemote('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS URL with .git suffix', () => {
    expect(parseGithubRemote('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS URL without .git suffix', () => {
    expect(parseGithubRemote('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('returns null for a non-GitHub remote', () => {
    expect(parseGithubRemote('https://gitlab.com/owner/repo.git')).toBeNull()
  })

  it('returns null for an arbitrary string', () => {
    expect(parseGithubRemote('not-a-url')).toBeNull()
  })
})

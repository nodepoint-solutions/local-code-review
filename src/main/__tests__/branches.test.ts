// src/main/__tests__/branches.test.ts
import { describe, it, expect } from 'vitest'
import { parseGithubRemote } from '../git/branches'

describe('parseGithubRemote', () => {
  it('parses SSH URL', () => {
    expect(parseGithubRemote('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS URL', () => {
    expect(parseGithubRemote('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS URL without .git suffix', () => {
    expect(parseGithubRemote('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTP URL', () => {
    expect(parseGithubRemote('http://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS URL with embedded credentials', () => {
    expect(parseGithubRemote('https://x-access-token:TOKEN@github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
  })

  it('returns null for invalid URLs', () => {
    expect(parseGithubRemote('https://gitlab.com/owner/repo.git')).toBeNull()
  })
})

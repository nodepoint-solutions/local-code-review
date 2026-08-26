// src/main/__tests__/pr-workflow.test.ts
import { describe, it, expect } from 'vitest'
import { PRWorkflow } from '../../shared/pr-workflow'
import type { PRFile, ReviewFile } from '../../shared/review-store'

function makePr(overrides: Partial<PRFile> = {}): PRFile {
  return {
    version: 1,
    id: 'pr-1',
    title: 'Test PR',
    description: null,
    base_branch: 'main',
    compare_branch: 'feature',
    status: 'open',
    assignee: null,
    assigned_at: null,
    merged_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as PRFile
}

function makeReview(status: ReviewFile['status']): ReviewFile {
  return {
    version: 1,
    id: '00000000-0000-4000-8000-000000000000',
    status,
    base_sha: 'a'.repeat(40),
    compare_sha: 'b'.repeat(40),
    created_at: new Date().toISOString(),
    submitted_at: status === 'in_progress' ? null : new Date().toISOString(),
    comments: [],
  } as ReviewFile
}

describe('PRWorkflow.allowsManualResolve', () => {
  it('allows resolving after submission with no assignee (reviewed)', () => {
    const wf = new PRWorkflow(makePr(), makeReview('submitted'))
    expect(wf.phase).toBe('reviewed')
    expect(wf.allowsManualResolve()).toBe(true)
  })

  it('allows resolving while an agent is assigned (in_fix)', () => {
    const wf = new PRWorkflow(makePr({ assignee: 'claude' }), makeReview('submitted'))
    expect(wf.phase).toBe('in_fix')
    expect(wf.allowsManualResolve()).toBe(true)
  })

  it('denies resolving while the review is still being written', () => {
    const wf = new PRWorkflow(makePr(), makeReview('in_progress'))
    expect(wf.allowsManualResolve()).toBe(false)
  })

  it('denies resolving before any review exists and after completion', () => {
    expect(new PRWorkflow(makePr(), null).allowsManualResolve()).toBe(false)
    expect(new PRWorkflow(makePr(), makeReview('complete')).allowsManualResolve()).toBe(false)
  })

  it('denies resolving on a closed PR', () => {
    const wf = new PRWorkflow(makePr({ status: 'closed' }), makeReview('submitted'))
    expect(wf.allowsManualResolve()).toBe(false)
  })
})

// src/shared/pr-workflow.ts
//
// Single source of truth for what actions are permitted at each stage of the
// PR review lifecycle.  Consumed by both the IPC layer (for hard enforcement)
// and the renderer (for UI gating), so the rules are never duplicated.
//
// Active-review selection is the store's responsibility — this class is a
// pure phase deriver and capability oracle.
//
// Workflow:
//   opened → reviewing → reviewed → in_fix → fix_complete
//                  ↑_____________________________|  (new review round)
//   Any state → closed  (user accepts / closes PR)

import type { PRFile, ReviewFile } from './review-store'

// ── Phases ────────────────────────────────────────────────────────────────────

export type WorkflowPhase =
  | 'awaiting_review'  // PR open, no review created yet
  | 'reviewing'        // in_progress review exists
  | 'reviewed'         // review submitted, no agent assigned
  | 'in_fix'           // review submitted, agent assigned
  | 'fix_complete'     // review complete (all comments resolved)
  | 'closed'           // PR closed

// ── State machine ─────────────────────────────────────────────────────────────

export class PRWorkflow {
  readonly phase: WorkflowPhase

  constructor(pr: PRFile, review: ReviewFile | null) {
    this.phase = PRWorkflow.derive(pr, review)
  }

  private static derive(pr: PRFile, review: ReviewFile | null): WorkflowPhase {
    if (pr.status === 'closed') return 'closed'
    if (review === null) return 'awaiting_review'
    if (review.status === 'in_progress') return 'reviewing'
    if (review.status === 'complete') return 'fix_complete'
    // review.status === 'submitted'
    return pr.assignee ? 'in_fix' : 'reviewed'
  }

  // ── Capability queries ────────────────────────────────────────────────────

  /** Inline diff comments can be added. */
  allowsComments(): boolean {
    return this.phase === 'reviewing'
  }

  /** The current in-progress review can be submitted. */
  allowsSubmit(): boolean {
    return this.phase === 'reviewing'
  }

  /** An agent can be assigned (or changed/cleared). */
  allowsAssignee(): boolean {
    return this.phase === 'reviewed' || this.phase === 'in_fix'
  }

  /** A new review round can be started. */
  allowsNewReview(): boolean {
    return this.phase === 'fix_complete'
  }

  /** Diff is read-only — no inline comment selection. */
  isReadOnly(): boolean {
    return !this.allowsComments()
  }

  // ── Error messages (shared copy) ──────────────────────────────────────────

  static commentDeniedReason(phase: WorkflowPhase): string {
    if (phase === 'reviewed' || phase === 'in_fix') {
      return 'The review has been submitted. Wait for the agent to resolve all comments before starting a new review.'
    }
    if (phase === 'fix_complete') {
      return 'This review round is complete. Start a new review to add more comments.'
    }
    if (phase === 'closed') {
      return 'This PR is closed.'
    }
    return 'Comments cannot be added in the current state.'
  }

  static newReviewDeniedReason(phase: WorkflowPhase): string {
    if (phase === 'reviewed' || phase === 'in_fix') {
      return 'A review is currently submitted and awaiting completion. Wait for all comments to be resolved before starting a new review.'
    }
    return 'A new review cannot be started in the current state.'
  }

  static assignDeniedReason(phase: WorkflowPhase): string {
    if (phase === 'reviewing' || phase === 'awaiting_review') {
      return 'Cannot assign until a review has been submitted.'
    }
    if (phase === 'fix_complete') {
      return 'The review is already complete. Start a new review first.'
    }
    if (phase === 'closed') {
      return 'This PR is closed.'
    }
    return 'Assignment is not permitted in the current state.'
  }
}

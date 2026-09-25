// src/mcp-server/tools.ts
import { execFileSync } from 'child_process'
import { ReviewStore, InvalidReviewFileError } from '../shared/review-store'
import { recordPendingRepo } from '../shared/agent-bridge'
import { listPrsWithState, prWithState, prWorkflow } from '../shared/pr-state'
import { PRWorkflow } from '../shared/pr-workflow'
import type { PRListItem } from '../shared/types'
import type { SocketClient } from './socket-client'

const store = new ReviewStore()

function isGitWorkTree(repoPath: string): boolean {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: repoPath,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return out.trim() === 'true'
  } catch {
    return false
  }
}

function branchExists(repoPath: string, branch: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${branch}^{commit}`], {
      cwd: repoPath,
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

// True when every commit on `branch` is already on `base`
function isContainedIn(repoPath: string, branch: string, base: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', branch, base], {
      cwd: repoPath,
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

// One open PR per compare branch, so an agent that runs create_pr again edits
// its PR rather than splitting the review across two.
function otherOpenPR(repoPath: string, compareBranch: string, exceptId?: string) {
  return store
    .listPRs(repoPath)
    .find((pr) => pr.status === 'open' && pr.compare_branch === compareBranch && pr.id !== exceptId)
}

function ok(data: unknown) {
  // `isError` is present (as undefined) so callers can read it off either
  // branch of callTool's result without a type guard.
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    isError: undefined,
  }
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

// snake_case keys rather than the app's camelCase, so the state reads like
// the PR file fields around it.
function stateView(item: PRListItem) {
  const { workflowPhase, openComments, ...pr } = item
  return { ...pr, workflow_phase: workflowPhase, open_comments: openComments }
}

// Claude Code / Claude Desktop identities own PRs as 'claude'; every other
// client (Copilot CLI, VS Code, Cursor, Windsurf) maps to 'copilot'.
function identityToAssignee(identity: string): 'claude' | 'copilot' {
  return identity.startsWith('Claude') ? 'claude' : 'copilot'
}

export function buildTools() {
  return [
    {
      name: 'list_prs',
      description:
        "List pull requests in a repository's .reviews/ directory, with each PR's workflow phase and open comment count. Filter by status and compare_branch to find the open PR for a branch.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
          status: {
            type: 'string',
            enum: ['open', 'closed'],
            description: 'Optional. Only PRs with this status.',
          },
          compare_branch: {
            type: 'string',
            description: 'Optional. Only PRs for this compare branch.',
          },
        },
        required: ['repo_path'],
      },
    },
    {
      name: 'get_pr',
      description:
        "Get a pull request's metadata, workflow phase, open comment count and review summary.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string', description: 'UUID of the PR' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
    {
      name: 'get_review',
      description:
        'Get the full content of a review including all comments and their resolution state.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
        },
        required: ['repo_path', 'pr_id', 'review_id'],
      },
    },
    {
      name: 'get_open_issues',
      description:
        'Get only open (unresolved) comments. Omit review_id to query the latest review.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string', description: 'Optional. Defaults to latest review.' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
    {
      name: 'mark_resolved',
      description:
        'Mark a review comment as resolved. A resolution_comment explaining what was done is required.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
          comment_id: { type: 'string', description: 'e.g. "RVW-001"' },
          resolution_comment: {
            type: 'string',
            description: 'Required. Explain what fix was applied.',
          },
        },
        required: ['repo_path', 'pr_id', 'review_id', 'comment_id', 'resolution_comment'],
      },
    },
    {
      name: 'mark_wont_fix',
      description:
        "Mark a review comment as won't fix. A resolution_comment explaining why is required.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
          comment_id: { type: 'string', description: 'e.g. "RVW-001"' },
          resolution_comment: {
            type: 'string',
            description: 'Required. Explain why this is not being fixed.',
          },
        },
        required: ['repo_path', 'pr_id', 'review_id', 'comment_id', 'resolution_comment'],
      },
    },
    {
      name: 'create_pr',
      description:
        'Create a pull request in Local Code Review for two local branches. The repository is added to the app on the first PR, so it needs no setup. You become the PR assignee: after each review round is submitted you will be asked to fix the comments. Refused when an open PR already exists for compare_branch; the error gives its pr_id.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
          title: { type: 'string', description: 'Imperative summary of the change' },
          description: {
            type: 'string',
            description: 'Optional. What changed and why, derived from the branch commits.',
          },
          base_branch: { type: 'string', description: 'Branch to merge into' },
          compare_branch: { type: 'string', description: 'Branch with the changes' },
        },
        required: ['repo_path', 'title', 'base_branch', 'compare_branch'],
      },
    },
    {
      name: 'update_pr',
      description:
        "Change a pull request's title, description or base branch. Give at least one. An empty description clears it. The base branch cannot change while a review is active.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
          pr_id: { type: 'string', description: 'UUID of the PR' },
          title: { type: 'string', description: 'Optional. Imperative summary of the change' },
          description: {
            type: 'string',
            description: 'Optional. What changed and why. An empty string clears it.',
          },
          base_branch: { type: 'string', description: 'Optional. Branch to merge into' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
    {
      name: 'close_pr',
      description:
        'Close a pull request in any phase. Its reviews and comments are kept, and reopen_pr undoes the close.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
          pr_id: { type: 'string', description: 'UUID of the PR' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
    {
      name: 'reopen_pr',
      description:
        'Reopen a closed pull request, for example to undo close_pr. A merged PR cannot be reopened.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
          pr_id: { type: 'string', description: 'UUID of the PR' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
    {
      name: 'complete_assignment',
      description:
        'Call this when you have finished addressing all open review issues. Signals to the reviewer that your fix session has ended.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
          pr_id: { type: 'string', description: 'UUID of the PR' },
        },
        required: ['repo_path', 'pr_id'],
      },
    },
  ]
}

export async function callTool(
  name: string,
  args: Record<string, string>,
  socketClient: SocketClient,
  resolvedBy: string
) {
  try {
    if (args.pr_id !== undefined && !store.hasPR(args.repo_path, args.pr_id)) {
      return err(`PR not found: ${args.pr_id}`)
    }
    switch (name) {
      case 'list_prs': {
        const prs = listPrsWithState(store, args.repo_path)
          .filter((pr) => !args.status || pr.status === args.status)
          .filter((pr) => !args.compare_branch || pr.compare_branch === args.compare_branch)
        return ok(prs.map(stateView))
      }

      case 'get_pr': {
        const { workflow_phase, open_comments, ...pr } = stateView(
          prWithState(store, args.repo_path, args.pr_id)
        )
        const reviews = store.listReviews(args.repo_path, args.pr_id)
        return ok({
          pr,
          workflow_phase,
          open_comments,
          review_count: reviews.length,
          reviews: reviews.map((r) => ({
            id: r.id,
            status: r.status,
            created_at: r.created_at,
            comment_count: r.comments.length,
          })),
        })
      }

      case 'get_review': {
        const review = store.getReview(args.repo_path, args.pr_id, args.review_id)
        return ok(review)
      }

      case 'get_open_issues': {
        let reviewId = args.review_id
        if (!reviewId) {
          const reviews = store.listReviews(args.repo_path, args.pr_id)
          if (reviews.length === 0) return ok([])
          reviewId = reviews[0].id
        }
        const review = store.getReview(args.repo_path, args.pr_id, reviewId)
        const open = review.comments.filter((c) => c.status === 'open' && !c.is_stale)
        return ok({ review_id: reviewId, open_issues: open })
      }

      case 'mark_resolved': {
        if (!args.resolution_comment?.trim()) {
          return err('resolution_comment is required and cannot be empty')
        }
        const updated = store.resolveComment(
          args.repo_path,
          args.pr_id,
          args.review_id,
          args.comment_id,
          'resolved',
          {
            comment: args.resolution_comment,
            resolved_by: resolvedBy,
            resolved_at: new Date().toISOString(),
          }
        )
        socketClient.emit({
          event: 'review:updated',
          repoPath: args.repo_path,
          prId: args.pr_id,
          reviewId: args.review_id,
        })
        return ok({
          success: true,
          comment: updated.comments.find((c) => c.id === args.comment_id),
        })
      }

      case 'mark_wont_fix': {
        if (!args.resolution_comment?.trim()) {
          return err('resolution_comment is required and cannot be empty')
        }
        const updated = store.resolveComment(
          args.repo_path,
          args.pr_id,
          args.review_id,
          args.comment_id,
          'wont_fix',
          {
            comment: args.resolution_comment,
            resolved_by: resolvedBy,
            resolved_at: new Date().toISOString(),
          }
        )
        socketClient.emit({
          event: 'review:updated',
          repoPath: args.repo_path,
          prId: args.pr_id,
          reviewId: args.review_id,
        })
        return ok({
          success: true,
          comment: updated.comments.find((c) => c.id === args.comment_id),
        })
      }

      case 'create_pr': {
        if (!isGitWorkTree(args.repo_path)) {
          return err(`Not a git repository: ${args.repo_path}`)
        }
        if (args.base_branch === args.compare_branch) {
          return err('base_branch and compare_branch must differ')
        }
        for (const branch of [args.base_branch, args.compare_branch]) {
          if (!branchExists(args.repo_path, branch)) return err(`Branch not found: ${branch}`)
        }
        const existing = otherOpenPR(args.repo_path, args.compare_branch)
        if (existing) {
          return err(
            `An open PR already exists for ${args.compare_branch}: pr_id ${existing.id}. Call update_pr to change its title, description or base branch.`
          )
        }
        const assignee = identityToAssignee(resolvedBy)
        // Writing the PR creates the repository's .reviews directory, which
        // is the file-side half of being managed. The event and the handoff
        // file give the app the other half, so the PR shows up whether or not
        // the app was running when the agent called.
        const pr = store.createPR(args.repo_path, {
          title: args.title,
          description: args.description ?? null,
          base_branch: args.base_branch,
          compare_branch: args.compare_branch,
          assignee,
        })
        recordPendingRepo(args.repo_path)
        socketClient.emit({ event: 'repo:registered', repoPath: args.repo_path })
        socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: pr.id })
        return ok({ success: true, pr_id: pr.id, assignee })
      }

      case 'update_pr': {
        const { title, description, base_branch } = args
        if (title === undefined && description === undefined && base_branch === undefined) {
          return err('Give at least one of title, description or base_branch')
        }
        // Every field is checked before the write, so a refused call leaves
        // the PR exactly as it was.
        const pr = store.getPR(args.repo_path, args.pr_id)
        const changes: { title?: string; description?: string | null; base_branch?: string } = {}
        if (title !== undefined) {
          if (!title.trim()) return err('title cannot be empty')
          changes.title = title
        }
        if (description !== undefined) {
          changes.description = description.trim() ? description : null
        }
        if (base_branch !== undefined) {
          if (base_branch === pr.compare_branch) {
            return err('base_branch and compare_branch must differ')
          }
          if (pr.merged_at) {
            return err(`PR ${pr.id} is merged. The base branch of a merged PR cannot change.`)
          }
          if (!branchExists(args.repo_path, base_branch)) {
            return err(`Branch not found: ${base_branch}`)
          }
          // The app marks a PR merged once origin's base contains the compare
          // branch, and a merged PR cannot be reopened. Checking both the local
          // and the origin base stops a base change that would end the PR.
          const remoteBase = `origin/${base_branch}`
          const containingBase = [base_branch, remoteBase].find(
            (ref) =>
              branchExists(args.repo_path, ref) &&
              isContainedIn(args.repo_path, pr.compare_branch, ref)
          )
          if (containingBase) {
            return err(
              `${containingBase} already contains ${pr.compare_branch}, so the PR would have no changes and the app would mark it merged.`
            )
          }
          const workflow = prWorkflow(store, args.repo_path, args.pr_id)
          if (!workflow.allowsBaseChange()) {
            return err(PRWorkflow.baseChangeDeniedReason(workflow.phase))
          }
          changes.base_branch = base_branch
        }
        const updated = store.updatePR(args.repo_path, args.pr_id, changes)
        socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: args.pr_id })
        return ok(updated)
      }

      case 'close_pr': {
        const pr = store.getPR(args.repo_path, args.pr_id)
        if (pr.status === 'open') {
          store.updatePRStatus(args.repo_path, args.pr_id, 'closed')
          socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: args.pr_id })
        }
        return ok({
          success: true,
          pr: store.getPR(args.repo_path, args.pr_id),
          message: pr.merged_at
            ? 'PR is merged. A merged PR cannot be reopened.'
            : 'PR closed. Call reopen_pr to undo.',
        })
      }

      case 'reopen_pr': {
        const pr = store.getPR(args.repo_path, args.pr_id)
        // The app closes a merged PR again on its next refresh, so a reopen
        // would not last.
        if (pr.merged_at) {
          return err(`PR ${pr.id} is merged. A merged PR cannot be reopened.`)
        }
        const other = otherOpenPR(args.repo_path, pr.compare_branch, pr.id)
        if (pr.status === 'closed' && other) {
          return err(
            `An open PR already exists for ${pr.compare_branch}: pr_id ${other.id}. Close it first, or call update_pr on it.`
          )
        }
        if (pr.status === 'closed') {
          store.updatePRStatus(args.repo_path, args.pr_id, 'open')
          socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: args.pr_id })
        }
        return ok({
          success: true,
          pr: store.getPR(args.repo_path, args.pr_id),
          message: 'PR open.',
        })
      }

      case 'complete_assignment': {
        // Ends the fix session rather than removing the assignee — the
        // assignee is a stable property of the PR. If open comments remain,
        // the PR returns to "reviewed" so the fix can be restarted.
        const reviews = store.listReviews(args.repo_path, args.pr_id)
        const submitted = reviews.find((r) => r.status === 'submitted')
        if (submitted) {
          store.clearFixStarted(args.repo_path, args.pr_id, submitted.id)
        }
        socketClient.emit({ event: 'pr:updated', repoPath: args.repo_path, prId: args.pr_id })
        return ok({
          success: true,
          message: 'Assignment complete. The reviewer can see the work is done.',
        })
      }

      default:
        return err(`Unknown tool: ${name}`)
    }
  } catch (e) {
    if (e instanceof InvalidReviewFileError) return err(e.message)
    return err((e as Error).message)
  }
}

// src/mcp-server/tools.ts
import { execFileSync } from 'child_process'
import { ReviewStore, InvalidReviewFileError } from '../shared/review-store'
import { recordPendingRepo } from '../shared/agent-bridge'
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

// Claude Code / Claude Desktop identities own PRs as 'claude'; every other
// client (Copilot CLI, VS Code, Cursor, Windsurf) maps to 'copilot'.
function identityToAssignee(identity: string): 'claude' | 'copilot' {
  return identity.startsWith('Claude') ? 'claude' : 'copilot'
}

export function buildTools() {
  return [
    {
      name: 'list_prs',
      description: "List all pull requests in a repository's .reviews/ directory.",
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string', description: 'Absolute path to the repository' },
        },
        required: ['repo_path'],
      },
    },
    {
      name: 'get_pr',
      description: "Get a pull request's metadata and review summary.",
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
        'Create a pull request in Local Code Review for two local branches. The repository is added to the app on the first PR, so it needs no setup. You become the PR assignee: after each review round is submitted you will be asked to fix the comments.',
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
    switch (name) {
      case 'list_prs': {
        const prs = store.listPRs(args.repo_path)
        return ok(prs)
      }

      case 'get_pr': {
        const pr = store.getPR(args.repo_path, args.pr_id)
        const reviews = store.listReviews(args.repo_path, args.pr_id)
        return ok({
          pr,
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
        for (const branch of [args.base_branch, args.compare_branch]) {
          try {
            execFileSync('git', ['rev-parse', '--verify', `${branch}^{commit}`], {
              cwd: args.repo_path,
              stdio: 'pipe',
            })
          } catch {
            return err(`Branch not found: ${branch}`)
          }
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

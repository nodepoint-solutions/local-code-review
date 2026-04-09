// src/mcp-server/tools.ts
import { ReviewStore, InvalidReviewFileError } from '../shared/review-store'
import type { SocketClient } from './socket-client'

const store = new ReviewStore()

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

export function buildTools() {
  return [
    {
      name: 'list_prs',
      description: 'List all pull requests in a repository\'s .reviews/ directory.',
      inputSchema: {
        type: 'object' as const,
        properties: { repo_path: { type: 'string', description: 'Absolute path to the repository' } },
        required: ['repo_path'],
      },
    },
    {
      name: 'get_pr',
      description: 'Get a pull request\'s metadata and review summary.',
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
      description: 'Get the full content of a review including all comments and their resolution state.',
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
      description: 'Get only open (unresolved) comments. Omit review_id to query the latest review.',
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
      description: 'Mark a review comment as resolved. A resolution_comment explaining what was done is required.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
          comment_id: { type: 'string', description: 'e.g. "RVW-001"' },
          resolution_comment: { type: 'string', description: 'Required. Explain what fix was applied.' },
        },
        required: ['repo_path', 'pr_id', 'review_id', 'comment_id', 'resolution_comment'],
      },
    },
    {
      name: 'mark_wont_fix',
      description: 'Mark a review comment as won\'t fix. A resolution_comment explaining why is required.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          repo_path: { type: 'string' },
          pr_id: { type: 'string' },
          review_id: { type: 'string' },
          comment_id: { type: 'string', description: 'e.g. "RVW-001"' },
          resolution_comment: { type: 'string', description: 'Required. Explain why this is not being fixed.' },
        },
        required: ['repo_path', 'pr_id', 'review_id', 'comment_id', 'resolution_comment'],
      },
    },
  ]
}

export async function callTool(
  name: string,
  args: Record<string, string>,
  socketClient: SocketClient,
  resolvedBy: string,
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
        return ok({ pr, review_count: reviews.length, reviews: reviews.map((r) => ({ id: r.id, status: r.status, created_at: r.created_at, comment_count: r.comments.length })) })
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
          args.repo_path, args.pr_id, args.review_id, args.comment_id,
          'resolved',
          { comment: args.resolution_comment, resolved_by: resolvedBy, resolved_at: new Date().toISOString() },
        )
        socketClient.emit({ event: 'review:updated', repoPath: args.repo_path, prId: args.pr_id, reviewId: args.review_id })
        return ok({ success: true, comment: updated.comments.find((c) => c.id === args.comment_id) })
      }

      case 'mark_wont_fix': {
        if (!args.resolution_comment?.trim()) {
          return err('resolution_comment is required and cannot be empty')
        }
        const updated = store.resolveComment(
          args.repo_path, args.pr_id, args.review_id, args.comment_id,
          'wont_fix',
          { comment: args.resolution_comment, resolved_by: resolvedBy, resolved_at: new Date().toISOString() },
        )
        socketClient.emit({ event: 'review:updated', repoPath: args.repo_path, prId: args.pr_id, reviewId: args.review_id })
        return ok({ success: true, comment: updated.comments.find((c) => c.id === args.comment_id) })
      }

      default:
        return err(`Unknown tool: ${name}`)
    }
  } catch (e) {
    if (e instanceof InvalidReviewFileError) return err(e.message)
    return err((e as Error).message)
  }
}

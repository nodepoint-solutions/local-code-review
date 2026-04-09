// src/shared/review-store/schema.ts
import { z } from 'zod'

export const ContextLineSchema = z.object({
  line: z.number().int(),
  type: z.enum(['added', 'removed', 'context']),
  content: z.string(),
})

export const ResolutionSchema = z.object({
  comment: z.string().min(1),
  resolved_by: z.string(),
  resolved_at: z.string(),
})

export const ReviewCommentSchema = z.object({
  id: z.string(),           // "RVW-001" format
  file: z.string(),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  side: z.enum(['left', 'right']),
  body: z.string(),
  context: z.array(ContextLineSchema),
  is_stale: z.boolean(),
  status: z.enum(['open', 'resolved', 'wont_fix']),
  resolution: ResolutionSchema.nullable(),
  created_at: z.string(),
})

export const ReviewFileSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  status: z.enum(['in_progress', 'submitted', 'complete']),
  base_sha: z.string(),
  compare_sha: z.string(),
  created_at: z.string(),
  submitted_at: z.string().nullable(),
  comments: z.array(ReviewCommentSchema),
})

export const PRFileSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  base_branch: z.string(),
  compare_branch: z.string(),
  status: z.enum(['open', 'closed']),
  assignee: z.enum(['claude', 'vscode']).nullable().optional().default(null),
  assigned_at: z.string().nullable().optional().default(null),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ContextLineEntry = z.infer<typeof ContextLineSchema>
export type Resolution = z.infer<typeof ResolutionSchema>
export type ReviewComment = z.infer<typeof ReviewCommentSchema>
export type ReviewFile = z.infer<typeof ReviewFileSchema>
export type PRFile = z.infer<typeof PRFileSchema>

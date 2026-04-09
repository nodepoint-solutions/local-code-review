// src/shared/review-store/schema.ts
import { z } from 'zod';
export var ContextLineSchema = z.object({
    line: z.number().int(),
    type: z.enum(['added', 'removed', 'context']),
    content: z.string(),
});
export var ResolutionSchema = z.object({
    comment: z.string().min(1),
    resolved_by: z.string(),
    resolved_at: z.string(),
});
export var ReviewCommentSchema = z.object({
    id: z.string(), // "RVW-001" format
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
});
export var ReviewFileSchema = z.object({
    version: z.literal(1),
    id: z.string().uuid(),
    status: z.enum(['in_progress', 'submitted']),
    base_sha: z.string(),
    compare_sha: z.string(),
    created_at: z.string(),
    submitted_at: z.string().nullable(),
    comments: z.array(ReviewCommentSchema),
});
export var PRFileSchema = z.object({
    version: z.literal(1),
    id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().nullable(),
    base_branch: z.string(),
    compare_branch: z.string(),
    status: z.enum(['open', 'closed']),
    created_at: z.string(),
    updated_at: z.string(),
});

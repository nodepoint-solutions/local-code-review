import { z } from 'zod';
export declare const ContextLineSchema: z.ZodObject<{
    line: z.ZodNumber;
    type: z.ZodEnum<{
        added: "added";
        removed: "removed";
        context: "context";
    }>;
    content: z.ZodString;
}, z.core.$strip>;
export declare const ResolutionSchema: z.ZodObject<{
    comment: z.ZodString;
    resolved_by: z.ZodString;
    resolved_at: z.ZodString;
}, z.core.$strip>;
export declare const ReviewCommentSchema: z.ZodObject<{
    id: z.ZodString;
    file: z.ZodString;
    start_line: z.ZodNumber;
    end_line: z.ZodNumber;
    side: z.ZodEnum<{
        left: "left";
        right: "right";
    }>;
    body: z.ZodString;
    context: z.ZodArray<z.ZodObject<{
        line: z.ZodNumber;
        type: z.ZodEnum<{
            added: "added";
            removed: "removed";
            context: "context";
        }>;
        content: z.ZodString;
    }, z.core.$strip>>;
    is_stale: z.ZodBoolean;
    status: z.ZodEnum<{
        open: "open";
        resolved: "resolved";
        wont_fix: "wont_fix";
    }>;
    resolution: z.ZodNullable<z.ZodObject<{
        comment: z.ZodString;
        resolved_by: z.ZodString;
        resolved_at: z.ZodString;
    }, z.core.$strip>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export declare const ReviewFileSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    id: z.ZodString;
    status: z.ZodEnum<{
        in_progress: "in_progress";
        submitted: "submitted";
    }>;
    base_sha: z.ZodString;
    compare_sha: z.ZodString;
    created_at: z.ZodString;
    submitted_at: z.ZodNullable<z.ZodString>;
    comments: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        file: z.ZodString;
        start_line: z.ZodNumber;
        end_line: z.ZodNumber;
        side: z.ZodEnum<{
            left: "left";
            right: "right";
        }>;
        body: z.ZodString;
        context: z.ZodArray<z.ZodObject<{
            line: z.ZodNumber;
            type: z.ZodEnum<{
                added: "added";
                removed: "removed";
                context: "context";
            }>;
            content: z.ZodString;
        }, z.core.$strip>>;
        is_stale: z.ZodBoolean;
        status: z.ZodEnum<{
            open: "open";
            resolved: "resolved";
            wont_fix: "wont_fix";
        }>;
        resolution: z.ZodNullable<z.ZodObject<{
            comment: z.ZodString;
            resolved_by: z.ZodString;
            resolved_at: z.ZodString;
        }, z.core.$strip>>;
        created_at: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PRFileSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    base_branch: z.ZodString;
    compare_branch: z.ZodString;
    status: z.ZodEnum<{
        open: "open";
        closed: "closed";
    }>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type ContextLineEntry = z.infer<typeof ContextLineSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export type ReviewFile = z.infer<typeof ReviewFileSchema>;
export type PRFile = z.infer<typeof PRFileSchema>;

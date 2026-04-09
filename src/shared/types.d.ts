export type { PRFile, ReviewFile, ReviewComment, Resolution, ContextLineEntry } from './review-store';
export interface Repository {
    id: string;
    path: string;
    name: string;
    created_at: string;
    last_visited_at: string | null;
}
export interface RepositoryWithMeta extends Repository {
    pr_count: number;
}
export interface DiscoveredRepo {
    path: string;
    name: string;
}
export type DiffLineType = 'added' | 'removed' | 'context' | 'hunk-header';
export interface ParsedLine {
    diffLineNumber: number;
    type: DiffLineType;
    content: string;
    oldLineNumber: number | null;
    newLineNumber: number | null;
}
export interface ParsedFile {
    oldPath: string;
    newPath: string;
    isNew: boolean;
    isDeleted: boolean;
    isRenamed: boolean;
    lines: ParsedLine[];
}
export interface CreatePrPayload {
    repoPath: string;
    title: string;
    description: string | null;
    baseBranch: string;
    compareBranch: string;
}
export interface AddCommentPayload {
    repoPath: string;
    prId: string;
    reviewId: string;
    file: string;
    startLine: number;
    endLine: number;
    side: 'left' | 'right';
    body: string;
    context: Array<{
        line: number;
        type: 'added' | 'removed' | 'context';
        content: string;
    }>;
}
import type { PRFile, ReviewFile } from './review-store';
export interface PrDetail {
    pr: PRFile;
    diff: ParsedFile[];
    review: ReviewFile | null;
    isStale: boolean;
}
export interface Commit {
    hash: string;
    shortHash: string;
    subject: string;
    authorName: string;
    authorEmail: string;
    timestamp: number;
}
export interface IntegrationStatus {
    id: 'claudeCode' | 'claudeDesktop' | 'vscode' | 'cursor' | 'windsurf';
    name: string;
    detected: boolean;
    installed: boolean;
}

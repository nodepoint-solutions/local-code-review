import type { PRFile, ReviewFile, Resolution, ContextLineEntry } from './schema';
export { InvalidReviewFileError } from './serializer';
export type { PRFile, ReviewFile, ReviewComment, Resolution, ContextLineEntry } from './schema';
export interface CreatePRArgs {
    title: string;
    description: string | null;
    base_branch: string;
    compare_branch: string;
}
export interface CreateReviewArgs {
    base_sha: string;
    compare_sha: string;
}
export interface AddCommentArgs {
    file: string;
    start_line: number;
    end_line: number;
    side: 'left' | 'right';
    body: string;
    context: ContextLineEntry[];
}
export interface LineRange {
    startLine: number;
    endLine: number;
}
export declare class ReviewStore {
    listPRs(repoPath: string): PRFile[];
    createPR(repoPath: string, args: CreatePRArgs): PRFile;
    getPR(repoPath: string, prId: string): PRFile;
    updatePRStatus(repoPath: string, prId: string, status: 'open' | 'closed'): PRFile;
    listReviews(repoPath: string, prId: string): ReviewFile[];
    createReview(repoPath: string, prId: string, args: CreateReviewArgs): ReviewFile;
    getReview(repoPath: string, prId: string, reviewId: string): ReviewFile;
    getOrCreateInProgressReview(repoPath: string, prId: string, args: CreateReviewArgs): ReviewFile;
    submitReview(repoPath: string, prId: string, reviewId: string): ReviewFile;
    addComment(repoPath: string, prId: string, reviewId: string, args: AddCommentArgs): ReviewFile;
    resolveComment(repoPath: string, prId: string, reviewId: string, commentId: string, status: 'resolved' | 'wont_fix', resolution: Resolution): ReviewFile;
    markStale(repoPath: string, prId: string, reviewId: string, filePath: string, staleRanges: LineRange[]): void;
}

import type { PRFile, ReviewFile } from './schema';
export declare class InvalidReviewFileError extends Error {
    constructor(filePath: string, cause: unknown);
}
export declare function prDir(repoPath: string, prId: string): string;
export declare function reviewsDir(repoPath: string, prId: string): string;
export declare function readPR(repoPath: string, prId: string): PRFile;
export declare function writePR(repoPath: string, pr: PRFile): void;
export declare function readReview(repoPath: string, prId: string, reviewId: string): ReviewFile;
export declare function writeReview(repoPath: string, prId: string, review: ReviewFile): void;
export declare function listPRIds(repoPath: string): string[];
export declare function listReviewIds(repoPath: string, prId: string): string[];

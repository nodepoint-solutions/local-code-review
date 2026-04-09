var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
// src/shared/review-store/index.ts
import { v4 as uuidv4 } from 'uuid';
import { readPR, writePR, readReview, writeReview, listPRIds, listReviewIds, } from './serializer';
export { InvalidReviewFileError } from './serializer';
var ReviewStore = /** @class */ (function () {
    function ReviewStore() {
    }
    // ── PRs ──────────────────────────────────────────────────────────────────
    ReviewStore.prototype.listPRs = function (repoPath) {
        return listPRIds(repoPath)
            .flatMap(function (prId) {
            try {
                return [readPR(repoPath, prId)];
            }
            catch (_a) {
                return [];
            }
        })
            .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
    };
    ReviewStore.prototype.createPR = function (repoPath, args) {
        var now = new Date().toISOString();
        var pr = {
            version: 1,
            id: uuidv4(),
            title: args.title,
            description: args.description,
            base_branch: args.base_branch,
            compare_branch: args.compare_branch,
            status: 'open',
            created_at: now,
            updated_at: now,
        };
        writePR(repoPath, pr);
        return pr;
    };
    ReviewStore.prototype.getPR = function (repoPath, prId) {
        return readPR(repoPath, prId);
    };
    ReviewStore.prototype.updatePRStatus = function (repoPath, prId, status) {
        var pr = readPR(repoPath, prId);
        var now = new Date().toISOString();
        var updated_at = now > pr.updated_at ? now : new Date(new Date(pr.updated_at).getTime() + 1).toISOString();
        var updated = __assign(__assign({}, pr), { status: status, updated_at: updated_at });
        writePR(repoPath, updated);
        return updated;
    };
    // ── Reviews ───────────────────────────────────────────────────────────────
    ReviewStore.prototype.listReviews = function (repoPath, prId) {
        return listReviewIds(repoPath, prId)
            .flatMap(function (reviewId) {
            try {
                return [readReview(repoPath, prId, reviewId)];
            }
            catch (_a) {
                return [];
            }
        })
            .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
    };
    ReviewStore.prototype.createReview = function (repoPath, prId, args) {
        var review = {
            version: 1,
            id: uuidv4(),
            status: 'in_progress',
            base_sha: args.base_sha,
            compare_sha: args.compare_sha,
            created_at: new Date().toISOString(),
            submitted_at: null,
            comments: [],
        };
        writeReview(repoPath, prId, review);
        return review;
    };
    ReviewStore.prototype.getReview = function (repoPath, prId, reviewId) {
        return readReview(repoPath, prId, reviewId);
    };
    ReviewStore.prototype.getOrCreateInProgressReview = function (repoPath, prId, args) {
        var existing = this.listReviews(repoPath, prId).find(function (r) { return r.status === 'in_progress'; });
        if (existing)
            return existing;
        return this.createReview(repoPath, prId, args);
    };
    ReviewStore.prototype.submitReview = function (repoPath, prId, reviewId) {
        var review = readReview(repoPath, prId, reviewId);
        var updated = __assign(__assign({}, review), { status: 'submitted', submitted_at: new Date().toISOString() });
        writeReview(repoPath, prId, updated);
        return updated;
    };
    // ── Comments ──────────────────────────────────────────────────────────────
    ReviewStore.prototype.addComment = function (repoPath, prId, reviewId, args) {
        var review = readReview(repoPath, prId, reviewId);
        var nextNum = review.comments.length + 1;
        var comment = {
            id: "RVW-".concat(String(nextNum).padStart(3, '0')),
            file: args.file,
            start_line: args.start_line,
            end_line: args.end_line,
            side: args.side,
            body: args.body,
            context: args.context,
            is_stale: false,
            status: 'open',
            resolution: null,
            created_at: new Date().toISOString(),
        };
        var updated = __assign(__assign({}, review), { comments: __spreadArray(__spreadArray([], review.comments, true), [comment], false) });
        writeReview(repoPath, prId, updated);
        return updated;
    };
    ReviewStore.prototype.resolveComment = function (repoPath, prId, reviewId, commentId, status, resolution) {
        var review = readReview(repoPath, prId, reviewId);
        var updated = __assign(__assign({}, review), { comments: review.comments.map(function (c) {
                return c.id === commentId ? __assign(__assign({}, c), { status: status, resolution: resolution }) : c;
            }) });
        writeReview(repoPath, prId, updated);
        return updated;
    };
    ReviewStore.prototype.markStale = function (repoPath, prId, reviewId, filePath, staleRanges) {
        var review = readReview(repoPath, prId, reviewId);
        var updated = __assign(__assign({}, review), { comments: review.comments.map(function (c) {
                if (c.file !== filePath)
                    return c;
                var isStale = staleRanges.some(function (r) { return c.start_line >= r.startLine && c.end_line <= r.endLine; });
                return isStale ? __assign(__assign({}, c), { is_stale: true }) : c;
            }) });
        writeReview(repoPath, prId, updated);
    };
    return ReviewStore;
}());
export { ReviewStore };

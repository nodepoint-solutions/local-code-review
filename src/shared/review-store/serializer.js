var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
// src/shared/review-store/serializer.ts
import fs from 'fs';
import path from 'path';
import { PRFileSchema, ReviewFileSchema } from './schema';
var InvalidReviewFileError = /** @class */ (function (_super) {
    __extends(InvalidReviewFileError, _super);
    function InvalidReviewFileError(filePath, cause) {
        var _this = _super.call(this, "Invalid review file at ".concat(filePath, ": ").concat(String(cause))) || this;
        _this.name = 'InvalidReviewFileError';
        return _this;
    }
    return InvalidReviewFileError;
}(Error));
export { InvalidReviewFileError };
function atomicWrite(filePath, content) {
    var tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
}
function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}
export function prDir(repoPath, prId) {
    return path.join(repoPath, '.reviews', prId);
}
export function reviewsDir(repoPath, prId) {
    return path.join(prDir(repoPath, prId), 'reviews');
}
export function readPR(repoPath, prId) {
    var filePath = path.join(prDir(repoPath, prId), 'index.json');
    try {
        var raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return PRFileSchema.parse(raw);
    }
    catch (err) {
        throw new InvalidReviewFileError(filePath, err);
    }
}
export function writePR(repoPath, pr) {
    var dir = prDir(repoPath, pr.id);
    ensureDir(path.join(dir, 'reviews'));
    atomicWrite(path.join(dir, 'index.json'), JSON.stringify(pr, null, 2));
}
export function readReview(repoPath, prId, reviewId) {
    var filePath = path.join(reviewsDir(repoPath, prId), "".concat(reviewId, ".json"));
    try {
        var raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return ReviewFileSchema.parse(raw);
    }
    catch (err) {
        throw new InvalidReviewFileError(filePath, err);
    }
}
export function writeReview(repoPath, prId, review) {
    var dir = reviewsDir(repoPath, prId);
    ensureDir(dir);
    atomicWrite(path.join(dir, "".concat(review.id, ".json")), JSON.stringify(review, null, 2));
}
export function listPRIds(repoPath) {
    var reviewsRoot = path.join(repoPath, '.reviews');
    if (!fs.existsSync(reviewsRoot))
        return [];
    return fs.readdirSync(reviewsRoot).filter(function (name) {
        try {
            return fs.statSync(path.join(reviewsRoot, name)).isDirectory();
        }
        catch (_a) {
            return false;
        }
    });
}
export function listReviewIds(repoPath, prId) {
    var dir = reviewsDir(repoPath, prId);
    if (!fs.existsSync(dir))
        return [];
    return fs
        .readdirSync(dir)
        .filter(function (name) { return name.endsWith('.json') && !name.endsWith('.tmp'); })
        .map(function (name) { return name.slice(0, -5); }); // strip .json
}

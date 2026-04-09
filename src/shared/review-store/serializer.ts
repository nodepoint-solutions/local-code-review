// src/shared/review-store/serializer.ts
import fs from 'fs'
import path from 'path'
import { PRFileSchema, ReviewFileSchema } from './schema'
import type { PRFile, ReviewFile } from './schema'

export class InvalidReviewFileError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Invalid review file at ${filePath}: ${String(cause)}`)
    this.name = 'InvalidReviewFileError'
  }
}

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

export function prDir(repoPath: string, prId: string): string {
  return path.join(repoPath, '.reviews', prId)
}

export function reviewsDir(repoPath: string, prId: string): string {
  return path.join(prDir(repoPath, prId), 'reviews')
}

export function readPR(repoPath: string, prId: string): PRFile {
  const filePath = path.join(prDir(repoPath, prId), 'index.json')
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return PRFileSchema.parse(raw)
  } catch (err) {
    throw new InvalidReviewFileError(filePath, err)
  }
}

export function writePR(repoPath: string, pr: PRFile): void {
  const dir = prDir(repoPath, pr.id)
  ensureDir(path.join(dir, 'reviews'))
  atomicWrite(path.join(dir, 'index.json'), JSON.stringify(pr, null, 2))
}

export function readReview(repoPath: string, prId: string, reviewId: string): ReviewFile {
  const filePath = path.join(reviewsDir(repoPath, prId), `${reviewId}.json`)
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return ReviewFileSchema.parse(raw)
  } catch (err) {
    throw new InvalidReviewFileError(filePath, err)
  }
}

export function writeReview(repoPath: string, prId: string, review: ReviewFile): void {
  const dir = reviewsDir(repoPath, prId)
  ensureDir(dir)
  atomicWrite(path.join(dir, `${review.id}.json`), JSON.stringify(review, null, 2))
}

export function listPRIds(repoPath: string): string[] {
  const reviewsRoot = path.join(repoPath, '.reviews')
  if (!fs.existsSync(reviewsRoot)) return []
  return fs.readdirSync(reviewsRoot).filter((name) => {
    try {
      return fs.statSync(path.join(reviewsRoot, name)).isDirectory()
    } catch {
      return false
    }
  })
}

export function listReviewIds(repoPath: string, prId: string): string[] {
  const dir = reviewsDir(repoPath, prId)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('.tmp'))
    .map((name) => name.slice(0, -5)) // strip .json
}

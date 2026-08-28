// src/renderer/src/__tests__/helpers/mock-api.ts
//
// Installs a window.api stub so screens that talk to the main process render
// in jsdom. Every function resolves to an empty/neutral value; tests override
// the calls they care about.
import { vi } from 'vitest'

export function installMockApi(overrides: Record<string, unknown> = {}) {
  const unsubscribe = () => {}
  const api = {
    // Repos
    listRepos: vi.fn().mockResolvedValue([]),
    openRepo: vi.fn().mockResolvedValue({}),
    addRepoByPath: vi.fn().mockResolvedValue({}),
    touchRepo: vi.fn().mockResolvedValue(undefined),
    removeRepo: vi.fn().mockResolvedValue({}),
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
    scanRepos: vi.fn().mockResolvedValue([]),
    openScanDirPicker: vi.fn().mockResolvedValue(null),
    checkGlobalGitignore: vi.fn().mockResolvedValue({ installed: false, filePath: '' }),
    installGlobalGitignore: vi.fn().mockResolvedValue({ success: true }),
    // Branches / PRs
    listBranches: vi.fn().mockResolvedValue([]),
    listPrs: vi.fn().mockResolvedValue([]),
    createPr: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    getPr: vi.fn().mockResolvedValue(null),
    refreshPr: vi.fn().mockResolvedValue(null),
    updatePr: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    closePr: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    reopenPr: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    deletePr: vi.fn().mockResolvedValue({}),
    // Reviews & comments
    addComment: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    submitReview: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    newReview: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    reopenReview: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    resolveComment: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    deleteComment: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    downloadMarkdown: vi.fn().mockResolvedValue({ path: '/tmp/review.md' }),
    getDiffAtShas: vi.fn().mockResolvedValue([]),
    // Commits
    listCommits: vi.fn().mockResolvedValue([]),
    showCommit: vi.fn().mockResolvedValue({ diff: [] }),
    // MCP / integrations / launcher
    getMcpStatus: vi.fn().mockResolvedValue({ running: false }),
    toggleMcp: vi.fn().mockResolvedValue({ running: false }),
    getIntegrations: vi.fn().mockResolvedValue([]),
    installIntegrations: vi.fn().mockResolvedValue(undefined),
    launchFix: vi.fn().mockResolvedValue({}),
    copyFixPrompt: vi.fn().mockResolvedValue({ prompt: '/local-code-review …' }),
    listTerminals: vi.fn().mockResolvedValue(['Terminal']),
    assignPr: vi.fn().mockResolvedValue({ error: 'not-mocked' }),
    getRemoteInfo: vi.fn().mockResolvedValue(null),
    isWorkingDirClean: vi.fn().mockResolvedValue({ clean: true }),
    isBranchPushed: vi.fn().mockResolvedValue({ pushed: true }),
    pushBranch: vi.fn().mockResolvedValue({}),
    // Events
    onMcpStatusChanged: vi.fn().mockReturnValue(unsubscribe),
    onReposChanged: vi.fn().mockReturnValue(unsubscribe),
    onPrUpdated: vi.fn().mockReturnValue(unsubscribe),
    onReviewUpdated: vi.fn().mockReturnValue(unsubscribe),
    onUpdateProgress: vi.fn().mockReturnValue(unsubscribe),
    // Updates
    checkUpdate: vi.fn().mockResolvedValue(null),
    installUpdate: vi.fn().mockResolvedValue({ success: true }),
    platform: 'darwin',
  }
  // Object.assign keeps the mock types of the known properties while letting
  // tests override any subset
  const merged = Object.assign(api, overrides)
  ;(window as unknown as { api: unknown }).api = merged
  return merged
}

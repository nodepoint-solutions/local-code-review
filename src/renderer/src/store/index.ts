import { create } from 'zustand'
import type { Repository, PullRequest, PrDetail } from '../../../shared/types'

interface AppState {
  repos: Repository[]
  setRepos: (repos: Repository[]) => void

  selectedRepo: Repository | null
  setSelectedRepo: (repo: Repository | null) => void

  prDetail: PrDetail | null
  setPrDetail: (detail: PrDetail | null) => void

  diffView: 'unified' | 'split'
  setDiffView: (view: 'unified' | 'split') => void

  reviewPanelOpen: boolean
  setReviewPanelOpen: (open: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  repos: [],
  setRepos: (repos) => set({ repos }),

  selectedRepo: null,
  setSelectedRepo: (repo) => set({ selectedRepo: repo }),

  prDetail: null,
  setPrDetail: (detail) => set({ prDetail: detail }),

  diffView: 'unified',
  setDiffView: (view) => set({ diffView: view }),

  reviewPanelOpen: false,
  setReviewPanelOpen: (open) => set({ reviewPanelOpen: open }),
}))

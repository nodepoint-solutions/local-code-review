import { create } from 'zustand'
import type { Repository, PrDetail } from '../../../shared/types'

type Theme = 'dark' | 'light'

interface AppState {
  theme: Theme
  setTheme: (theme: Theme) => void

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

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // ignore
  }
  return 'light'
}

export const useStore = create<AppState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
    set({ theme })
  },

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

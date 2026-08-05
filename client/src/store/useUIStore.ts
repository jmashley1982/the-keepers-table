import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ScratchItem {
  id: string
  kind: string
  data: Record<string, unknown>
  saved: boolean
}

interface RecentQuickImage {
  assetId: string
  prompt: string
  createdAt: number
}

const MAX_RECENT_QUICK_IMAGES = 12

export interface UIState {
  theme: 'candlelight' | 'haunt' | 'eldritch' | 'icarus' | 'neon'
  setTheme: (t: UIState['theme']) => void

  reduceEffects: boolean
  setReduceEffects: (v: boolean) => void

  scratchTray: ScratchItem[]
  addScratchItem: (item: Omit<ScratchItem, 'saved'>) => void
  markScratchSaved: (id: string) => void
  removeScratchItem: (id: string) => void
  clearScratch: () => void

  // Quick-Generate images that haven't been attached/saved anywhere yet — kept
  // around (and persisted) so switching chips or closing the panel doesn't lose
  // a generated (and billed) image.
  recentQuickImages: RecentQuickImage[]
  addRecentQuickImage: (item: RecentQuickImage) => void
  removeRecentQuickImage: (assetId: string) => void

  quickGenerateOpen: boolean
  setQuickGenerateOpen: (v: boolean) => void

  activeCampaignId: string | null
  setActiveCampaignId: (id: string | null) => void

  leftSidebarCollapsed: boolean
  setLeftSidebarCollapsed: (v: boolean) => void

  rightSidebarCollapsed: boolean
  setRightSidebarCollapsed: (v: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'candlelight',
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.setAttribute('data-theme', theme)
      },

      reduceEffects: false,
      setReduceEffects: (reduceEffects) => {
        set({ reduceEffects })
        document.documentElement.setAttribute('data-reduce-motion', String(reduceEffects))
      },

      scratchTray: [],
      addScratchItem: (item) =>
        set((s) => ({ scratchTray: [{ ...item, saved: false }, ...s.scratchTray] })),
      markScratchSaved: (id) =>
        set((s) => ({
          scratchTray: s.scratchTray.map((i) => (i.id === id ? { ...i, saved: true } : i)),
        })),
      removeScratchItem: (id) =>
        set((s) => ({ scratchTray: s.scratchTray.filter((i) => i.id !== id) })),
      clearScratch: () => set({ scratchTray: [] }),

      recentQuickImages: [],
      addRecentQuickImage: (item) =>
        set((s) => ({
          recentQuickImages: [item, ...s.recentQuickImages.filter((i) => i.assetId !== item.assetId)]
            .slice(0, MAX_RECENT_QUICK_IMAGES),
        })),
      removeRecentQuickImage: (assetId) =>
        set((s) => ({ recentQuickImages: s.recentQuickImages.filter((i) => i.assetId !== assetId) })),

      quickGenerateOpen: false,
      setQuickGenerateOpen: (quickGenerateOpen) => set({ quickGenerateOpen }),

      activeCampaignId: null,
      setActiveCampaignId: (activeCampaignId) => set({ activeCampaignId }),

      leftSidebarCollapsed: false,
      setLeftSidebarCollapsed: (leftSidebarCollapsed) => set({ leftSidebarCollapsed }),

      rightSidebarCollapsed: false,
      setRightSidebarCollapsed: (rightSidebarCollapsed) => set({ rightSidebarCollapsed }),
    }),
    {
      name: 'kt-ui',
      partialize: (s) => ({
        theme: s.theme,
        reduceEffects: s.reduceEffects,
        activeCampaignId: s.activeCampaignId,
        leftSidebarCollapsed: s.leftSidebarCollapsed,
        rightSidebarCollapsed: s.rightSidebarCollapsed,
        scratchTray: s.scratchTray,
        recentQuickImages: s.recentQuickImages,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
        document.documentElement.setAttribute('data-reduce-motion', String(!!state?.reduceEffects))
      },
    },
  ),
)

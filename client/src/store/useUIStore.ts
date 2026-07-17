import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ScratchItem {
  id: string
  kind: string
  data: Record<string, unknown>
  saved: boolean
}

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

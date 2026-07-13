import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ScratchItem {
  id: string
  kind: string
  data: Record<string, unknown>
  saved: boolean
}

interface UIState {
  theme: 'parchment' | 'candlelight' | 'slate' | 'high-contrast' | 'eldritch' | 'icarus' | 'neon' | 'frosthold'
  setTheme: (t: UIState['theme']) => void

  scratchTray: ScratchItem[]
  addScratchItem: (item: Omit<ScratchItem, 'saved'>) => void
  markScratchSaved: (id: string) => void
  removeScratchItem: (id: string) => void
  clearScratch: () => void

  quickGenerateOpen: boolean
  setQuickGenerateOpen: (v: boolean) => void

  activeCampaignId: string | null
  setActiveCampaignId: (id: string | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'candlelight',
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.setAttribute('data-theme', theme)
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
    }),
    {
      name: 'kt-ui',
      partialize: (s) => ({ theme: s.theme, activeCampaignId: s.activeCampaignId }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    },
  ),
)

import { Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import { useUIStore } from './store/useUIStore'
import { useEffect } from 'react'

// Pages
import SplashPage from './pages/SplashPage'
import FriendsLoginPage from './pages/friends/FriendsLoginPage'
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import OnboardingPage from './pages/auth/OnboardingPage'
import SafetySubmitPage from './pages/SafetySubmitPage'
import CampaignsPage from './pages/campaigns/CampaignsPage'
import CampaignDashboard from './pages/campaign/CampaignDashboard'
import LibraryPage from './pages/campaign/LibraryPage'
import EntityDetailPage from './pages/campaign/EntityDetailPage'
import SessionLogPage from './pages/campaign/SessionLogPage'
import LiveSessionPage from './pages/campaign/LiveSessionPage'
import GeneratorPage from './pages/campaign/GeneratorPage'
import BattleMapGeneratorPage from './pages/campaign/BattleMapGeneratorPage'
import WorldMapGeneratorPage from './pages/campaign/WorldMapGeneratorPage'
import MapsPage from './pages/campaign/MapsPage'
import PlayersPage from './pages/campaign/PlayersPage'
import CampaignSettingsPage from './pages/campaign/CampaignSettingsPage'
import SettingsPage from './pages/SettingsPage'
import EnemiesPage from './pages/campaign/EnemiesPage'
import EnemyGeneratorPage from './pages/campaign/EnemyGeneratorPage'
import AppShell from './components/layout/AppShell'
import LineagePage from './pages/tools/LineagePage'
import DungeonTrackerPage from './pages/tools/DungeonTrackerPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-ink-muted text-sm">Loading…</span>
        </div>
      </div>
    )
  }

  if (!data?.user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const theme = useUIStore(s => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <Routes>
      {/* Friends login */}
      <Route path="/friends" element={<FriendsLoginPage />} />

      {/* Splash — public, handles both auth states internally */}
      <Route path="/" element={<SplashPage />} />

      {/* Public auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/safety-submit/:token" element={<SafetySubmitPage />} />

      {/* Protected — pathless layout route so "/" is never contested */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaign/:campaignId" element={<CampaignDashboard />} />
        <Route path="/campaign/:campaignId/session/:sessionId" element={<LiveSessionPage />} />
        <Route path="/campaign/:campaignId/log" element={<SessionLogPage />} />
        <Route path="/campaign/:campaignId/library" element={<LibraryPage />} />
        <Route path="/campaign/:campaignId/library/:tab" element={<LibraryPage />} />
        <Route path="/campaign/:campaignId/library/:tab/:entityId" element={<EntityDetailPage />} />
        <Route path="/campaign/:campaignId/players" element={<PlayersPage />} />
        <Route path="/campaign/:campaignId/maps" element={<MapsPage />} />
        <Route path="/campaign/:campaignId/enemies" element={<EnemiesPage />} />
        <Route path="/campaign/:campaignId/generate/enemy" element={<EnemyGeneratorPage />} />
        <Route path="/campaign/:campaignId/generate/battle-map" element={<BattleMapGeneratorPage />} />
        <Route path="/campaign/:campaignId/generate/world-map" element={<WorldMapGeneratorPage />} />
        <Route path="/campaign/:campaignId/generate/:kind" element={<GeneratorPage />} />
        <Route path="/campaign/:campaignId/settings" element={<CampaignSettingsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/tools/lineage" element={<LineagePage />} />
        <Route path="/tools/tracker" element={<DungeonTrackerPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

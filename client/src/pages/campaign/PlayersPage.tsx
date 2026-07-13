import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import GenerateArtButton from '../../components/entity/GenerateArtButton'
import {
  Plus, Trash2, Upload, ChevronDown, ChevronUp,
  User, Shield, Sword, BookOpen, Star, X, Check, AlertCircle, Loader2,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AbilityScores { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number }
interface CombatStats {
  hp?: number; maxHp?: number; tempHp?: number
  ac?: number; armor?: number; initiative?: number
  speed?: string; proficiencyBonus?: number; damage?: string
}

interface PlayerCharacter {
  id: string
  campaignId: string
  name: string
  playerName: string
  race: string
  playbook: string
  subclass: string
  level: number
  background: string
  alignment: string
  appearance: string
  backstory: string
  notes: string
  bonds: string
  moves: string
  abilityScores: AbilityScores
  combatStats: CombatStats
  skills: Record<string, boolean>
  savingThrows: Record<string, boolean>
  equipment: string[]
  xp: number
  portraitAssetId?: string | null
  sheetAssetId?: string | null
  portraitAsset?: { id: string; altText?: string; storageKeyThumb?: string } | null
  createdAt: string
  updatedAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function abilityMod(score: number | undefined): string {
  if (score == null) return '—'
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function statLabel(key: string) {
  return { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }[key] ?? key.toUpperCase()
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

// ── Portrait display ──────────────────────────────────────────────────────────

function PortraitDisplay({ pc, size = 'md' }: { pc: PlayerCharacter; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-12 h-12' : size === 'lg' ? 'w-32 h-32' : 'w-20 h-20'
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-4xl' : 'text-2xl'

  if (pc.portraitAsset?.storageKeyThumb) {
    return (
      <img
        src={`/api/assets/${pc.portraitAsset.id}/thumb`}
        alt={pc.portraitAsset.altText ?? pc.name}
        className={cn(sizeClass, 'rounded-full object-cover flex-shrink-0 border-2 border-border')}
      />
    )
  }
  return (
    <div className={cn(sizeClass, 'rounded-full bg-surface-2 border-2 border-border flex items-center justify-center flex-shrink-0')}>
      <span className={textSize}>
        {pc.name.charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

// ── PC Card (compact list item) ───────────────────────────────────────────────

function PCCard({ pc, isSelected, onClick }: { pc: PlayerCharacter; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-card border transition-colors flex items-center gap-3',
        isSelected
          ? 'border-accent bg-accent/10'
          : 'border-border hover:border-accent/40 hover:bg-surface-2',
      )}
    >
      <PortraitDisplay pc={pc} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink text-sm truncate">{pc.name}</p>
        <p className="text-xs text-ink-muted truncate">
          {[pc.race, pc.playbook].filter(Boolean).join(' · ') || 'No class set'}
        </p>
        <p className="text-xs text-ink-muted/60 truncate">
          {pc.playerName ? `Player: ${pc.playerName}` : ''}
          {pc.level > 1 ? ` · Lv ${pc.level}` : ''}
        </p>
      </div>
    </button>
  )
}

// ── Ability score box ─────────────────────────────────────────────────────────

function AbilityBox({
  label, value, onChange,
}: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const mod = value != null ? Math.floor((value - 10) / 2) : null
  return (
    <div className="flex flex-col items-center gap-1 w-14">
      <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{label}</span>
      <input
        type="number"
        min={1} max={30}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="w-full text-center py-1.5 rounded-md border border-border bg-surface-2 text-ink text-sm font-bold focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-xs text-ink-muted font-mono">
        {mod != null ? (mod >= 0 ? `+${mod}` : `${mod}`) : '—'}
      </span>
    </div>
  )
}

// ── Sheet extraction overlay ──────────────────────────────────────────────────

function SheetExtractOverlay({
  extracted,
  onApply,
  onDismiss,
}: {
  extracted: Partial<PlayerCharacter>
  onApply: (data: Partial<PlayerCharacter>) => void
  onDismiss: () => void
}) {
  const fields: { key: keyof PlayerCharacter; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'playerName', label: 'Player' },
    { key: 'race', label: 'Race / Ancestry' },
    { key: 'playbook', label: 'Class / Playbook' },
    { key: 'subclass', label: 'Subclass' },
    { key: 'level', label: 'Level' },
    { key: 'background', label: 'Background' },
    { key: 'alignment', label: 'Alignment' },
    { key: 'bonds', label: 'Bonds / Ideals' },
    { key: 'moves', label: 'Moves / Features' },
    { key: 'backstory', label: 'Backstory' },
    { key: 'appearance', label: 'Appearance' },
  ]

  const meaningful = fields.filter(f => {
    const v = extracted[f.key]
    return v != null && v !== '' && v !== 0
  })

  const scores = extracted.abilityScores as AbilityScores | undefined
  const combat = extracted.combatStats as CombatStats | undefined
  const equip = extracted.equipment as string[] | undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-ink">Sheet extracted</h3>
            <p className="text-xs text-ink-muted mt-0.5">Review the data below before applying it to this character.</p>
          </div>
          <button onClick={onDismiss} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {meaningful.length === 0 && !scores && !combat && !equip?.length && (
            <p className="text-ink-muted text-sm text-center py-4">No data could be extracted from this image.</p>
          )}
          {meaningful.map(({ key, label }) => (
            <div key={key} className="flex gap-3 text-sm">
              <span className="w-32 flex-shrink-0 text-ink-muted">{label}</span>
              <span className="text-ink break-words">{String(extracted[key])}</span>
            </div>
          ))}
          {scores && Object.values(scores).some(v => v != null) && (
            <div className="flex gap-3 text-sm">
              <span className="w-32 flex-shrink-0 text-ink-muted">Ability Scores</span>
              <span className="text-ink font-mono text-xs">
                {ABILITY_KEYS.map(k => scores[k] != null ? `${k.toUpperCase()}:${scores[k]}` : null).filter(Boolean).join('  ')}
              </span>
            </div>
          )}
          {combat && Object.values(combat).some(v => v != null) && (
            <div className="flex gap-3 text-sm">
              <span className="w-32 flex-shrink-0 text-ink-muted">Combat Stats</span>
              <span className="text-ink font-mono text-xs">
                {[
                  combat.maxHp != null && `HP:${combat.maxHp}`,
                  combat.ac != null && `AC:${combat.ac}`,
                  combat.armor != null && `Armor:${combat.armor}`,
                  combat.speed && `Spd:${combat.speed}`,
                  combat.damage && `Dmg:${combat.damage}`,
                ].filter(Boolean).join('  ')}
              </span>
            </div>
          )}
          {equip && equip.length > 0 && (
            <div className="flex gap-3 text-sm">
              <span className="w-32 flex-shrink-0 text-ink-muted">Equipment</span>
              <span className="text-ink">{equip.join(', ')}</span>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={() => onApply(extracted)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-card bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <Check size={14} />
            Apply to Character
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2 rounded-card border border-border text-ink-muted text-sm hover:bg-surface-2 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Equipment tag input ───────────────────────────────────────────────────────

function EquipmentInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const trimmed = draft.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map(item => (
          <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 border border-border text-xs text-ink">
            {item}
            <button onClick={() => onChange(value.filter(i => i !== item))} className="text-ink-muted hover:text-danger transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-ink-muted italic">No items added</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add item…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          className="flex-1 px-3 py-1.5 rounded-card border border-border bg-surface-2 text-ink text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button onClick={add} className="px-3 py-1.5 rounded-card border border-border text-ink-muted hover:text-ink hover:bg-surface-2 text-sm transition-colors">
          Add
        </button>
      </div>
    </div>
  )
}

// ── Main CharacterSheet editor ────────────────────────────────────────────────

function CharacterSheet({
  pc,
  campaignId,
  onUpdated,
  onDelete,
}: {
  pc: PlayerCharacter
  campaignId: string
  onUpdated: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'stats' | 'moves' | 'story'>('info')
  const [draft, setDraft] = useState<PlayerCharacter>(pc)
  const [isDirty, setIsDirty] = useState(false)
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'extracted' | 'error'>('idle')
  const [uploadError, setUploadError] = useState('')
  const [extracted, setExtracted] = useState<Partial<PlayerCharacter> | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof PlayerCharacter>(key: K, value: PlayerCharacter[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    setIsDirty(true)
  }

  const setScore = (key: keyof AbilityScores, value: number | undefined) => {
    setDraft(d => ({ ...d, abilityScores: { ...d.abilityScores, [key]: value } }))
    setIsDirty(true)
  }

  const setCombat = (key: keyof CombatStats, value: string | number | undefined) => {
    setDraft(d => ({ ...d, combatStats: { ...d.combatStats, [key]: value } }))
    setIsDirty(true)
  }

  const save = useMutation({
    mutationFn: () => api.patch(`/api/campaigns/${campaignId}/player-characters/${pc.id}`, draft),
    onSuccess: () => {
      setIsDirty(false)
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      onUpdated()
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/campaigns/${campaignId}/player-characters/${pc.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      onDelete()
    },
  })

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      setUploadPhase('uploading')
      setUploadError('')
      const arrayBuf = await file.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuf)
      let binary = ''
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
      const imageData = btoa(binary)
      const r = await api.post(`/api/campaigns/${campaignId}/player-characters/${pc.id}/sheet-upload`, {
        imageData,
        mimeType: file.type || 'image/png',
      })
      return r.data as { assetId: string; extracted: Partial<PlayerCharacter> | null; warning?: string }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      if (data.extracted && Object.keys(data.extracted).length > 0) {
        setExtracted(data.extracted)
        setUploadPhase('extracted')
      } else {
        setUploadPhase('idle')
      }
    },
    onError: (err) => {
      setUploadError(apiError(err))
      setUploadPhase('error')
    },
  })

  const applyExtracted = useMutation({
    mutationFn: (data: Partial<PlayerCharacter>) => {
      const clean: Partial<PlayerCharacter> = {}
      for (const [k, v] of Object.entries(data)) {
        if (v != null && v !== '' && (!Array.isArray(v) || v.length > 0)) {
          (clean as Record<string, unknown>)[k] = v
        }
      }
      return api.patch(`/api/campaigns/${campaignId}/player-characters/${pc.id}`, clean)
    },
    onSuccess: () => {
      setExtracted(null)
      setUploadPhase('idle')
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      onUpdated()
    },
  })

  const scores = draft.abilityScores as AbilityScores
  const combat = draft.combatStats as CombatStats

  const tabs = [
    { id: 'info' as const, label: 'Character', icon: <User size={13} /> },
    { id: 'stats' as const, label: 'Stats', icon: <Shield size={13} /> },
    { id: 'moves' as const, label: 'Moves', icon: <Sword size={13} /> },
    { id: 'story' as const, label: 'Story', icon: <BookOpen size={13} /> },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sheet upload extraction overlay */}
      {uploadPhase === 'extracted' && extracted && (
        <SheetExtractOverlay
          extracted={extracted}
          onApply={data => applyExtracted.mutate(data)}
          onDismiss={() => { setExtracted(null); setUploadPhase('idle') }}
        />
      )}

      {/* Header */}
      <div className="flex items-start gap-4 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
        {/* Portrait */}
        <div className="flex flex-col items-center gap-2">
          <PortraitDisplay pc={draft} size="lg" />
          <GenerateArtButton
            kind="portrait_pc"
            entityId={pc.id}
            campaignId={campaignId}
            entityType="pc"
            currentAssetId={pc.portraitAssetId}
            onGenerated={() => {
              qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
              onUpdated()
            }}
          />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0 space-y-2">
          <input
            className="w-full text-xl font-bold text-ink bg-transparent border-b border-border focus:outline-none focus:border-accent pb-1"
            value={draft.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Character name…"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="px-2 py-1 rounded border border-border bg-surface-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Player name"
              value={draft.playerName}
              onChange={e => set('playerName', e.target.value)}
            />
            <input
              type="number"
              min={1} max={30}
              className="px-2 py-1 rounded border border-border bg-surface-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Level"
              value={draft.level || ''}
              onChange={e => set('level', Number(e.target.value) || 1)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Upload Sheet */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = '' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadPhase === 'uploading'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-card border border-border text-xs text-ink-muted hover:text-ink hover:bg-surface-2 disabled:opacity-50 transition-colors"
            >
              {uploadPhase === 'uploading'
                ? <><Loader2 size={12} className="animate-spin" /> Extracting…</>
                : <><Upload size={12} /> Upload Sheet</>
              }
            </button>
            {uploadPhase === 'error' && (
              <span className="text-xs text-danger flex items-center gap-1">
                <AlertCircle size={12} /> {uploadError}
              </span>
            )}
            {/* XP */}
            <label className="flex items-center gap-1.5 text-xs text-ink-muted ml-auto">
              <Star size={12} />
              <span>XP</span>
              <input
                type="number" min={0}
                value={draft.xp || 0}
                onChange={e => set('xp', Number(e.target.value))}
                className="w-16 px-2 py-0.5 rounded border border-border bg-surface-2 text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4 flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px',
              activeTab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* ── CHARACTER tab ─────────────────────────────────────────────────── */}
        {activeTab === 'info' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'race' as const, label: 'Race / Ancestry' },
                { key: 'playbook' as const, label: 'Class / Playbook' },
                { key: 'subclass' as const, label: 'Subclass / Specialization' },
                { key: 'background' as const, label: 'Background / Origin' },
                { key: 'alignment' as const, label: 'Alignment' },
              ].map(({ key, label }) => (
                <div key={key} className={key === 'subclass' || key === 'background' ? 'col-span-2' : ''}>
                  <label className="block text-xs text-ink-muted mb-1">{label}</label>
                  <input
                    className="w-full px-3 py-1.5 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    value={draft[key] as string}
                    onChange={e => set(key, e.target.value)}
                    placeholder={label}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── STATS tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <>
            <div>
              <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Ability Scores</h4>
              <div className="flex gap-2 flex-wrap">
                {ABILITY_KEYS.map(k => (
                  <AbilityBox
                    key={k}
                    label={statLabel(k)}
                    value={scores[k]}
                    onChange={v => setScore(k, v)}
                  />
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Combat</h4>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'maxHp', label: 'Max HP', type: 'number' },
                  { key: 'hp', label: 'Current HP', type: 'number' },
                  { key: 'tempHp', label: 'Temp HP', type: 'number' },
                  { key: 'ac', label: 'AC / Armor', type: 'number' },
                  { key: 'initiative', label: 'Initiative', type: 'number' },
                  { key: 'proficiencyBonus', label: 'Prof. Bonus', type: 'number' },
                  { key: 'speed', label: 'Speed', type: 'text' },
                  { key: 'damage', label: 'Damage Dice', type: 'text' },
                ] as { key: keyof CombatStats; label: string; type: string }[]).map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-xs text-ink-muted mb-1">{label}</label>
                    <input
                      type={type}
                      className="w-full px-3 py-1.5 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                      value={(combat[key] as string | number | undefined) ?? ''}
                      onChange={e => {
                        const v = type === 'number'
                          ? (e.target.value === '' ? undefined : Number(e.target.value))
                          : e.target.value
                        setCombat(key, v as string | number | undefined)
                      }}
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── MOVES tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'moves' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Class Features / Moves / Abilities
              </label>
              <textarea
                rows={8}
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                placeholder="List class features, playbook moves, spells, special abilities…"
                value={draft.moves}
                onChange={e => set('moves', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Equipment</label>
              <EquipmentInput
                value={Array.isArray(draft.equipment) ? draft.equipment as string[] : []}
                onChange={v => set('equipment', v)}
              />
            </div>
          </>
        )}

        {/* ── STORY tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'story' && (
          <>
            {([
              { key: 'appearance' as const, label: 'Appearance', placeholder: 'Physical description…' },
              { key: 'bonds' as const, label: 'Bonds / Ideals / Flaws', placeholder: 'Relationships, drives, compulsions, ties to the world…' },
              { key: 'backstory' as const, label: 'Backstory', placeholder: 'History and background…' },
              { key: 'notes' as const, label: "GM / Player Notes", placeholder: 'Anything else worth tracking…' },
            ]).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">{label}</label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                  placeholder={placeholder}
                  value={draft[key] as string}
                  onChange={e => set(key, e.target.value)}
                />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer: Save + Delete */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-border flex-shrink-0 bg-surface">
        {confirmDelete ? (
          <>
            <span className="text-xs text-danger flex-1">Delete this character?</span>
            <button onClick={() => deleteMut.mutate()} className="text-xs px-3 py-1.5 rounded-card bg-danger text-white hover:bg-danger/90 transition-colors">
              Yes, delete
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs px-3 py-1.5 rounded-card border border-border text-ink-muted hover:bg-surface-2 transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs flex items-center gap-1.5 text-ink-muted hover:text-danger transition-colors"
            >
              <Trash2 size={13} /> Delete
            </button>
            <div className="flex-1" />
            {isDirty && (
              <span className="text-xs text-ink-muted/60 italic">Unsaved changes</span>
            )}
            <button
              onClick={() => save.mutate()}
              disabled={!isDirty || save.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-card bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── New PC form ───────────────────────────────────────────────────────────────

function NewPCModal({
  campaignId,
  onCreated,
  onClose,
}: { campaignId: string; onCreated: (pc: PlayerCharacter) => void; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [race, setRace] = useState('')
  const [playbook, setPlaybook] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/api/campaigns/${campaignId}/player-characters`, {
      name: name.trim(), playerName, race, playbook,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      onCreated(r.data.playerCharacter)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-ink">Add Player Character</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Character Name *</label>
            <input
              autoFocus
              className="w-full px-3 py-2 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Aria Windmere"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create.mutate() }}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Player's Name</label>
            <input
              className="w-full px-3 py-2 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Jordan"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-muted mb-1">Race / Ancestry</label>
              <input
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Elf"
                value={race}
                onChange={e => setRace(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">Class / Playbook</label>
              <input
                className="w-full px-3 py-2 rounded-card border border-border bg-surface-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Ranger"
                value={playbook}
                onChange={e => setPlaybook(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-card bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Character
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-card border border-border text-ink-muted text-sm hover:bg-surface-2 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlayersPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['player-characters', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data),
    enabled: !!campaignId,
  })

  const pcs: PlayerCharacter[] = data?.playerCharacters ?? []
  const selected = pcs.find(p => p.id === selectedId) ?? null

  return (
    <div className="flex h-full overflow-hidden">
      {showNew && campaignId && (
        <NewPCModal
          campaignId={campaignId}
          onCreated={pc => { setShowNew(false); setSelectedId(pc.id) }}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* Left panel — PC list */}
      <div className="w-64 flex flex-col border-r border-border bg-surface flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h2 className="font-semibold text-ink text-sm">Players</h2>
            <p className="text-xs text-ink-muted">{pcs.length} character{pcs.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-card bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 border border-accent/20 transition-colors"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-ink-muted" />
            </div>
          )}
          {!isLoading && pcs.length === 0 && (
            <div className="text-center py-8 px-3">
              <User size={28} className="mx-auto text-ink-muted/40 mb-2" />
              <p className="text-xs text-ink-muted">No characters yet</p>
              <button
                onClick={() => setShowNew(true)}
                className="mt-3 text-xs text-accent hover:underline"
              >
                Add the first one
              </button>
            </div>
          )}
          {pcs.map(pc => (
            <PCCard
              key={pc.id}
              pc={pc}
              isSelected={selectedId === pc.id}
              onClick={() => setSelectedId(pc.id)}
            />
          ))}
        </div>
      </div>

      {/* Right panel — sheet editor */}
      <div className="flex-1 overflow-hidden bg-surface">
        {selected && campaignId ? (
          <CharacterSheet
            key={selected.id}
            pc={selected}
            campaignId={campaignId}
            onUpdated={() => {}}
            onDelete={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <User size={48} className="text-ink-muted/30" />
            <div>
              <p className="font-medium text-ink-muted">Select a character to view their sheet</p>
              <p className="text-xs text-ink-muted/60 mt-1">
                Or add a new player character to get started.
              </p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-card bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <Plus size={14} /> Add Character
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

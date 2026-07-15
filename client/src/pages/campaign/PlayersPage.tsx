import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useState, useRef } from 'react'
import { cn } from '../../lib/cn'
import {
  Plus, Trash2, Save, X, Upload, Check,
  ChevronDown, ChevronUp, Loader, Users, ArrowUp, ArrowDown, GripVertical,
  BookOpen,
} from 'lucide-react'
import { DW_CLASSES, applyDWTemplate } from '../../lib/dwClasses'
import { EntityAvatarWithArt } from '../../components/entity/GenerateArtButton'
import GenerateArtButton from '../../components/entity/GenerateArtButton'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AbilityScores {
  str?: number; dex?: number; con?: number
  int?: number; wis?: number; cha?: number
}

interface CombatStats {
  hp?: number; maxHp?: number; tempHp?: number
  ac?: number; initiative?: number; speed?: number
  proficiencyBonus?: number; inspiration?: boolean
}

interface Skills {
  acrobatics?: number; animalHandling?: number; arcana?: number
  athletics?: number; deception?: number; history?: number
  insight?: number; intimidation?: number; investigation?: number
  medicine?: number; nature?: number; perception?: number
  performance?: number; persuasion?: number; religion?: number
  sleightOfHand?: number; stealth?: number; survival?: number
}

interface SavingThrows {
  str?: number; dex?: number; con?: number
  int?: number; wis?: number; cha?: number
}

interface PlayerCharacter {
  id: string
  campaignId: string
  name: string
  playerName: string
  race: string
  class: string
  subclass: string
  level: number
  background: string
  alignment: string
  appearance: string
  backstory: string
  notes: string
  features: string
  abilityScores: AbilityScores
  combatStats: CombatStats
  skills: Skills
  savingThrows: SavingThrows
  equipment: string[]
  portraitAssetId: string | null
  sheetAssetId: string | null
  portraitAsset?: { id: string; altText?: string | null } | null
  createdAt: string
  updatedAt: string
}

type PCDraft = Omit<PlayerCharacter, 'id' | 'campaignId' | 'createdAt' | 'updatedAt' | 'portraitAsset'>

const EMPTY_DRAFT: PCDraft = {
  name: '', playerName: '', race: '', class: '', subclass: '',
  level: 1, background: '', alignment: '', appearance: '',
  backstory: '', notes: '', features: '',
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  combatStats: { hp: 0, maxHp: 0, tempHp: 0, ac: 10, initiative: 0, speed: 30, proficiencyBonus: 2, inspiration: false },
  skills: {}, savingThrows: {},
  equipment: [], portraitAssetId: null, sheetAssetId: null,
}

const ABILITY_LABELS: [keyof AbilityScores, string][] = [
  ['str', 'STR'], ['dex', 'DEX'], ['con', 'CON'],
  ['int', 'INT'], ['wis', 'WIS'], ['cha', 'CHA'],
]

const SKILL_LABELS: [keyof Skills, string][] = [
  ['acrobatics', 'Acrobatics'], ['animalHandling', 'Animal Handling'], ['arcana', 'Arcana'],
  ['athletics', 'Athletics'], ['deception', 'Deception'], ['history', 'History'],
  ['insight', 'Insight'], ['intimidation', 'Intimidation'], ['investigation', 'Investigation'],
  ['medicine', 'Medicine'], ['nature', 'Nature'], ['perception', 'Perception'],
  ['performance', 'Performance'], ['persuasion', 'Persuasion'], ['religion', 'Religion'],
  ['sleightOfHand', 'Sleight of Hand'], ['stealth', 'Stealth'], ['survival', 'Survival'],
]

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

function NumInput({ label, value, onChange, min, max }: {
  label: string; value: number | undefined; onChange: (n: number) => void
  min?: number; max?: number
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-bold text-ink-muted uppercase tracking-wide mb-0.5">{label}</span>
      <input
        type="number"
        min={min ?? 1}
        max={max ?? 30}
        value={value ?? ''}
        onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-12 text-center text-sm font-bold input py-1 px-0"
      />
      {max === undefined && (
        <span className="text-[10px] text-accent mt-0.5">
          {value !== undefined ? abilityMod(value) : '—'}
        </span>
      )}
    </div>
  )
}

// ── Sheet upload + Vision preview ─────────────────────────────────────────────

function SheetUploadButton({ campaignId, pcId, onExtracted }: {
  campaignId: string; pcId: string; onExtracted: (data: Partial<PCDraft>) => void
}) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [previewData, setPreviewData] = useState<Partial<PCDraft> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('uploading')
    setError('')
    const form = new FormData()
    form.append('sheet', file)
    try {
      const res = await api.post<{ assetId: string; extracted: Partial<PCDraft>; extractionFailed?: boolean }>(
        `/api/campaigns/${campaignId}/player-characters/${pcId}/sheet-upload`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      if (res.data.extractionFailed) {
        setError("Couldn't read the sheet — try a clearer photo")
        setStatus('error')
      } else {
        setPreviewData({ ...res.data.extracted, sheetAssetId: res.data.assetId })
        setStatus('done')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e?.response?.data?.error ?? 'Upload failed')
      setStatus('error')
    }
  }

  if (status === 'done' && previewData) {
    return (
      <div className="mt-3 p-3 bg-surface-2 border border-border rounded-card text-xs space-y-2">
        <p className="font-semibold text-ink">Sheet scan complete — review extracted fields:</p>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {Object.entries(previewData).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
            <div key={k} className="flex gap-2 items-start">
              <span className="text-ink-muted capitalize min-w-[100px] shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className="text-ink truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary text-xs py-1 flex items-center gap-1"
            onClick={() => { onExtracted(previewData); setStatus('idle'); setPreviewData(null) }}
          >
            <Check size={12} /> Apply to sheet
          </button>
          <button
            className="btn-secondary text-xs py-1"
            onClick={() => { setStatus('idle'); setPreviewData(null) }}
          >
            Discard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
      />
      <button
        className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
        disabled={status === 'uploading'}
        onClick={() => fileRef.current?.click()}
      >
        {status === 'uploading' ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
        {status === 'uploading' ? 'Scanning…' : 'Upload Sheet'}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  )
}

// ── PC Card (compact, sortable) ───────────────────────────────────────────────

function PCCard({ pc, campaignId, onSelect, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  pc: PlayerCharacter; campaignId: string
  onSelect: () => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void
  isFirst: boolean; isLast: boolean
}) {
  const qc = useQueryClient()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pc.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'card cursor-pointer hover:border-accent/40 transition-colors group',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-accent/40',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <EntityAvatarWithArt
            assetId={pc.portraitAssetId}
            entityType="pc"
            altText={pc.portraitAsset?.altText ?? pc.name}
          />
          <GenerateArtButton
            kind="portrait_pc"
            entityId={pc.id}
            campaignId={campaignId}
            entityType="pc"
            currentAssetId={pc.portraitAssetId}
            onGenerated={() => qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="display-font font-semibold text-ink text-base leading-tight truncate">{pc.name}</h3>
          {pc.playerName && <p className="text-xs text-ink-muted">Player: {pc.playerName}</p>}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {pc.race && <span className="badge bg-surface-2 text-ink-muted text-[10px]">{pc.race}</span>}
            {pc.class && (
              <span className="badge bg-accent/10 text-accent text-[10px]">
                {pc.subclass ? `${pc.subclass} ${pc.class}` : pc.class}
              </span>
            )}
            <span className="badge bg-surface-2 text-ink-muted text-[10px]">Lv {pc.level}</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button
            className="btn-ghost p-1 text-ink-muted cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={13} />
          </button>
          <button
            className="btn-ghost p-1 text-ink-muted disabled:opacity-30"
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
          >
            <ArrowUp size={13} />
          </button>
          <button
            className="btn-ghost p-1 text-ink-muted disabled:opacity-30"
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
          >
            <ArrowDown size={13} />
          </button>
          <button
            className="btn-ghost p-1 text-danger"
            onClick={onDelete}
            title="Delete character"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PC Sheet Editor ───────────────────────────────────────────────────────────

function PCSheetEditor({ pc, campaignId, onClose, onSaved }: {
  pc: PlayerCharacter; campaignId: string; onClose: () => void; onSaved: () => void
}) {
  const qc = useQueryClient()
  const [templateOpen, setTemplateOpen] = useState(false)
  const [draft, setDraft] = useState<PCDraft>({
    name: pc.name, playerName: pc.playerName, race: pc.race,
    class: pc.class, subclass: pc.subclass, level: pc.level,
    background: pc.background, alignment: pc.alignment, appearance: pc.appearance,
    backstory: pc.backstory, notes: pc.notes, features: pc.features,
    abilityScores: { ...pc.abilityScores },
    combatStats: { ...pc.combatStats },
    skills: { ...pc.skills },
    savingThrows: { ...pc.savingThrows },
    equipment: [...(pc.equipment ?? [])],
    portraitAssetId: pc.portraitAssetId,
    sheetAssetId: pc.sheetAssetId,
  })
  const [equipInput, setEquipInput] = useState('')
  const [combatOpen, setCombatOpen] = useState(true)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(true)
  const [equipOpen, setEquipOpen] = useState(true)
  const [backstoryOpen, setBackstoryOpen] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (data: Partial<PCDraft>) =>
      api.patch(`/api/campaigns/${campaignId}/player-characters/${pc.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      onSaved()
    },
  })

  function applyExtracted(data: Partial<PCDraft>) {
    setDraft(d => ({
      ...d,
      ...(data.name ? { name: data.name } : {}),
      ...(data.playerName ? { playerName: data.playerName } : {}),
      ...(data.race ? { race: data.race } : {}),
      ...(data.class ? { class: data.class } : {}),
      ...(data.subclass ? { subclass: data.subclass } : {}),
      ...(data.level ? { level: data.level } : {}),
      ...(data.background ? { background: data.background } : {}),
      ...(data.alignment ? { alignment: data.alignment } : {}),
      ...(data.appearance ? { appearance: data.appearance } : {}),
      ...(data.backstory ? { backstory: data.backstory } : {}),
      ...(data.notes ? { notes: data.notes } : {}),
      ...(data.features ? { features: data.features } : {}),
      ...(data.sheetAssetId ? { sheetAssetId: data.sheetAssetId } : {}),
      abilityScores: data.abilityScores ? { ...d.abilityScores, ...data.abilityScores } : d.abilityScores,
      combatStats: data.combatStats ? { ...d.combatStats, ...data.combatStats } : d.combatStats,
      skills: data.skills ? { ...d.skills, ...data.skills } : d.skills,
      savingThrows: data.savingThrows ? { ...d.savingThrows, ...data.savingThrows } : d.savingThrows,
      equipment: data.equipment?.length ? data.equipment : d.equipment,
    }))
  }

  function updateAbility(key: keyof AbilityScores, val: number) {
    setDraft(d => ({ ...d, abilityScores: { ...d.abilityScores, [key]: val } }))
  }
  function updateCombat(key: keyof CombatStats, val: number | boolean) {
    setDraft(d => ({ ...d, combatStats: { ...d.combatStats, [key]: val } }))
  }
  function addEquipment() {
    const item = equipInput.trim()
    if (!item) return
    setDraft(d => ({ ...d, equipment: [...d.equipment, item] }))
    setEquipInput('')
  }
  function removeEquipment(idx: number) {
    setDraft(d => ({ ...d, equipment: d.equipment.filter((_, i) => i !== idx) }))
  }

  const section = (label: string, open: boolean, toggle: () => void, children: React.ReactNode) => (
    <div className="border border-border rounded-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-2 text-sm font-semibold text-ink"
        onClick={toggle}
      >
        {label}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface rounded-card border border-border w-full max-w-3xl my-4 shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="display-font text-xl font-bold text-ink">
            {pc.name || 'Character Sheet'}
          </h2>
          <div className="flex items-center gap-2">
            {/* DW Class Template picker */}
            <div className="relative">
              <button
                className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
                onClick={() => setTemplateOpen(v => !v)}
                title="Load a Dungeon World class template"
              >
                <BookOpen size={12} /> DW Template
              </button>
              {templateOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-card shadow-xl w-52 py-1 max-h-80 overflow-y-auto">
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-ink-muted uppercase tracking-wide border-b border-border mb-1">
                    Dungeon World Classes
                  </p>
                  {DW_CLASSES.map(cls => (
                    <button
                      key={cls.name}
                      className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-2 transition-colors flex items-center justify-between"
                      onClick={() => {
                        const t = applyDWTemplate(cls)
                        applyExtracted({
                          class: t.class,
                          features: t.features,
                          notes: t.notes,
                          equipment: t.equipment,
                          combatStats: { ...draft.combatStats, ...t.combatStats },
                        })
                        setTemplateOpen(false)
                      }}
                    >
                      <span>{cls.name}</span>
                      <span className="text-ink-muted text-[10px]">{cls.damageDie} | {cls.hpBase}+CON HP</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SheetUploadButton campaignId={campaignId} pcId={pc.id} onExtracted={applyExtracted} />
            <button
              className="btn-primary text-sm py-1.5 flex items-center gap-1"
              onClick={() => updateMutation.mutate(draft)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
            <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Portrait */}
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-2 shrink-0">
              <EntityAvatarWithArt
                assetId={draft.portraitAssetId}
                entityType="pc"
                altText={pc.name}
              />
              <GenerateArtButton
                kind="portrait_pc"
                entityId={pc.id}
                campaignId={campaignId}
                entityType="pc"
                currentAssetId={draft.portraitAssetId}
                onGenerated={() => qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })}
              />
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Character Name</label>
                <input className="input text-sm" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Player Name</label>
                <input className="input text-sm" value={draft.playerName} onChange={e => setDraft(d => ({ ...d, playerName: e.target.value }))} />
              </div>
              <div>
                <label className="label">Race</label>
                <input className="input text-sm" value={draft.race} onChange={e => setDraft(d => ({ ...d, race: e.target.value }))} />
              </div>
              <div>
                <label className="label">Class</label>
                <input className="input text-sm" value={draft.class} onChange={e => setDraft(d => ({ ...d, class: e.target.value }))} />
              </div>
              <div>
                <label className="label">Subclass</label>
                <input className="input text-sm" value={draft.subclass} onChange={e => setDraft(d => ({ ...d, subclass: e.target.value }))} />
              </div>
              <div>
                <label className="label">Level</label>
                <input
                  type="number" min={1} max={20} className="input text-sm"
                  value={draft.level}
                  onChange={e => setDraft(d => ({ ...d, level: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
              <div>
                <label className="label">Background</label>
                <input className="input text-sm" value={draft.background} onChange={e => setDraft(d => ({ ...d, background: e.target.value }))} />
              </div>
              <div>
                <label className="label">Alignment</label>
                <select className="input text-sm" value={draft.alignment} onChange={e => setDraft(d => ({ ...d, alignment: e.target.value }))}>
                  <option value="">—</option>
                  {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Ability Scores */}
          <div className="border border-border rounded-card p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Ability Scores</p>
            <div className="flex gap-3 flex-wrap">
              {ABILITY_LABELS.map(([key, label]) => (
                <NumInput
                  key={key}
                  label={label}
                  value={(draft.abilityScores as Record<string, number>)[key]}
                  onChange={val => updateAbility(key, val)}
                  max={30}
                />
              ))}
            </div>
          </div>

          {/* Combat Stats */}
          {section('Combat Stats', combatOpen, () => setCombatOpen(v => !v), (
            <div className="grid grid-cols-4 gap-3">
              {([
                ['hp', 'Current HP', 1, 999],
                ['maxHp', 'Max HP', 1, 999],
                ['tempHp', 'Temp HP', 0, 999],
                ['ac', 'AC', 1, 30],
                ['initiative', 'Initiative', -5, 20],
                ['speed', 'Speed', 0, 120],
                ['proficiencyBonus', 'Prof Bonus', 2, 6],
              ] as [keyof CombatStats, string, number, number][]).map(([key, label, min, max]) => (
                <div key={key} className="flex flex-col">
                  <label className="label text-[10px]">{label}</label>
                  <input
                    type="number" min={min} max={max}
                    className="input text-sm py-1"
                    value={(draft.combatStats as Record<string, number>)[key as string] ?? ''}
                    onChange={e => updateCombat(key, parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              ))}
              <div className="flex flex-col">
                <label className="label text-[10px]">Inspiration</label>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft.combatStats.inspiration}
                    onChange={e => updateCombat('inspiration', e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-accent"
                  />
                  <span className="text-sm text-ink">Yes</span>
                </label>
              </div>
            </div>
          ))}

          {/* Saving Throws & Skills */}
          {section('Saving Throws & Skills', skillsOpen, () => setSkillsOpen(v => !v), (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Saving Throws</p>
                <div className="space-y-1.5">
                  {ABILITY_LABELS.map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="number" min={-5} max={20}
                        className="input text-sm py-0.5 w-14 text-center"
                        value={(draft.savingThrows as Record<string, number>)[key as string] ?? ''}
                        onChange={e => setDraft(d => ({ ...d, savingThrows: { ...d.savingThrows, [key]: parseInt(e.target.value, 10) || 0 } }))}
                      />
                      <span className="text-sm text-ink">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Skills</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {SKILL_LABELS.map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="number" min={-5} max={20}
                        className="input text-sm py-0.5 w-14 text-center"
                        value={(draft.skills as Record<string, number>)[key as string] ?? ''}
                        onChange={e => setDraft(d => ({ ...d, skills: { ...d.skills, [key]: parseInt(e.target.value, 10) || 0 } }))}
                      />
                      <span className="text-sm text-ink">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Equipment */}
          {section('Equipment', equipOpen, () => setEquipOpen(v => !v), (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  className="input text-sm flex-1"
                  placeholder="Add item…"
                  value={equipInput}
                  onChange={e => setEquipInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEquipment() } }}
                />
                <button className="btn-secondary py-1 px-3 text-sm flex items-center gap-1" onClick={addEquipment}>
                  <Plus size={13} /> Add
                </button>
              </div>
              {draft.equipment.length > 0 ? (
                <ul className="space-y-1">
                  {draft.equipment.map((item, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-0.5">
                      <span className="text-sm text-ink">{item}</span>
                      <button className="btn-ghost p-0.5 text-danger shrink-0" onClick={() => removeEquipment(i)}>
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-muted italic">No equipment added yet.</p>
              )}
            </div>
          ))}

          {/* Features & Traits */}
          {section('Features & Traits', featuresOpen, () => setFeaturesOpen(v => !v), (
            <textarea
              className="textarea text-sm"
              rows={4}
              placeholder="Class features, racial traits, feats…"
              value={draft.features}
              onChange={e => setDraft(d => ({ ...d, features: e.target.value }))}
            />
          ))}

          {/* Backstory & Notes */}
          {section('Backstory & Notes', backstoryOpen, () => setBackstoryOpen(v => !v), (
            <div className="space-y-3">
              <div>
                <label className="label">Appearance</label>
                <textarea className="textarea text-sm" rows={2} value={draft.appearance} onChange={e => setDraft(d => ({ ...d, appearance: e.target.value }))} />
              </div>
              <div>
                <label className="label">Backstory</label>
                <textarea className="textarea text-sm" rows={4} value={draft.backstory} onChange={e => setDraft(d => ({ ...d, backstory: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="textarea text-sm" rows={3} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main PlayersPage ──────────────────────────────────────────────────────────

export default function PlayersPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [selectedPcId, setSelectedPcId] = useState<string | null>(searchParams.get('pc'))
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newClass, setNewClass] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['player-characters', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data),
    enabled: !!campaignId,
  })

  const characters: PlayerCharacter[] = data?.items ?? []
  const selectedPc = characters.find(pc => pc.id === selectedPcId) ?? null

  const createMutation = useMutation({
    mutationFn: (body: { name: string; playerName?: string }) =>
      api.post(`/api/campaigns/${campaignId}/player-characters`, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      setSelectedPcId(res.data.item.id)
      setCreating(false)
      setNewName('')
      setNewPlayerName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (pcId: string) =>
      api.delete(`/api/campaigns/${campaignId}/player-characters/${pcId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
      setSelectedPcId(null)
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.patch(`/api/campaigns/${campaignId}/player-characters-reorder`, { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
    },
  })

  function moveCharacter(index: number, direction: -1 | 1) {
    const newOrder = [...characters]
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= newOrder.length) return
    ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
    reorderMutation.mutate(newOrder.map(pc => pc.id))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = characters.findIndex(pc => pc.id === active.id)
    const newIndex = characters.findIndex(pc => pc.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = [...characters]
    newOrder.splice(newIndex, 0, newOrder.splice(oldIndex, 1)[0])
    reorderMutation.mutate(newOrder.map(pc => pc.id))
  }

  function handleCreate() {
    if (!newName.trim()) return
    const cls = DW_CLASSES.find(c => c.name === newClass)
    const templateData = cls ? applyDWTemplate(cls) : null
    createMutation.mutate({
      name: newName.trim(),
      playerName: newPlayerName.trim() || undefined,
      ...(templateData ? {
        class: templateData.class,
        features: templateData.features,
        notes: templateData.notes,
        equipment: templateData.equipment,
        combatStats: templateData.combatStats,
      } : {}),
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="display-font text-3xl font-bold text-ink flex items-center gap-3">
            <Users size={28} className="text-accent" />
            Players
          </h1>
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} /> Add Character
          </button>
        </div>
      </div>

      {/* Add character inline form */}
      {creating && (
        <div className="px-8 py-4 border-b border-border bg-surface-2">
          <div className="flex items-end gap-3 flex-wrap max-w-3xl">
            <div className="flex-1 min-w-32">
              <label className="label">Character Name *</label>
              <input
                className="input text-sm"
                placeholder="Vex the Bold"
                value={newName}
                autoFocus
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <div className="flex-1 min-w-32">
              <label className="label">Player Name</label>
              <input
                className="input text-sm"
                placeholder="Sarah"
                value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <div className="min-w-40">
              <label className="label flex items-center gap-1">
                <BookOpen size={11} className="text-accent" /> DW Class Template
              </label>
              <select
                className="input text-sm"
                value={newClass}
                onChange={e => setNewClass(e.target.value)}
              >
                <option value="">— Blank sheet —</option>
                {DW_CLASSES.map(cls => (
                  <option key={cls.name} value={cls.name}>
                    {cls.name} ({cls.damageDie}, {cls.hpBase}+CON HP)
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn-primary py-2 flex items-center gap-1"
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
            >
              {createMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              Create
            </button>
            <button className="btn-secondary py-2" onClick={() => { setCreating(false); setNewName(''); setNewClass('') }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : characters.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🎲</div>
            <h2 className="display-font text-xl text-ink mb-2">No player characters yet</h2>
            <p className="text-ink-muted text-sm mb-4">
              Add your party members to track their stats and portraits.
            </p>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Add Character
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={characters.map(pc => pc.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {characters.map((pc, index) => (
                  <PCCard
                    key={pc.id}
                    pc={pc}
                    campaignId={campaignId!}
                    onSelect={() => setSelectedPcId(pc.id)}
                    onDelete={() => {
                      if (confirm(`Delete ${pc.name}? This cannot be undone.`)) {
                        deleteMutation.mutate(pc.id)
                      }
                    }}
                    onMoveUp={() => moveCharacter(index, -1)}
                    onMoveDown={() => moveCharacter(index, 1)}
                    isFirst={index === 0}
                    isLast={index === characters.length - 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Sheet editor modal */}
      {selectedPc && (
        <PCSheetEditor
          pc={selectedPc}
          campaignId={campaignId!}
          onClose={() => setSelectedPcId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['player-characters', campaignId] })
          }}
        />
      )}
    </div>
  )
}


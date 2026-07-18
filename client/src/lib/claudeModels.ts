// Shared catalog of user-selectable Claude text models. Kept in one place so the
// Settings, Campaign Settings, and Lore Checker UIs stay in sync.
export interface ClaudeModel {
  value: string
  label: string
  badge: string
  desc: string
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  { value: 'claude-fable-4-5',  label: 'Fable 5',    badge: 'Most capable', desc: 'Research & complex multi-step tasks' },
  { value: 'claude-opus-4-5',   label: 'Opus 4.8',   badge: 'Complex',      desc: 'Agents, coding, nuanced writing' },
  { value: 'claude-sonnet-4-5', label: 'Sonnet 5',   badge: 'Balanced',     desc: 'Everyday tasks, fast & cost-efficient' },
  { value: 'claude-haiku-4-5',  label: 'Haiku 4.5',  badge: 'Fastest',      desc: 'High-volume, lowest cost' },
]

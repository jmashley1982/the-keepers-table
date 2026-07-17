import type { ReactNode } from 'react'
import { EMPTY_STATE_COPY } from '../../lib/emptyStateCopy'

interface EmptyStateProps {
  /** Key into EMPTY_STATE_COPY — supplies icon/title/description unless overridden below. */
  section?: string
  icon?: ReactNode
  title?: string
  description?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ section, icon, title, description, action, className }: EmptyStateProps) {
  const copy = section ? EMPTY_STATE_COPY[section] : undefined
  const resolvedIcon = icon ?? copy?.icon
  const resolvedTitle = title ?? copy?.title ?? 'Nothing here yet'
  const resolvedDescription = description ?? copy?.description

  return (
    <div className={`flex flex-col items-center text-center py-16 px-4 ${className ?? ''}`}>
      {resolvedIcon && (
        <div className="mb-3">
          {typeof resolvedIcon === 'string' ? <span className="text-4xl opacity-80">{resolvedIcon}</span> : resolvedIcon}
        </div>
      )}
      <p className="display-font text-lg font-semibold text-ink">{resolvedTitle}</p>
      {resolvedDescription && (
        <p className="text-sm text-ink-muted mt-1 max-w-sm">{resolvedDescription}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

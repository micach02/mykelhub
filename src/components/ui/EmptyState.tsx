import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string
  message: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-surface text-brand shadow-(--shadow-raise)">
        {icon ?? <Inbox size={20} aria-hidden />}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-2">{message}</p>
      </div>
      {action}
    </div>
  )
}

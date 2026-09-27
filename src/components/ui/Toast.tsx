import { create } from 'zustand'
import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { uid } from '../../lib/utils'

type ToastTone = 'success' | 'info' | 'error'

interface Toast {
  id: string
  tone: ToastTone
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = 'success') =>
    set((s) => ({ toasts: [...s.toasts, { id: uid('tst_'), tone, message }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (m: string) => useToasts.getState().push(m, 'success'),
  info: (m: string) => useToasts.getState().push(m, 'info'),
  error: (m: string) => useToasts.getState().push(m, 'error'),
}

const ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  error: AlertTriangle,
}

const ACCENTS: Record<ToastTone, string> = {
  success: 'var(--status-good)',
  info: 'var(--brand)',
  error: 'var(--status-critical)',
}

function ToastRow({ item }: { item: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  const Icon = ICONS[item.tone]

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(item.id), 3800)
    return () => window.clearTimeout(timer)
  }, [item.id, dismiss])

  return (
    <div
      className="animate-slide-in flex w-80 items-start gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow-pop)]"
      role="status"
    >
      <Icon size={17} style={{ color: ACCENTS[item.tone] }} className="mt-px shrink-0" aria-hidden />
      <p className="flex-1 text-[13px] leading-snug text-ink">{item.message}</p>
      <button
        onClick={() => dismiss(item.id)}
        className="shrink-0 rounded text-muted transition-colors hover:text-ink"
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastRow item={t} />
        </div>
      ))}
    </div>
  )
}

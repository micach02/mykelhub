import { cn } from '../../lib/utils'

/** The "M" tile: the sidebar's logo, and the face of the login page. */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'font-display grid shrink-0 place-items-center font-bold text-white shadow-(--shadow-primary)',
        size === 'lg' ? 'size-14 rounded-[1.25rem] text-[24px]' : 'size-10 rounded-2xl text-[16px]',
      )}
      style={{ background: 'linear-gradient(135deg, var(--brand), var(--series-7))' }}
      aria-hidden
    >
      M
    </span>
  )
}

/** Shown for the moment it takes to pick up a saved sign-in. */
export function Splash() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4">
      <BrandMark size="lg" />
      <p className="text-[13px] text-muted">Opening your store&hellip;</p>
    </div>
  )
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

// Buttons are raised and press in when clicked. The primary action keeps a
// solid brand fill (a gradient with a glow in the futuristic style) so it is
// never hard to find.
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand [background-image:var(--brand-fill)] text-white shadow-(--shadow-primary) hover:brightness-110 active:shadow-[inset_3px_3px_7px_rgb(0_0_0/0.25)]',
  secondary:
    'bg-surface text-ink shadow-(--shadow-control) hover:text-brand active:shadow-(--shadow-inset-sm)',
  ghost: 'text-ink-2 hover:text-ink hover:shadow-(--shadow-control) active:shadow-(--shadow-inset-sm)',
  danger:
    'bg-critical text-white shadow-(--shadow-control) hover:brightness-110 active:shadow-[inset_3px_3px_7px_rgb(0_0_0/0.25)]',
  subtle: 'bg-surface text-ink shadow-(--shadow-inset-sm) hover:text-brand',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-xl px-3.5 text-[13px]',
  md: 'h-10 gap-2 rounded-2xl px-4.5 text-sm',
  lg: 'h-12 gap-2 rounded-2xl px-6 text-[15px]',
  icon: 'h-9 w-9 justify-center rounded-full',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center font-medium whitespace-nowrap transition-[background,color,filter,box-shadow] duration-200',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

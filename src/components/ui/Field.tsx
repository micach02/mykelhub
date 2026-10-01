import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'
import { cn } from '../../lib/utils'

// Soft UI: a field is a well pressed into the page, with no border.
const CONTROL =
  'rounded-xl border-0 bg-surface px-3.5 text-sm text-ink placeholder:text-muted ' +
  'shadow-(--shadow-inset-sm) transition-shadow ' +
  'focus:ring-2 focus:ring-brand/45 focus:outline-none disabled:opacity-50'

/**
 * Controls fill their field unless the caller sets a width. Classes are only
 * joined, not merged, so a caller's `w-auto` beside a built-in `w-full` would
 * lose, and toolbars would stretch one control across the whole row.
 */
const width = (className?: string) => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full')

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className="text-[12px] text-critical">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, width(className), 'h-10', className)} {...rest} />
}

export function NumberInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={cn(CONTROL, width(className), 'tnum h-10', className)}
      {...rest}
    />
  )
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(CONTROL, width(className), 'h-10 cursor-pointer pr-8', className)}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CONTROL, width(className), 'min-h-20 py-2 leading-relaxed', className)}
      {...rest}
    />
  )
}

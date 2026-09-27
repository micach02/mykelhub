import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from './utils'

/** Formatting bound to the store's currency and locale settings. */
export function useFormat() {
  const currency = useStore((s) => s.settings.currency)
  const locale = useStore((s) => s.settings.locale)

  return useMemo(
    () => ({
      currency,
      locale,
      money: (v: number) => formatMoney(v, currency, locale),
      compactMoney: (v: number) => formatCompact(v, locale),
      number: (v: number) => formatNumber(v, locale),
      date: (iso: string) => formatDate(iso, locale),
      dateTime: (iso: string) => formatDateTime(iso, locale),
    }),
    [currency, locale],
  )
}

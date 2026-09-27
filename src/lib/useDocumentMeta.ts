import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { nextCollectionDate } from './analytics'
import type { DocumentMeta } from './pdf'

/** Store details every generated document carries, including the due date. */
export function useDocumentMeta(): DocumentMeta {
  const storeName = useStore((s) => s.settings.storeName)
  const ownerName = useStore((s) => s.settings.ownerName)
  const currency = useStore((s) => s.settings.currency)
  const locale = useStore((s) => s.settings.locale)
  const collectionDay = useStore((s) => s.settings.collectionDay)

  return useMemo(
    () => ({
      storeName,
      ownerName,
      currency,
      locale,
      collectionDue: nextCollectionDate(collectionDay).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    }),
    [storeName, ownerName, currency, locale, collectionDay],
  )
}

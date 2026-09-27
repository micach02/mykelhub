import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, Pencil, SlidersHorizontal } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { StockBadge, Badge } from '../ui/Badge'
import { Table, TableWrap, Td, Th, Tr } from '../ui/Table'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { isLive, marginPct, stockLevel } from '../../lib/analytics'
import type { Product } from '../../types'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className="tnum mt-1 text-[17px] font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[11.5px] text-muted">{hint}</p> : null}
    </div>
  )
}

export function ProductDetailModal({
  product,
  onClose,
  onEdit,
  onAdjust,
}: {
  product: Product | null
  onClose: () => void
  onEdit: (product: Product) => void
  onAdjust: (product: Product) => void
}) {
  const fmt = useFormat()
  const movements = useStore((s) => s.movements)
  const sales = useStore((s) => s.sales)

  const history = useMemo(
    () => (product ? movements.filter((m) => m.productId === product.id).slice(0, 12) : []),
    [movements, product],
  )

  const sold = useMemo(() => {
    if (!product) return { units: 0, revenue: 0, profit: 0 }
    let units = 0
    let revenue = 0
    let profit = 0
    for (const sale of sales) {
      if (!isLive(sale)) continue
      for (const item of sale.items) {
        if (item.productId !== product.id) continue
        units += item.qty
        revenue += item.qty * item.unitPrice
        profit += item.qty * (item.unitPrice - item.unitCost)
      }
    }
    return { units, revenue, profit }
  }, [sales, product])

  if (!product) return null

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={product.name}
      description={product.category}
      footer={
        <>
          <Button onClick={() => onAdjust(product)}>
            <SlidersHorizontal size={15} aria-hidden />
            Adjust stock
          </Button>
          <Button variant="primary" onClick={() => onEdit(product)}>
            <Pencil size={15} aria-hidden />
            Edit
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <StockBadge level={stockLevel(product)} />
        {product.status === 'archived' ? <Badge tone="neutral">Archived</Badge> : null}
        <Badge tone="neutral">
          {fmt.money(product.price)} per {product.unit}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="In stock"
          value={`${product.stock} ${product.unit}`}
          hint={`Reorder at ${product.reorderLevel}`}
        />
        <Stat
          label="Profit per unit"
          value={fmt.money(product.price - product.cost)}
          hint={`${marginPct(product.price, product.cost).toFixed(0)}% margin`}
        />
        <Stat
          label="Tied up in stock"
          value={fmt.money(product.stock * product.cost)}
          hint={`${fmt.money(product.cost)} per ${product.unit}`}
        />
        <Stat
          label="Sold all time"
          value={`${fmt.number(sold.units)} ${product.unit}`}
          hint={`${fmt.money(sold.profit)} profit`}
        />
      </div>

      <h3 className="mt-6 mb-2 text-[13px] font-semibold text-ink">Stock movements</h3>
      {history.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface-2 px-4 py-6 text-center text-[13px] text-ink-2">
          No movements recorded for this product yet.
        </p>
      ) : (
        <TableWrap className="rounded-lg border border-line">
          <Table className="min-w-[440px]">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Reason</Th>
                <Th align="right">Change</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap text-ink-2">{fmt.dateTime(m.createdAt)}</Td>
                  <Td>
                    {m.reason}
                    {m.reference ? (
                      <span className="ml-1.5 text-[11.5px] text-muted">{m.reference}</span>
                    ) : null}
                  </Td>
                  <Td align="right">
                    <span
                      className="tnum inline-flex items-center gap-1 font-semibold"
                      style={{ color: m.qty >= 0 ? 'var(--delta-up)' : 'var(--status-critical)' }}
                    >
                      {m.qty >= 0 ? (
                        <ArrowUpRight size={13} aria-hidden />
                      ) : (
                        <ArrowDownLeft size={13} aria-hidden />
                      )}
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Modal>
  )
}

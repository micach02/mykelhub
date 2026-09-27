import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Boxes,
  Download,
  Pencil,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SearchInput } from '../components/ui/SearchInput'
import { Select } from '../components/ui/Field'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Table, TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { StockBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog } from '../components/ui/Modal'
import { StatTile } from '../components/ui/StatTile'
import { toast } from '../components/ui/Toast'
import { ProductFormModal } from '../components/inventory/ProductFormModal'
import { StockAdjustModal } from '../components/inventory/StockAdjustModal'
import { ProductDetailModal } from '../components/inventory/ProductDetailModal'
import { useStore } from '../store/useStore'
import { useFormat } from '../lib/useFormat'
import { inventoryValue, lowStock, marginPct, stockLevel } from '../lib/analytics'
import { downloadCsv } from '../lib/utils'
import { downloadPriceListPdf } from '../lib/pdf'
import { useDocumentMeta } from '../lib/useDocumentMeta'
import type { Product } from '../types'

type SortKey = 'name' | 'category' | 'stock' | 'price' | 'value'
type StockFilter = 'all' | 'low' | 'out'

export function Inventory() {
  const fmt = useFormat()
  const [params, setParams] = useSearchParams()
  const products = useStore((s) => s.products)
  const setProductStatus = useStore((s) => s.setProductStatus)
  const deleteProduct = useStore((s) => s.deleteProduct)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'name',
    dir: 'asc',
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [savingList, setSavingList] = useState(false)
  const meta = useDocumentMeta()

  // Deep links from the topbar search and the dashboard alerts.
  useEffect(() => {
    const filter = params.get('filter')
    if (filter === 'low') setStockFilter('low')

    const focus = params.get('focus')
    if (focus) {
      const match = products.find((p) => p.id === focus)
      if (match) setDetail(match)
    }
    if (filter || focus) setParams({}, { replace: true })
  }, [params, products, setParams])

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b)),
    [products],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = products.filter((p) => {
      if (!showArchived && p.status === 'archived') return false
      if (category !== 'all' && p.category !== category) return false
      if (stockFilter !== 'all') {
        const level = stockLevel(p)
        if (stockFilter === 'low' && level === 'ok') return false
        if (stockFilter === 'out' && level !== 'out') return false
      }
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    })

    const direction = sort.dir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      switch (sort.key) {
        case 'stock':
          return (a.stock - b.stock) * direction
        case 'price':
          return (a.price - b.price) * direction
        case 'value':
          return (a.stock * a.cost - b.stock * b.cost) * direction
        case 'category':
          return (a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) * direction
        default:
          return a.name.localeCompare(b.name) * direction
      }
    })
  }, [products, query, category, stockFilter, showArchived, sort])

  const value = useMemo(() => inventoryValue(products), [products])
  const restockList = useMemo(() => lowStock(products), [products])
  const restockCost = useMemo(
    () =>
      restockList.reduce((sum, p) => sum + Math.max(p.reorderLevel * 2 - p.stock, 0) * p.cost, 0),
    [restockList],
  )

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const sortProps = (key: SortKey) => ({
    sortable: true,
    active: sort.key === key,
    direction: sort.dir,
    onSort: () => toggleSort(key),
  })

  /** A customer-facing menu: what things cost, no cost price on it. */
  async function downloadPriceList() {
    const sellable = products.filter((p) => p.status === 'active')
    if (sellable.length === 0) {
      toast.info('Add some products first.')
      return
    }
    setSavingList(true)
    try {
      await downloadPriceListPdf({
        items: sellable.map((p) => ({
          name: p.name,
          category: p.category,
          unit: p.unit,
          price: p.price,
        })),
        meta,
      })
      toast.success(`Price list for ${sellable.length} products downloaded.`)
    } catch {
      toast.error('The price list could not be prepared.')
    } finally {
      setSavingList(false)
    }
  }

  function exportCsv() {
    downloadCsv(
      `mykelhub-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((p) => ({
        Product: p.name,
        Category: p.category,
        Unit: p.unit,
        Stock: p.stock,
        'Reorder level': p.reorderLevel,
        Cost: p.cost,
        'Selling price': p.price,
        'Profit per unit': Math.round((p.price - p.cost) * 100) / 100,
        'Stock value': Math.round(p.stock * p.cost * 100) / 100,
        Status: p.status,
      })),
    )
    toast.success(`Exported ${rows.length} products.`)
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="What you stock, how much is left, and what needs buying."
        actions={
          <>
            <Button onClick={exportCsv} disabled={rows.length === 0}>
              <Download size={15} aria-hidden />
              Export
            </Button>
            <Button onClick={downloadPriceList} disabled={savingList}>
              <Receipt size={15} aria-hidden />
              {savingList ? 'Preparing…' : 'Price list'}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus size={16} aria-hidden />
              Add product
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Tied up in stock"
          value={fmt.money(value.atCost)}
          deltaLabel={`${value.skus} products`}
        />
        <StatTile
          label="Worth if all sold"
          value={fmt.money(value.atRetail)}
          deltaLabel={`${fmt.money(value.atRetail - value.atCost)} profit`}
        />
        <StatTile
          label="Items on the shelf"
          value={fmt.number(value.units)}
          deltaLabel="across all products"
        />
        <StatTile
          label="Needs restocking"
          value={fmt.number(restockList.length)}
          deltaLabel={
            restockList.length === 0
              ? 'everything is stocked'
              : `${fmt.money(restockCost)} to refill`
          }
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a product"
            className="lg:max-w-xs lg:flex-1"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
              className="w-auto min-w-36"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <SegmentedControl
              ariaLabel="Stock level"
              size="sm"
              value={stockFilter}
              onChange={setStockFilter}
              segments={[
                { value: 'all', label: 'All' },
                { value: 'low', label: 'Running low' },
                { value: 'out', label: 'Out' },
              ]}
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-ink-2 select-none hover:bg-surface-2">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="size-3.5 accent-brand"
              />
              Archived
            </label>
          </div>
          <p className="text-[12.5px] text-muted lg:ml-auto">
            {rows.length} of {products.length}
          </p>
        </div>

        {rows.length === 0 ? (
          products.length === 0 ? (
            <EmptyState
              title="No products yet"
              message="Add what you sell: snacks, coffee, canned goods, noodles, pancit canton. Or load the demo store from Settings."
              icon={<Boxes size={20} aria-hidden />}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus size={15} aria-hidden />
                  Add product
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No matches"
              message="Try clearing the search or changing the filters."
              icon={<Boxes size={20} aria-hidden />}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setCategory('all')
                    setStockFilter('all')
                  }}
                >
                  Show all
                </Button>
              }
            />
          )
        ) : (
          <TableWrap>
            <Table className="min-w-[880px]">
              <thead>
                <tr>
                  <Th {...sortProps('name')}>Product</Th>
                  <Th {...sortProps('category')}>Category</Th>
                  <Th align="right" {...sortProps('stock')}>
                    In stock
                  </Th>
                  <Th align="right">Cost</Th>
                  <Th align="right" {...sortProps('price')}>
                    Price
                  </Th>
                  <Th align="right">Profit</Th>
                  <Th align="right" {...sortProps('value')}>
                    Stock value
                  </Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <Tr key={p.id} onClick={() => setDetail(p)}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td className="text-ink-2">{p.category}</Td>
                    <Td align="right" numeric>
                      <span className="font-medium">{p.stock}</span>
                      <span className="text-muted"> {p.unit}</span>
                    </Td>
                    <Td align="right" numeric className="text-ink-2">
                      {fmt.money(p.cost)}
                    </Td>
                    <Td align="right" numeric>
                      {fmt.money(p.price)}
                    </Td>
                    <Td align="right" numeric className="text-ink-2">
                      {fmt.money(p.price - p.cost)}
                      <span className="ml-1 text-[11px] text-muted">
                        {marginPct(p.price, p.cost).toFixed(0)}%
                      </span>
                    </Td>
                    <Td align="right" numeric className="font-medium">
                      {fmt.money(p.stock * p.cost)}
                    </Td>
                    <Td>
                      <StockBadge level={stockLevel(p)} />
                    </Td>
                    <Td align="right">
                      <span
                        className="flex items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Adjust stock for ${p.name}`}
                          title="Adjust stock"
                          onClick={() => setAdjusting(p)}
                        >
                          <SlidersHorizontal size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${p.name}`}
                          title="Edit"
                          onClick={() => {
                            setEditing(p)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={
                            p.status === 'active' ? `Archive ${p.name}` : `Restore ${p.name}`
                          }
                          title={p.status === 'active' ? 'Archive' : 'Restore'}
                          onClick={() => {
                            const next = p.status === 'active' ? 'archived' : 'active'
                            setProductStatus(p.id, next)
                            toast.info(
                              `${p.name} ${next === 'archived' ? 'archived' : 'restored to active'}.`,
                            )
                          }}
                        >
                          {p.status === 'active' ? (
                            <Archive size={15} />
                          ) : (
                            <ArchiveRestore size={15} />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${p.name}`}
                          title="Delete"
                          onClick={() => setPendingDelete(p)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <ProductFormModal
        open={formOpen}
        product={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
      />

      <StockAdjustModal
        open={adjusting !== null}
        product={adjusting}
        onClose={() => setAdjusting(null)}
      />

      {detail ? (
        <ProductDetailModal
          product={products.find((p) => p.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onEdit={(p) => {
            setDetail(null)
            setEditing(p)
            setFormOpen(true)
          }}
          onAdjust={(p) => {
            setDetail(null)
            setAdjusting(p)
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteProduct(pendingDelete.id)
          toast.info(`${pendingDelete.name} deleted.`)
        }}
        title="Delete this product?"
        message={`${pendingDelete?.name ?? ''} and its stock movement history will be removed. Archiving is safer if you might sell it again.`}
        confirmLabel="Delete product"
        destructive
      />
    </>
  )
}

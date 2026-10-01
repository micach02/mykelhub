import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Boxes,
  ClipboardList,
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
import { Badge, StockBadge } from '../components/ui/Badge'
import { Pagination, usePagination } from '../components/ui/Pagination'
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
import { downloadCsv, plural } from '../lib/utils'
import { downloadPriceListPdf, downloadRestockListPdf } from '../lib/pdf'
import { useDocumentMeta } from '../lib/useDocumentMeta'
import type { Product } from '../types'

type SortKey = 'name' | 'category' | 'stock' | 'price' | 'value'
type StockFilter = 'all' | 'low' | 'out'
/** Archived products are kept for their history but sold no more. */
type View = 'active' | 'archived'

const PAGE_SIZE = 25

export function Inventory() {
  const fmt = useFormat()
  const [params, setParams] = useSearchParams()
  const products = useStore((s) => s.products)
  const setProductStatus = useStore((s) => s.setProductStatus)
  const deleteProduct = useStore((s) => s.deleteProduct)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [view, setView] = useState<View>('active')
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
  const [savingRestock, setSavingRestock] = useState(false)
  const meta = useDocumentMeta()

  // Deep links from the topbar search and the dashboard alerts.
  useEffect(() => {
    const filter = params.get('filter')
    if (filter === 'low') {
      setView('active')
      setStockFilter('low')
    }

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
      if ((p.status === 'archived') !== (view === 'archived')) return false
      if (category !== 'all' && p.category !== category) return false
      // Stock levels only matter for what is still sold.
      if (view === 'active' && stockFilter !== 'all') {
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
  }, [products, query, category, stockFilter, view, sort])

  const pager = usePagination(rows, PAGE_SIZE, [query, category, stockFilter, view, sort])
  const archivedCount = useMemo(
    () => products.filter((p) => p.status === 'archived').length,
    [products],
  )
  const activeCount = products.length - archivedCount

  const value = useMemo(() => inventoryValue(products), [products])
  const restockList = useMemo(() => lowStock(products), [products])
  const restockCost = useMemo(
    () =>
      restockList.reduce((sum, p) => sum + Math.max(p.reorderLevel * 2 - p.stock, 0) * p.cost, 0),
    [restockList],
  )

  /** Archive or restore, and say where the product went. */
  function setStatus(p: Product, next: Product['status']) {
    setProductStatus(p.id, next)
    toast.info(
      next === 'archived'
        ? `${p.name} archived. Find it under Archived.`
        : `${p.name} is back in Active.`,
    )
  }

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
      toast.success(`Price list for ${plural(sellable.length, 'product')} downloaded.`)
    } catch {
      toast.error('The price list could not be prepared.')
    } finally {
      setSavingList(false)
    }
  }

  /** Out of stock and running low, to take to the wholesaler. */
  async function downloadRestockList() {
    if (restockList.length === 0) {
      toast.info('Nothing is running low. Everything is stocked.')
      return
    }
    setSavingRestock(true)
    try {
      await downloadRestockListPdf({
        items: restockList.map((p) => ({
          name: p.name,
          category: p.category,
          unit: p.unit,
          stock: p.stock,
          reorderLevel: p.reorderLevel,
          cost: p.cost,
        })),
        meta,
      })
      toast.success(`Restock list for ${plural(restockList.length, 'product')} downloaded.`)
    } catch {
      toast.error('The restock list could not be prepared.')
    } finally {
      setSavingRestock(false)
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
    toast.success(`Exported ${plural(rows.length, 'product')}.`)
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
            <Button onClick={downloadRestockList} disabled={savingRestock}>
              <ClipboardList size={15} aria-hidden />
              {savingRestock ? 'Preparing…' : 'Restock list'}
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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Tied up in stock"
          value={fmt.money(value.atCost)}
          deltaLabel={plural(value.skus, 'product')}
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
          <SegmentedControl
            ariaLabel="Which products"
            value={view}
            onChange={setView}
            segments={[
              { value: 'active', label: `Active (${activeCount})` },
              { value: 'archived', label: `Archived (${archivedCount})` },
            ]}
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={view === 'archived' ? 'Search archived products' : 'Search a product'}
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
            {view === 'active' ? (
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
            ) : null}
          </div>
          <p className="text-[12.5px] text-muted lg:ml-auto">{plural(rows.length, 'product')}</p>
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
          ) : view === 'archived' && archivedCount === 0 ? (
            <EmptyState
              title="Nothing archived"
              message="Archive a product you no longer sell. It leaves sales, the price list and the restock list, but keeps its history, and you can restore it here any time."
              icon={<Archive size={20} aria-hidden />}
              action={
                <Button size="sm" onClick={() => setView('active')}>
                  Back to active products
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
                {pager.visible.map((p) => (
                  <Tr key={p.id} onClick={() => setDetail(p)}>
                    <Td className="min-w-40 font-medium">{p.name}</Td>
                    <Td className="text-ink-2">{p.category}</Td>
                    <Td align="right" numeric className="whitespace-nowrap">
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
                      {p.status === 'archived' ? (
                        <Badge tone="neutral" icon={<Archive size={12} aria-hidden />}>
                          Archived
                        </Badge>
                      ) : (
                        <StockBadge level={stockLevel(p)} />
                      )}
                    </Td>
                    <Td align="right">
                      <span
                        className="flex items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.status === 'archived' ? (
                          <Button size="sm" className="mr-1" onClick={() => setStatus(p, 'active')}>
                            <ArchiveRestore size={14} aria-hidden />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Adjust stock for ${p.name}`}
                            title="Adjust stock"
                            onClick={() => setAdjusting(p)}
                          >
                            <SlidersHorizontal size={15} />
                          </Button>
                        )}
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
                        {p.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Archive ${p.name}`}
                            title="Archive"
                            onClick={() => setStatus(p, 'archived')}
                          >
                            <Archive size={15} />
                          </Button>
                        ) : null}
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
        <Pagination {...pager} onPage={pager.setPage} noun="product" />
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

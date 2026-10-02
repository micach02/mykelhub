import { useRef, useState } from 'react'
import { Database, Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, NumberInput, Select, TextInput } from '../components/ui/Field'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { ConfirmDialog } from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'
import { useStore } from '../store/useStore'
import { normalisePaymentMethod } from '../lib/labels'
import { DataFileCard } from '../components/settings/DataFileCard'
import { CloudCard } from '../components/settings/CloudCard'
import { DEFAULT_UI_STYLE, type ThemePreference, type UiStyle } from '../types'

const CURRENCIES = ['PHP', 'USD', 'SGD', 'AED', 'HKD']
const LOCALES = [
  ['en-PH', 'English (Philippines)'],
  ['fil-PH', 'Filipino (Philippines)'],
  ['en-US', 'English (United States)'],
]

export function Settings() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const loadDemoData = useStore((s) => s.loadDemoData)
  const clearAllData = useStore((s) => s.clearAllData)
  const importData = useStore((s) => s.importData)

  // Selected one at a time: a selector returning a fresh object would change
  // identity on every render.
  const counts = {
    products: useStore((s) => s.products.length),
    customers: useStore((s) => s.customers.length),
    sales: useStore((s) => s.sales.length),
    payments: useStore((s) => s.payments.length),
    parkers: useStore((s) => s.customers.filter((c) => c.parkingRate).length),
    movements: useStore((s) => s.movements.length),
    vault: useStore((s) => s.vault.length),
  }

  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  function exportBackup() {
    const state = useStore.getState()
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 7,
      products: state.products,
      customers: state.customers,
      sales: state.sales,
      payments: state.payments,
      movements: state.movements,
      vault: state.vault,
      settings: state.settings,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mykelhub-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Backup downloaded.')
  }

  async function importBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.customers)) {
        throw new Error('missing products or customers')
      }
      importData({
        products: parsed.products,
        customers: parsed.customers,
        // A backup may predate a rename, and restoring bypasses the store
        // migration, so stored values are brought up to date here.
        sales: (parsed.sales ?? []).map((s: { settlement: string }) =>
          s.settlement === 'gcash' ? { ...s, settlement: 'maya' } : s,
        ),
        payments: (parsed.payments ?? []).map((p: { method: string }) => ({
          ...p,
          method: normalisePaymentMethod(p.method),
        })),
        movements: parsed.movements ?? [],
        vault: parsed.vault ?? [],
      })
      if (parsed.settings) updateSettings(parsed.settings)
      toast.success(
        `Restored ${parsed.products.length} products and ${parsed.customers.length} customers.`,
      )
    } catch {
      toast.error('That file is not a valid MykelHub backup.')
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your store, the defaults, and the data." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Store" subtitle="Shown throughout the app" />
          <CardBody className="flex flex-col gap-4">
            <Field label="Store name">
              {(id) => (
                <TextInput
                  id={id}
                  value={settings.storeName}
                  onChange={(e) => updateSettings({ storeName: e.target.value })}
                />
              )}
            </Field>
            <Field label="Owner">
              {(id) => (
                <TextInput
                  id={id}
                  value={settings.ownerName}
                  onChange={(e) => updateSettings({ ownerName: e.target.value })}
                />
              )}
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Currency">
                {(id) => (
                  <Select
                    id={id}
                    value={settings.currency}
                    onChange={(e) => updateSettings({ currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Number and date format">
                {(id) => (
                  <Select
                    id={id}
                    value={settings.locale}
                    onChange={(e) => updateSettings({ locale: e.target.value })}
                  >
                    {LOCALES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Defaults" subtitle="For new products and for credit" />
          <CardBody className="flex flex-col gap-4">
            <Field
              label="Default reorder level"
              hint="Pre-filled when you add a product. Each one can override it."
            >
              {(id) => (
                <NumberInput
                  id={id}
                  min={0}
                  step="1"
                  value={settings.defaultReorderLevel}
                  onChange={(e) =>
                    updateSettings({ defaultReorderLevel: Number(e.target.value) || 0 })
                  }
                />
              )}
            </Field>
            <Field
              label="Overdue after (days)"
              hint="Balances older than this are flagged red on the credit page."
            >
              {(id) => (
                <NumberInput
                  id={id}
                  min={1}
                  step="1"
                  value={settings.overdueAfterDays}
                  onChange={(e) =>
                    updateSettings({ overdueAfterDays: Math.max(1, Number(e.target.value) || 30) })
                  }
                />
              )}
            </Field>
            <Field
              label="Collect payments on or before"
              hint="Day of the month. Each month's parking fee falls due on it, and statements and receipts show it as the due date."
            >
              {(id) => (
                <NumberInput
                  id={id}
                  min={1}
                  max={28}
                  step="1"
                  value={settings.collectionDay}
                  onChange={(e) =>
                    updateSettings({
                      collectionDay: Math.min(28, Math.max(1, Number(e.target.value) || 15)),
                    })
                  }
                />
              )}
            </Field>
            <Field
              label="Default parking rate"
              hint="Pre-filled monthly rate when you add a parker."
            >
              {(id) => (
                <NumberInput
                  id={id}
                  min={0}
                  step="50"
                  value={settings.defaultParkingRate}
                  onChange={(e) =>
                    updateSettings({ defaultParkingRate: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              )}
            </Field>
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">Appearance</p>
                <SegmentedControl
                  ariaLabel="Theme"
                  value={settings.theme}
                  onChange={(theme: ThemePreference) => updateSettings({ theme })}
                  segments={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'System' },
                  ]}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">Style</p>
                <SegmentedControl
                  ariaLabel="Style"
                  value={settings.style ?? DEFAULT_UI_STYLE}
                  onChange={(style: UiStyle) => updateSettings({ style })}
                  segments={[
                    { value: 'futuristic', label: 'Futuristic' },
                    { value: 'soft', label: 'Soft' },
                  ]}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <CloudCard />

      <DataFileCard />

      <Card className="mt-4">
        <CardHeader
          title="Data"
          subtitle="Everything lives in this browser. Back it up before clearing site data."
        />
        <CardBody>
          <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {[
              ['Products', counts.products],
              ['Customers', counts.customers],
              ['On parking', counts.parkers],
              ['Sales', counts.sales],
              ['Payments', counts.payments],
              ['Stock movements', counts.movements],
              ['Vault entries', counts.vault],
            ].map(([label, count]) => (
              <div key={label} className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-3.5 py-3">
                <dt className="text-[12px] text-ink-2">{label}</dt>
                <dd className="tnum mt-0.5 text-[18px] font-semibold text-ink">{count}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button onClick={exportBackup}>
              <Download size={15} aria-hidden />
              Export backup (JSON)
            </Button>
            <Button onClick={() => fileInput.current?.click()}>
              <Upload size={15} aria-hidden />
              Restore from backup
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importBackup(file)
                e.target.value = ''
              }}
            />
            <Button onClick={() => setConfirmDemo(true)}>
              <RefreshCw size={15} aria-hidden />
              Load demo data
            </Button>
            <Button variant="danger" onClick={() => setConfirmClear(true)}>
              <Trash2 size={15} aria-hidden />
              Clear all data
            </Button>
          </div>

          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <Database size={14} className="mt-0.5 shrink-0" aria-hidden />
            MykelHub has no server behind it. Clearing your browser's site data for this address
            deletes everything, so export a backup now and then.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        onConfirm={() => {
          loadDemoData()
          toast.success('Demo sari-sari store loaded.')
        }}
        title="Load demo data?"
        message="A sample store: 33 products, 8 customers, and two months of sales and credit. It replaces whatever is in the workspace now."
        confirmLabel="Load demo data"
        destructive
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAllData()
          toast.info('Everything cleared. Start by adding products.')
        }}
        title="Clear all data?"
        message="Every product, customer, credit balance, payment, and sale will be deleted. This cannot be undone, so export a backup first if you might want it back."
        confirmLabel="Delete everything"
        destructive
      />
    </>
  )
}

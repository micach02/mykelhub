import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, NumberInput, Select, TextInput } from '../ui/Field'
import { SegmentedControl } from '../ui/SegmentedControl'
import { toast } from '../ui/Toast'
import { useStore } from '../../store/useStore'
import { useFormat } from '../../lib/useFormat'
import { vaultBalance } from '../../lib/analytics'

type Mode = 'in' | 'out' | 'count'

const OUT_REASONS = [
  'Paid the wholesaler',
  'Owner withdrawal',
  'Change fund',
  'Bills and utilities',
  'Deposited to bank',
]

/** Putting money into the drawer, taking it out, or correcting it to a count. */
export function VaultAdjustModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fmt = useFormat()
  const vault = useStore((s) => s.vault)
  const adjustVault = useStore((s) => s.adjustVault)
  const countVault = useStore((s) => s.countVault)

  const [mode, setMode] = useState<Mode>('in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(OUT_REASONS[0])
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setMode('in')
    setAmount('')
    setReason(OUT_REASONS[0])
    setNote('')
  }, [open])

  const current = vaultBalance(vault)
  const value = Math.max(0, Number(amount) || 0)
  const resulting =
    mode === 'in' ? current + value : mode === 'out' ? current - value : value
  const difference = resulting - current

  const valid = amount !== '' && (mode === 'count' ? value !== current : value > 0)

  function apply() {
    if (!valid) return
    if (mode === 'in') {
      adjustVault(value, note.trim() || 'Cash added')
      toast.success(`${fmt.money(value)} added to the vault.`)
    } else if (mode === 'out') {
      adjustVault(-value, note.trim() || reason)
      toast.success(`${fmt.money(value)} taken out, ${reason.toLowerCase()}.`)
    } else {
      countVault(value, note.trim() || undefined)
      toast.success(
        difference === 0
          ? 'The drawer matches.'
          : `Vault set to ${fmt.money(value)}, ${difference > 0 ? 'up' : 'down'} ${fmt.money(Math.abs(difference))}.`,
      )
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust the vault"
      description="Money you put in or take out by hand. Cash sales and payments go in on their own."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={!valid}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="Type of adjustment"
          value={mode}
          onChange={setMode}
          segments={[
            { value: 'in', label: 'Put money in' },
            { value: 'out', label: 'Take money out' },
            { value: 'count', label: 'Count the drawer' },
          ]}
        />

        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3">
          <div>
            <p className="text-[12px] text-ink-2">In the vault now</p>
            <p className="tnum text-lg font-semibold text-ink">{fmt.money(current)}</p>
          </div>
          <span className="text-muted" aria-hidden>
            &rarr;
          </span>
          <div className="text-right">
            <p className="text-[12px] text-ink-2">After</p>
            <p className="tnum text-lg font-semibold text-ink">{fmt.money(resulting)}</p>
          </div>
        </div>

        <Field
          label={mode === 'count' ? 'How much did you count?' : 'How much?'}
          required
          hint={
            mode === 'count'
              ? difference !== 0 && amount !== ''
                ? `${difference > 0 ? 'Over' : 'Short'} by ${fmt.money(Math.abs(difference))} against the running total.`
                : 'Enter the cash actually in the drawer.'
              : undefined
          }
        >
          {(id) => (
            <NumberInput
              id={id}
              min={0}
              step="10"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          )}
        </Field>

        {mode === 'out' ? (
          <Field label="What for?" required>
            {(id) => (
              <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                {OUT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Field label="Note" hint="Optional. Shown in the vault history.">
          {(id) => (
            <TextInput
              id={id}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === 'count' ? 'e.g. end of day count' : 'Optional'}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

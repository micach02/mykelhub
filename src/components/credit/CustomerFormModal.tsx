import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, TextInput, Textarea } from '../ui/Field'
import { toast } from '../ui/Toast'
import { useStore } from '../../store/useStore'
import type { Customer } from '../../types'

interface FormState {
  name: string
  phone: string
  notes: string
}

const EMPTY: FormState = { name: '', phone: '', notes: '' }

export function CustomerFormModal({
  open,
  onClose,
  customer,
}: {
  open: boolean
  onClose: () => void
  customer: Customer | null
}) {
  const addCustomer = useStore((s) => s.addCustomer)
  const updateCustomer = useStore((s) => s.updateCustomer)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      customer
        ? {
            name: customer.name,
            phone: customer.phone,
            notes: customer.notes ?? '',
          }
        : EMPTY,
    )
  }, [open, customer])

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  function submit() {
    if (!form.name.trim()) {
      setError('A name is required.')
      return
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      notes: form.notes.trim() || undefined,
    }
    if (customer) {
      updateCustomer(customer.id, payload)
      toast.success(`${payload.name} updated.`)
    } else {
      // Parking is set separately, on the Parking page.
      addCustomer({ ...payload, parkingRate: null, parkingSince: null, parkingUntil: null })
      toast.success(`${payload.name} added.`)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? 'Edit customer' : 'Add customer'}
      description="Only customers who buy on credit need a record here. Cash buyers do not."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required error={error} className="sm:col-span-2">
          {(id) => (
            <TextInput
              id={id}
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="e.g. Nena Santos"
            />
          )}
        </Field>
        <Field label="Mobile number">
          {(id) => (
            <TextInput
              id={id}
              value={form.phone}
              onChange={(e) => set('phone')(e.target.value)}
              placeholder="0917 000 0000"
            />
          )}
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          {(id) => (
            <Textarea
              id={id}
              value={form.notes}
              onChange={(e) => set('notes')(e.target.value)}
              placeholder="e.g. pays on the 15th and 30th"
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

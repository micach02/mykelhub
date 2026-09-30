import type { RowInput } from 'jspdf-autotable'
import type { Account, AppliedTo, OutstandingCharge } from './analytics'
import { amountInWords } from './words'
import { paymentMethodLabel } from './labels'
import type { Customer, Payment } from '../types'

/**
 * PDFs are drawn rather than screenshotted, so the text stays selectable and
 * the file stays small. jsPDF is pulled in on demand: it is far bigger than
 * anything else here and most sessions never download a document.
 */
async function newDocument() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true })
}

/**
 * Every document is on Philippine long bond, 8.5 by 13 inches: it is what a
 * sari-sari store has in the printer. Not US Legal, which is 8.5 by 14 and
 * will leave a blank strip at the foot of a page printed on long.
 */
const PAGE_WIDTH = 215.9
const PAGE_HEIGHT = 330.2

/** Peso and other signs are not in the built-in PDF fonts; spell the code. */
function plainMoney(value: number, currency: string, locale: string): string {
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `${currency} ${amount}`
}

function safeName(text: string): string {
  return text.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}

export interface DocumentMeta {
  storeName: string
  ownerName: string
  currency: string
  locale: string
  /** Formatted date money is collected on or before, e.g. "15 Oct 2026". */
  collectionDue?: string
}

// ---------------------------------------------------------------------------
// Payment receipt
// ---------------------------------------------------------------------------

/**
 * A 76mm slip centred on the page, so it can be cut out or handed over as is.
 */
interface SettledGroup {
  kind: AppliedTo['kind']
  label: string
  rows: AppliedTo[]
  total: number
}

/** Parking months and goods, each together, so the slip reads in sections. */
function groupSettled(settled: AppliedTo[]): SettledGroup[] {
  const order: Array<{ kind: AppliedTo['kind']; label: string }> = [
    { kind: 'parking', label: 'Parking' },
    { kind: 'goods', label: 'Goods' },
  ]
  return order
    .map(({ kind, label }) => {
      const rows = settled.filter((row) => row.kind === kind)
      return { kind, label, rows, total: rows.reduce((t, r) => t + r.applied, 0) }
    })
    .filter((group) => group.rows.length > 0)
}

export interface ReceiptInput {
  payment: Payment
  customer: Customer
  balanceBefore: number
  balanceAfter: number
  /** What this payment settled, oldest charge first. */
  settled?: AppliedTo[]
  meta: DocumentMeta
}

export async function buildReceiptPdf(opts: ReceiptInput) {
  const { payment, customer, balanceBefore, balanceAfter, settled = [], meta } = opts
  const doc = await newDocument()
  const money = (v: number) => plainMoney(v, meta.currency, meta.locale)

  const W = 76
  const left = (PAGE_WIDTH - W) / 2
  const right = left + W
  const mid = left + W / 2

  // Lay the slip out once to measure it, then draw it centred vertically.
  const wordsLines = doc.splitTextToSize(
    amountInWords(payment.amount, meta.currency),
    W - 4,
  ) as string[]
  const dateShort = (iso: string) =>
    new Date(iso).toLocaleDateString(meta.locale, { day: 'numeric', month: 'short' })

  const groups = groupSettled(settled)
  const showGroups = groups.length > 1

  const rows: Array<[string, string]> = [
    ['Received from', customer.name],
    ['Paid with', paymentMethodLabel(payment.method)],
  ]
  if (payment.note) rows.push(['For', payment.note])

  // Measured the same way it is drawn, so the slip stays centred: a heading
  // per group, a line per charge, a line per item, and a note where part paid.
  const settledHeight =
    settled.length > 0
      ? 6 +
        4 +
        (showGroups ? groups.length * 4 : 0) +
        settled.reduce(
          (t, row) => t + 4 + row.items.length * 3.4 + (row.cleared ? 0 : 3.4) + 1,
          0,
        )
      : 0
  const height =
    8 + 5 + 6 + 11 + wordsLines.length * 4 + 6 + rows.length * 5 + settledHeight +
    8 + 3 * 5 + 4 + 12
  let y = Math.max(16, (PAGE_HEIGHT - height) / 2)

  /**
   * A long settlement can outrun the page. Carry on overleaf rather than
   * drawing past the bottom, where the text is simply lost.
   */
  const needRoom = (height: number) => {
    if (y + height <= PAGE_HEIGHT - 14) return
    doc.addPage()
    y = 20
  }

  const dashed = (atY: number) => {
    doc.setDrawColor(120)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([0.8, 0.8], 0)
    doc.line(left, atY, right, atY)
    doc.setLineDashPattern([], 0)
  }
  const solid = (atY: number) => {
    doc.setDrawColor(0)
    doc.setLineWidth(0.4)
    doc.line(left, atY, right, atY)
  }

  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0)
  doc.text(meta.storeName, mid, y, { align: 'center' })
  y += 5

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90)
  doc.text('PAYMENT RECEIPT', mid, y, { align: 'center' })
  y += 3
  dashed(y)
  y += 5

  doc.setFontSize(8).setTextColor(90)
  doc.text(`RCPT-${payment.id.slice(-6).toUpperCase()}`, left, y)
  doc.text(new Date(payment.createdAt).toLocaleDateString(meta.locale), right, y, {
    align: 'right',
  })
  y += 9

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(0)
  doc.text(money(payment.amount), mid, y, { align: 'center' })
  y += 5

  doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(70)
  for (const line of wordsLines) {
    doc.text(line, mid, y, { align: 'center' })
    y += 4
  }
  y += 3

  doc.setFont('helvetica', 'normal').setFontSize(9)
  for (const [label, value] of rows) {
    doc.setTextColor(90)
    doc.text(label, left, y)
    doc.setTextColor(0).setFont('helvetica', 'bold')
    doc.text(String(value), right, y, { align: 'right', maxWidth: W - 30 })
    doc.setFont('helvetica', 'normal')
    y += 5
  }

  if (settled.length > 0) {
    y += 1
    dashed(y)
    y += 5
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(90)
    doc.text('THIS PAYMENT SETTLED', left, y)
    y += 4.5

    for (const group of groupSettled(settled)) {
      if (showGroups) {
        doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(110)
        doc.text(group.label.toUpperCase(), left, y)
        doc.text(money(group.total), right, y, { align: 'right' })
        y += 4
      }

      for (const row of group.rows) {
        // Keep a charge and its items together where they fit.
        needRoom(4 + row.items.length * 3.4 + (row.cleared ? 0 : 3.4))
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(40)
        const heading = row.kind === 'parking' ? row.description : dateShort(row.at)
        doc.text(heading, left, y, { maxWidth: W - 26 })
        doc.setTextColor(0)
        doc.text(money(row.applied), right, y, { align: 'right' })
        y += 4

        // Every item, wrapped. The old version kept only the first wrapped
        // line, so anything past it silently vanished from the receipt.
        doc.setFontSize(7.5).setTextColor(90)
        for (const line of row.items) {
          const wrapped = doc.splitTextToSize(`${line.qty} x ${line.name}`, W - 8) as string[]
          for (const part of wrapped) {
            needRoom(3.4)
            doc.text(part, left + 3, y)
            y += 3.4
          }
        }

        if (!row.cleared) {
          doc.setFontSize(7).setTextColor(120)
          doc.text(`part of ${money(row.chargeAmount)}`, left + 3, y)
          y += 3.4
        }
        y += 1
      }
    }
  }

  y += 2
  needRoom(34)
  dashed(y)
  y += 5

  const totals: Array<[string, string]> = [
    ['Balance before', money(balanceBefore)],
    ['This payment', `- ${money(payment.amount)}`],
  ]
  doc.setFontSize(9)
  for (const [label, value] of totals) {
    doc.setTextColor(90)
    doc.text(label, left, y)
    doc.setTextColor(0)
    doc.text(value, right, y, { align: 'right' })
    y += 5
  }

  solid(y)
  y += 5
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0)
  doc.text('Balance now', left, y)
  doc.text(money(balanceAfter), right, y, { align: 'right' })
  y += 5

  dashed(y)
  y += 5
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(70)
  if (balanceAfter > 0 && meta.collectionDue) {
    doc.text(`Next collection on or before ${meta.collectionDue}`, mid, y, { align: 'center' })
    y += 4.5
  }
  doc.text(balanceAfter <= 0 ? 'Fully settled. Thank you.' : 'Thank you.', mid, y, {
    align: 'center',
  })
  if (meta.ownerName) {
    y += 6
    doc.text(`Received by ${meta.ownerName}`, mid, y, { align: 'center' })
  }

  return { doc, filename: `receipt-${safeName(customer.name)}-${payment.createdAt.slice(0, 10)}.pdf` }
}

export async function downloadReceiptPdf(opts: ReceiptInput): Promise<void> {
  const { doc, filename } = await buildReceiptPdf(opts)
  doc.save(filename)
}

// ---------------------------------------------------------------------------
// Statement of account
// ---------------------------------------------------------------------------

export interface StatementInput {
  customer: Customer
  account: Account
  /** Only what is still owed, oldest first. */
  outstanding: OutstandingCharge[]
  meta: DocumentMeta
}

export async function buildStatementPdf(opts: StatementInput) {
  const doc = await newDocument()
  await renderStatement(doc, opts)
  stampPageNumbers(doc, opts.customer.name)
  return {
    doc,
    filename: `statement-${safeName(opts.customer.name)}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`,
  }
}

/** Draws one statement onto the current page of an existing document. */
async function renderStatement(
  doc: Awaited<ReturnType<typeof newDocument>>,
  opts: StatementInput,
): Promise<void> {
  const { customer, account, outstanding, meta } = opts
  const { default: autoTable } = await import('jspdf-autotable')
  const money = (v: number) => plainMoney(v, meta.currency, meta.locale)
  const date = (iso: string) => new Date(iso).toLocaleDateString(meta.locale)

  const M = 14
  let y = 18

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(0)
  doc.text(meta.storeName, M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90)
  doc.text(`Issued ${date(new Date().toISOString())}`, PAGE_WIDTH - M, y - 1, { align: 'right' })
  if (meta.ownerName) {
    doc.text(`Prepared by ${meta.ownerName}`, PAGE_WIDTH - M, y + 3, { align: 'right' })
  }
  y += 4
  doc.setFontSize(9).setTextColor(90)
  doc.text('STATEMENT OF ACCOUNT', M, y)
  y += 3

  doc.setDrawColor(0).setLineWidth(0.5)
  doc.line(M, y, PAGE_WIDTH - M, y)
  y += 7

  doc.setFontSize(7.5).setTextColor(110)
  doc.text('ACCOUNT', M, y)
  doc.text('BALANCE DUE', PAGE_WIDTH - M, y, { align: 'right' })
  y += 5

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(0)
  doc.text(customer.name, M, y)
  doc.setFontSize(17)
  doc.text(money(account.balance), PAGE_WIDTH - M, y + 1, { align: 'right' })
  y += 5

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(70)
  if (customer.phone) doc.text(customer.phone, M, y)
  if (account.balance <= 0) doc.text('Fully settled', PAGE_WIDTH - M, y, { align: 'right' })
  y += 5

  doc.setFontSize(8).setTextColor(110)
  doc.text(
    `Charged to date ${money(account.totalCharged)}  ·  Paid to date ${money(account.totalPaid)}`,
    M,
    y,
  )
  y += 6

  // One row per item, so each has its own price per unit. A charge's date
  // heads its first row and only its last row is ruled off, so the lines of
  // one charge read together. A part-paid charge ends with what was paid, so
  // its rows add up to what is still due.
  const body: RowInput[] = []
  const endsCharge = new Set<number>()
  for (const row of outstanding) {
    // Parking has no items: it is one month at the monthly rate.
    const lines =
      row.items.length > 0
        ? row.items.map((item) => ({
            label: `${item.qty} x ${item.name}`,
            unit: money(item.unitPrice),
            amount: item.qty * item.unitPrice,
          }))
        : [
            {
              label: row.description,
              unit: row.kind === 'parking' ? money(row.amount) : '',
              amount: row.amount,
            },
          ]
    lines.forEach((line, n) => {
      body.push([n === 0 ? date(row.at) : '', line.label, line.unit, money(line.amount)])
    })
    if (row.paid > 0.001) {
      const muted = { fontStyle: 'italic' as const, textColor: 90 }
      body.push([
        '',
        { content: 'Less part paid', styles: muted },
        '',
        { content: `- ${money(row.paid)}`, styles: muted },
      ])
    }
    endsCharge.add(body.length - 1)
  }

  // Column styles only reach body cells, so headings and the total are
  // right-aligned here to sit over their figures.
  const right = { halign: 'right' as const }
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 18 },
    head: [
      [
        'Date',
        'Still unpaid',
        { content: 'Price per unit', styles: right },
        { content: 'Amount due', styles: right },
      ],
    ],
    body:
      body.length > 0
        ? body
        : [[{ content: 'Nothing outstanding. This account is fully settled.', colSpan: 4 }]],
    foot: [
      [
        { content: 'Total due', colSpan: 3 },
        { content: money(account.balance), styles: right },
      ],
    ],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: 20 },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 7.5,
      textColor: 60,
      lineWidth: { bottom: 0.4 },
      lineColor: 0,
    },
    footStyles: {
      fontStyle: 'bold',
      fontSize: 9,
      textColor: 0,
      lineWidth: { top: 0.4 },
      lineColor: 0,
    },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: 200 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && !endsCharge.has(data.row.index)) {
        data.cell.styles.lineWidth = 0
      }
    },
  })

  if (account.balance > 0) {
    const tableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    await drawPaymentQrs(doc, tableEnd + 10, M)
  }
}

/**
 * Every account that owes something, one statement each, starting on its own
 * page. Saves working through the list one customer at a time.
 */
export async function buildAllStatementsPdf(
  statements: StatementInput[],
): Promise<{ doc: Awaited<ReturnType<typeof newDocument>>; filename: string }> {
  const doc = await newDocument()

  // Which customer each page belongs to, so the footers name the right one.
  const owners: string[] = []
  let drawn = 0

  for (const statement of statements) {
    if (drawn > 0) doc.addPage()
    const before = doc.getNumberOfPages()
    await renderStatement(doc, statement)
    const after = doc.getNumberOfPages()
    for (let i = before; i <= after; i++) owners[i] = statement.customer.name
    drawn++
  }

  if (drawn === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(60)
    doc.text('Nobody owes anything. Every account is settled.', PAGE_WIDTH / 2, 40, {
      align: 'center',
    })
  }

  stampPageNumbers(doc, owners)

  return {
    doc,
    filename: `statements-${new Date().toISOString().slice(0, 10)}.pdf`,
  }
}

export async function downloadAllStatementsPdf(statements: StatementInput[]): Promise<void> {
  const { doc, filename } = await buildAllStatementsPdf(statements)
  doc.save(filename)
}

export async function downloadStatementPdf(opts: StatementInput): Promise<void> {
  const { doc, filename } = await buildStatementPdf(opts)
  doc.save(filename)
}

/** Footers across every page, once the document is complete. */
function stampPageNumbers(
  doc: Awaited<ReturnType<typeof newDocument>>,
  label: string | string[],
): void {
  const total = doc.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  for (let page = 1; page <= total; page++) {
    doc.setPage(page)
    const who = Array.isArray(label) ? (label[page] ?? '') : label
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130)
    doc.text(
      who ? `${who} — page ${page} of ${total}` : `Page ${page} of ${total}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' },
    )
  }
}

/**
 * The InstaPay QR strip, three across then two, so each code prints at 44mm.
 * The size is not cosmetic: below about 40mm the denser codes stop reading
 * reliably, and a QR that will not scan is worse than no QR at all.
 */
async function drawPaymentQrs(
  doc: Awaited<ReturnType<typeof newDocument>>,
  startY: number,
  margin: number,
): Promise<void> {
  const { PAYMENT_QRS } = await import('./paymentQr')
  if (PAYMENT_QRS.length === 0) return

  const content = PAGE_WIDTH - margin * 2
  const SIZE = 42
  // Generous, deliberately: phone cameras grab whatever QR is nearest the
  // middle of frame, so codes packed together get scanned by mistake.
  const GAP = 24
  const ROW_GAP = 16
  const LABEL = 9
  const PER_ROW = 2

  const rows: typeof PAYMENT_QRS[] = []
  for (let i = 0; i < PAYMENT_QRS.length; i += PER_ROW) {
    rows.push(PAYMENT_QRS.slice(i, i + PER_ROW))
  }
  const blockHeight = 10 + rows.length * (SIZE + LABEL) + (rows.length - 1) * ROW_GAP

  // Keep the whole strip together rather than splitting it over a page break.
  let y = startY
  if (y + blockHeight > PAGE_HEIGHT - 16) {
    doc.addPage()
    y = 24
  }

  doc.setDrawColor(200).setLineWidth(0.3)
  doc.line(margin, y - 4, PAGE_WIDTH - margin, y - 4)

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(0)
  doc.text('HOW TO PAY', margin, y + 1)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110)
  doc.text('Scan any InstaPay QR below from your banking app.', margin + 25, y + 1)
  y += 8

  for (const row of rows) {
    const width = row.length * SIZE + (row.length - 1) * GAP
    let x = margin + (content - width) / 2

    for (const qr of row) {
      doc.addImage(qr.image, 'PNG', x, y, SIZE, SIZE, undefined, 'FAST')
      doc.setDrawColor(215).setLineWidth(0.2)
      doc.rect(x, y, SIZE, SIZE)

      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(0)
      doc.text(qr.bank, x + SIZE / 2, y + SIZE + 4, { align: 'center' })
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(120)
      doc.text(`${qr.accountName}  ${qr.account}`, x + SIZE / 2, y + SIZE + 7.5, {
        align: 'center',
        maxWidth: SIZE + GAP - 2,
      })

      x += SIZE + GAP
    }
    y += SIZE + LABEL + ROW_GAP
  }
}

// ---------------------------------------------------------------------------
// Price list
// ---------------------------------------------------------------------------

export interface PriceListItem {
  name: string
  category: string
  unit: string
  price: number
}

/**
 * A customer-facing price list: what things cost, grouped by category, in
 * columns so it reads like a menu on the wall. Cost price is deliberately
 * absent — this is handed to customers.
 *
 * Always a single sheet. The type is sized to fill it, and a long list moves
 * to three columns before it shrinks too far to read.
 */
export async function buildPriceListPdf(opts: {
  items: PriceListItem[]
  meta: DocumentMeta
}): Promise<{ doc: Awaited<ReturnType<typeof newDocument>>; filename: string }> {
  const { items, meta } = opts
  const doc = await newDocument()
  const filename = `price-list-${new Date().toISOString().slice(0, 10)}.pdf`
  // The currency is named once in the header. On every row it is only noise.
  const amount = (v: number) =>
    new Intl.NumberFormat(meta.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v)

  const M = 14
  const COLUMN_GAP = 10
  const INSET = 1.5
  const TOP = 45
  const CAPACITY = PAGE_HEIGHT - 12 - TOP

  // ---- Header ------------------------------------------------------------

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(0)
  doc.text(meta.storeName, PAGE_WIDTH / 2, 21, { align: 'center' })

  const title = 'PRICE LIST'
  const spacing = 1.4
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(80)
  const titleWidth = doc.getTextWidth(title) + spacing * (title.length - 1)
  doc.text(title, PAGE_WIDTH / 2 - titleWidth / 2, 27.5, { charSpace: spacing })

  doc.setDrawColor(0).setLineWidth(0.8)
  doc.line(M, 31.5, PAGE_WIDTH - M, 31.5)
  doc.setLineWidth(0.2)
  doc.line(M, 32.8, PAGE_WIDTH - M, 32.8)

  doc.setFontSize(8).setTextColor(110)
  doc.text(
    `As of ${new Date().toLocaleDateString(meta.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
    M,
    37.5,
  )
  doc.text(`Prices in ${meta.currency}`, PAGE_WIDTH - M, 37.5, { align: 'right' })

  if (items.length === 0) {
    doc.setFontSize(11).setTextColor(60)
    doc.text('No products to list yet.', PAGE_WIDTH / 2, 55, { align: 'center' })
    return { doc, filename }
  }

  // ---- Measure -----------------------------------------------------------

  // Group by category, keeping each category's items alphabetical.
  const byCategory = new Map<string, PriceListItem[]>()
  for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
    const list = byCategory.get(item.category) ?? []
    list.push(item)
    byCategory.set(item.category, list)
  }
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b))

  interface Row {
    group: number
    price: string
    unit: string
    /** The name, wrapped rather than cut short: a customer needs all of it. */
    lines: string[]
    height: number
  }

  // Every size below is scaled together, and set by `measure`.
  let scale = 1
  let columns = 2
  let columnWidth = 0
  let NAME = 10 // item name and price, in points
  let ROW = 6.4 // a one-line item
  let LINE = 4.4 // each extra line of a long name
  let BAND = 6.2 // the shaded category heading
  let HEAD = BAND + 2
  let GAP = 5 // between one category and the next in a column
  let rows: Row[] = []
  let wrapped = 0
  // Running totals, so any run of rows is measured without a loop.
  let heightBefore: number[] = []
  let opensBefore: number[] = []
  let groupStart: number[] = []
  let groupEnd: number[] = []

  const opensGroup = (i: number) => i === 0 || rows[i].group !== rows[i - 1].group

  const measure = (s: number, cols: number) => {
    scale = s
    columns = cols
    columnWidth = (PAGE_WIDTH - M * 2 - COLUMN_GAP * (cols - 1)) / cols
    NAME = 10 * s
    ROW = 6.4 * s
    LINE = 4.4 * s
    BAND = 6.2 * s
    HEAD = BAND + 2 * s
    GAP = 5 * s

    rows = []
    categories.forEach((category, group) => {
      for (const item of byCategory.get(category)!) {
        const price = amount(item.price)
        const unit = item.unit && item.unit !== 'pc' ? `per ${item.unit}` : ''
        doc.setFont('helvetica', 'bold').setFontSize(NAME)
        const priceWidth = doc.getTextWidth(price)
        doc.setFont('helvetica', 'normal').setFontSize(7 * s)
        const unitWidth = unit ? doc.getTextWidth(unit) + 2 : 0
        doc.setFontSize(NAME)
        const nameWidth = columnWidth - INSET * 2 - priceWidth - unitWidth - 4
        const lines = doc.splitTextToSize(item.name, nameWidth) as string[]
        rows.push({ group, price, unit, lines, height: ROW + (lines.length - 1) * LINE })
      }
    })
    wrapped = rows.filter((r) => r.lines.length > 1).length

    const n = rows.length
    heightBefore = [0]
    opensBefore = [0, 0]
    for (let i = 0; i < n; i++) heightBefore.push(heightBefore[i] + rows[i].height)
    for (let i = 1; i < n; i++) opensBefore.push(opensBefore[i] + (opensGroup(i) ? 1 : 0))
    groupStart = []
    for (let i = 0; i < n; i++) groupStart.push(opensGroup(i) ? i : groupStart[i - 1])
    groupEnd = new Array<number>(n)
    for (let i = n - 1; i >= 0; i--) {
      groupEnd[i] = i === n - 1 || opensGroup(i + 1) ? i + 1 : groupEnd[i + 1]
    }
  }

  /** How tall rows [from, to) stand as one column, headings included. */
  const heightOf = (from: number, to: number) =>
    to <= from
      ? 0
      : HEAD +
        heightBefore[to] -
        heightBefore[from] +
        (opensBefore[to] - opensBefore[from + 1]) * (GAP + HEAD)

  // Breaking a category between columns costs about two rows of evenness, so
  // categories stay whole unless splitting one balances the page much better.
  const columnCost = (from: number, to: number) => {
    if (to <= from) return 0
    let cost = heightOf(from, to)
    if (cost > CAPACITY) return Infinity
    // Never one lone item on either side of a break.
    if (!opensGroup(from)) {
      if (Math.min(to, groupEnd[from]) - from < 2) return Infinity
      cost += ROW * 2
    }
    if (to < rows.length && !opensGroup(to) && to - Math.max(from, groupStart[to]) < 2) {
      return Infinity
    }
    return cost
  }

  /**
   * Where each column starts, so the tallest column is as short as it can be.
   * Null when the rows cannot fit the page at the current size.
   */
  const plan = (): number[] | null => {
    const n = rows.length
    let tallest = new Array<number>(n + 1).fill(Infinity)
    tallest[0] = 0
    const picks: number[][] = []
    for (let k = 0; k < columns; k++) {
      const next = new Array<number>(n + 1).fill(Infinity)
      const pick = new Array<number>(n + 1).fill(-1)
      for (let to = 0; to <= n; to++) {
        // Later breaks first, so a tie keeps the earlier columns fuller.
        for (let from = to; from >= 0; from--) {
          if (heightOf(from, to) > CAPACITY) break
          if (tallest[from] === Infinity) continue
          const cost = Math.max(tallest[from], columnCost(from, to))
          if (cost < next[to]) {
            next[to] = cost
            pick[to] = from
          }
        }
      }
      picks.push(pick)
      tallest = next
    }
    if (tallest[n] === Infinity) return null
    const starts = [n]
    for (let k = columns - 1; k >= 0; k--) starts.unshift(picks[k][starts[0]])
    return starts
  }

  const tryLayout = (s: number, cols: number) => {
    measure(s, cols)
    // Larger type is not worth names breaking over two lines.
    if (s > 1 && wrapped > rows.length * 0.1) return null
    return plan()
  }

  const sizes = (from: number, to: number) => {
    const list: number[] = []
    for (let s = from; s >= to - 1e-9; s -= 0.05) list.push(Math.round(s * 100) / 100)
    return list
  }

  // Two columns while the type stays readable; a long list goes to three
  // rather than shrink below that.
  let starts: number[] | null = null
  for (const s of sizes(1.25, 0.75)) if ((starts = tryLayout(s, 2))) break
  if (!starts) {
    for (const s of sizes(1, 0.1)) if ((starts = tryLayout(s, 2) ?? tryLayout(s, 3))) break
  }
  if (!starts) throw new Error('Too many products to fit one page.')

  // ---- Draw --------------------------------------------------------------

  const drawColumn = (from: number, to: number, x: number) => {
    const baseline = 4.3 * scale
    let y = TOP
    for (let i = from; i < to; i++) {
      const row = rows[i]
      if (i === from || opensGroup(i)) {
        if (i !== from) y += GAP
        doc.setFillColor(236, 236, 236)
        doc.rect(x, y, columnWidth, BAND, 'F')
        doc.setFont('helvetica', 'bold').setFontSize(9.5 * scale).setTextColor(0)
        const heading = categories[row.group].toUpperCase()
        doc.text(heading, x + INSET + 0.5, y + baseline)
        // Picking up a category the previous column started.
        if (!opensGroup(i)) {
          const after = x + INSET + 0.5 + doc.getTextWidth(heading) + 1.5
          doc.setFont('helvetica', 'normal').setFontSize(7.5 * scale).setTextColor(110)
          doc.text('continued', after, y + baseline)
        }
        y += HEAD
      }

      const firstBaseline = y + baseline
      const lastBaseline = firstBaseline + (row.lines.length - 1) * LINE
      const right = x + columnWidth - INSET

      doc.setFont('helvetica', 'normal').setFontSize(NAME).setTextColor(25)
      row.lines.forEach((line, n) => doc.text(line, x + INSET, firstBaseline + n * LINE))
      const nameEnd = x + INSET + doc.getTextWidth(row.lines[row.lines.length - 1])

      doc.setFont('helvetica', 'bold').setFontSize(NAME).setTextColor(0)
      doc.text(row.price, right, lastBaseline, { align: 'right' })
      let leaderEnd = right - doc.getTextWidth(row.price) - 1.5

      if (row.unit) {
        doc.setFont('helvetica', 'normal').setFontSize(7 * scale).setTextColor(130)
        doc.text(row.unit, leaderEnd, lastBaseline, { align: 'right' })
        leaderEnd -= doc.getTextWidth(row.unit) + 1.5
      }

      // A dotted leader ties the name to its price, as a menu does.
      if (leaderEnd > nameEnd + 3) {
        doc.setDrawColor(175).setLineWidth(0.25)
        doc.setLineDashPattern([0.4, 1.1], 0)
        doc.line(nameEnd + 1.5, lastBaseline - 0.6 * scale, leaderEnd, lastBaseline - 0.6 * scale)
        doc.setLineDashPattern([], 0)
      }

      y += row.height
    }
  }

  // A list too short to need every column is centred, not left-aligned.
  const filled: Array<[number, number]> = []
  for (let k = 0; k < columns; k++) {
    if (starts[k + 1] > starts[k]) filled.push([starts[k], starts[k + 1]])
  }
  const blockWidth = filled.length * columnWidth + (filled.length - 1) * COLUMN_GAP
  let x = (PAGE_WIDTH - blockWidth) / 2
  for (const [from, to] of filled) {
    drawColumn(from, to, x)
    x += columnWidth + COLUMN_GAP
  }

  return { doc, filename }
}

export async function downloadPriceListPdf(opts: {
  items: PriceListItem[]
  meta: DocumentMeta
}): Promise<void> {
  const { doc, filename } = await buildPriceListPdf(opts)
  doc.save(filename)
}

// ---------------------------------------------------------------------------
// Restock list
// ---------------------------------------------------------------------------

export interface RestockItem {
  name: string
  category: string
  unit: string
  stock: number
  reorderLevel: number
  cost: number
}

/**
 * What to buy, for taking to the wholesaler: out of stock first, then running
 * low, each with a box to tick off. Cost is on it, so it is not for customers.
 */
export async function buildRestockListPdf(opts: {
  items: RestockItem[]
  meta: DocumentMeta
}): Promise<{ doc: Awaited<ReturnType<typeof newDocument>>; filename: string }> {
  const { items, meta } = opts
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = await newDocument()
  const money = (v: number) => plainMoney(v, meta.currency, meta.locale)

  const M = 14
  let y = 18

  // The same top-up the Inventory and Reports pages suggest: back to twice
  // the reorder level.
  const toBuy = (item: RestockItem) => Math.max(item.reorderLevel * 2 - item.stock, 0)
  const byName = (a: RestockItem, b: RestockItem) => a.name.localeCompare(b.name)
  const out = items.filter((i) => i.stock <= 0).sort(byName)
  const low = items.filter((i) => i.stock > 0).sort(byName)
  const totalCost = items.reduce((sum, i) => sum + toBuy(i) * i.cost, 0)

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(0)
  doc.text(meta.storeName, M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90)
  doc.text(
    `As of ${new Date().toLocaleDateString(meta.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
    PAGE_WIDTH - M,
    y - 1,
    { align: 'right' },
  )
  if (meta.ownerName) {
    doc.text(`Prepared by ${meta.ownerName}`, PAGE_WIDTH - M, y + 3, { align: 'right' })
  }
  y += 4
  doc.setFontSize(9).setTextColor(90)
  doc.text('RESTOCK LIST', M, y)
  y += 3

  doc.setDrawColor(0).setLineWidth(0.5)
  doc.line(M, y, PAGE_WIDTH - M, y)
  y += 6

  doc.setFontSize(9).setTextColor(70)
  doc.text(
    `${out.length} out of stock  ·  ${low.length} running low  ·  about ${money(totalCost)} to refill`,
    M,
    y,
  )
  y += 5

  // Section headings span the table; they get no tick box.
  const sectionRows = new Set<number>()
  const body: RowInput[] = []
  const section = (title: string, list: RestockItem[]) => {
    if (list.length === 0) return
    sectionRows.add(body.length)
    body.push([
      {
        content: `${title} (${list.length})`,
        colSpan: 7,
        styles: {
          fontStyle: 'bold',
          fontSize: 8,
          textColor: 60,
          cellPadding: { top: 3.5, bottom: 1.2, left: 1.6, right: 1.6 },
        },
      },
    ])
    for (const item of list) {
      const qty = toBuy(item)
      body.push([
        '',
        item.name,
        item.category,
        `${item.stock} ${item.unit}`,
        String(item.reorderLevel),
        // Left blank rather than "0" when there is no reorder level to go by.
        qty > 0 ? `${qty} ${item.unit}` : '',
        qty > 0 ? money(qty * item.cost) : '',
      ])
    }
  }
  section('OUT OF STOCK', out)
  section('RUNNING LOW', low)

  const right = { halign: 'right' as const }
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 18 },
    head: [
      [
        '',
        'Product',
        'Category',
        { content: 'Left', styles: right },
        { content: 'Reorder at', styles: right },
        { content: 'Buy', styles: right },
        { content: 'Est. cost', styles: right },
      ],
    ],
    body:
      body.length > 0
        ? body
        : [[{ content: 'Nothing is running low. Everything is stocked.', colSpan: 7 }]],
    foot: [
      [
        { content: 'Estimated cost to refill', colSpan: 6 },
        { content: money(totalCost), styles: right },
      ],
    ],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: 20 },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 7.5,
      textColor: 60,
      lineWidth: { bottom: 0.4 },
      lineColor: 0,
    },
    footStyles: {
      fontStyle: 'bold',
      fontSize: 9,
      textColor: 0,
      lineWidth: { top: 0.4 },
      lineColor: 0,
    },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: 200 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 34 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 30, halign: 'right' },
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      if (body.length === 0 || sectionRows.has(data.row.index)) return
      const box = 3.2
      doc.setDrawColor(120).setLineWidth(0.25)
      doc.rect(data.cell.x + 1.6, data.cell.y + (data.cell.height - box) / 2, box, box)
    },
  })

  stampPageNumbers(doc, `${meta.storeName} restock list`)

  return { doc, filename: `restock-list-${new Date().toISOString().slice(0, 10)}.pdf` }
}

export async function downloadRestockListPdf(opts: {
  items: RestockItem[]
  meta: DocumentMeta
}): Promise<void> {
  const { doc, filename } = await buildRestockListPdf(opts)
  doc.save(filename)
}

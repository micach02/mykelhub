import type { Account, AppliedTo, OutstandingCharge } from './analytics'
import { amountInWords } from './words'
import { paymentMethodLabel } from './labels'
import type { Customer, Payment } from '../types'

/**
 * PDFs are drawn rather than screenshotted, so the text stays selectable and
 * the file stays small. jsPDF is pulled in on demand: it is far bigger than
 * anything else here and most sessions never download a document.
 */
async function newDocument(format: 'a4' | [number, number] = 'a4') {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'mm', format, compress: true })
}

const A4_WIDTH = 210
const A4_HEIGHT = 297

/**
 * Philippine long bond, 8.5 by 13 inches. Not US Legal, which is 8.5 by 14
 * and will leave a blank strip at the foot of a page printed on long.
 */
const LONG_BOND: [number, number] = [215.9, 330.2]

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
  const left = (A4_WIDTH - W) / 2
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
  let y = Math.max(16, (A4_HEIGHT - height) / 2)

  /**
   * A long settlement can outrun the page. Carry on overleaf rather than
   * drawing past the bottom, where the text is simply lost.
   */
  const needRoom = (height: number) => {
    if (y + height <= A4_HEIGHT - 14) return
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
  doc.text(`Issued ${date(new Date().toISOString())}`, A4_WIDTH - M, y - 1, { align: 'right' })
  if (meta.ownerName) {
    doc.text(`Prepared by ${meta.ownerName}`, A4_WIDTH - M, y + 3, { align: 'right' })
  }
  y += 4
  doc.setFontSize(9).setTextColor(90)
  doc.text('STATEMENT OF ACCOUNT', M, y)
  y += 3

  doc.setDrawColor(0).setLineWidth(0.5)
  doc.line(M, y, A4_WIDTH - M, y)
  y += 7

  doc.setFontSize(7.5).setTextColor(110)
  doc.text('ACCOUNT', M, y)
  doc.text('BALANCE DUE', A4_WIDTH - M, y, { align: 'right' })
  y += 5

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(0)
  doc.text(customer.name, M, y)
  doc.setFontSize(17)
  doc.text(money(account.balance), A4_WIDTH - M, y + 1, { align: 'right' })
  y += 5

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(70)
  if (customer.phone) doc.text(customer.phone, M, y)
  if (account.balance <= 0) doc.text('Fully settled', A4_WIDTH - M, y, { align: 'right' })
  y += 5

  doc.setFontSize(8).setTextColor(110)
  doc.text(
    `Charged to date ${money(account.totalCharged)}  ·  Paid to date ${money(account.totalPaid)}`,
    M,
    y,
  )
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 18 },
    head: [['Date', 'Still unpaid', 'Charge', 'Part paid', 'Amount due']],
    body:
      outstanding.length > 0
        ? outstanding.map((row) => [
            date(row.at),
            (row.kind === 'parking' ? '[Parking] ' : '') + row.description,
            money(row.amount),
            row.paid > 0.001 ? money(row.paid) : '',
            money(row.due),
          ])
        : [['', 'Nothing outstanding. This account is fully settled.', '', '', '']],
    foot: [['Total due', '', '', '', money(account.balance)]],
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
      0: { cellWidth: 24 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
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
    doc.text('Nobody owes anything. Every account is settled.', A4_WIDTH / 2, 40, {
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

  const content = A4_WIDTH - margin * 2
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
  if (y + blockHeight > A4_HEIGHT - 16) {
    doc.addPage()
    y = 24
  }

  doc.setDrawColor(200).setLineWidth(0.3)
  doc.line(margin, y - 4, A4_WIDTH - margin, y - 4)

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
 * A customer-facing price list: what things cost, grouped by category, two
 * columns so it reads like a menu on the wall. Cost price is deliberately
 * absent — this is handed to customers.
 */
export async function buildPriceListPdf(opts: {
  items: PriceListItem[]
  meta: DocumentMeta
}): Promise<{ doc: Awaited<ReturnType<typeof newDocument>>; filename: string }> {
  const { items, meta } = opts
  // Long bond: the extra height is worth about a fifth more products per page,
  // and it is what a sari-sari store has in the printer.
  const doc = await newDocument(LONG_BOND)
  const money = (v: number) => plainMoney(v, meta.currency, meta.locale)

  const [PAGE_W, PAGE_H] = LONG_BOND
  const M = 14
  const COLUMN_GAP = 10
  const columnWidth = (PAGE_W - M * 2 - COLUMN_GAP) / 2
  const TOP = 34
  const BOTTOM = PAGE_H - 18

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(0)
  doc.text(meta.storeName, PAGE_W / 2, 20, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  doc.text('PRICE LIST', PAGE_W / 2, 25.5, { align: 'center' })
  doc.setFontSize(8).setTextColor(130)
  doc.text(
    `As of ${new Date().toLocaleDateString(meta.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
    PAGE_W / 2,
    30,
    { align: 'center' },
  )

  // Group by category, keeping each category's items alphabetical.
  const byCategory = new Map<string, PriceListItem[]>()
  for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
    const list = byCategory.get(item.category) ?? []
    list.push(item)
    byCategory.set(item.category, list)
  }
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b))

  let column = 0
  let y = TOP
  const columnX = () => M + column * (columnWidth + COLUMN_GAP)

  /** Move down the page, wrapping to the second column then a new page. */
  const advance = (by: number) => {
    y += by
    if (y > BOTTOM) {
      if (column === 0) {
        column = 1
        y = TOP
      } else {
        doc.addPage()
        column = 0
        y = TOP
      }
    }
  }

  for (const category of categories) {
    const list = byCategory.get(category)!

    // Never leave a heading stranded at the foot of a column.
    if (y + 12 > BOTTOM) advance(BOTTOM)

    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0)
    doc.text(category.toUpperCase(), columnX(), y)
    doc.setDrawColor(0).setLineWidth(0.4)
    doc.line(columnX(), y + 1.5, columnX() + columnWidth, y + 1.5)
    advance(6)

    for (const item of list) {
      const priceText = money(item.price)
      const priceWidth = doc.getTextWidth(priceText)
      const nameWidth = columnWidth - priceWidth - 4

      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(20)
      const name = (doc.splitTextToSize(item.name, nameWidth) as string[])[0]
      doc.text(name, columnX(), y)
      doc.setTextColor(0)
      doc.text(priceText, columnX() + columnWidth, y, { align: 'right' })

      // A dotted leader ties the name to its price, as a menu does.
      const from = columnX() + doc.getTextWidth(name) + 2
      const to = columnX() + columnWidth - priceWidth - 2
      if (to > from) {
        doc.setDrawColor(190).setLineWidth(0.2)
        doc.setLineDashPattern([0.5, 1], 0)
        doc.line(from, y - 0.8, to, y - 0.8)
        doc.setLineDashPattern([], 0)
      }

      if (item.unit && item.unit !== 'pc') {
        doc.setFontSize(6.5).setTextColor(140)
        doc.text(`per ${item.unit}`, columnX() + columnWidth, y + 3, { align: 'right' })
        advance(7.5)
      } else {
        advance(5.5)
      }
    }
    advance(3)
  }

  if (items.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(60)
    doc.text('No products to list yet.', PAGE_W / 2, 50, { align: 'center' })
  }

  stampPageNumbers(doc, `${meta.storeName} price list`)

  return { doc, filename: `price-list-${new Date().toISOString().slice(0, 10)}.pdf` }
}

export async function downloadPriceListPdf(opts: {
  items: PriceListItem[]
  meta: DocumentMeta
}): Promise<void> {
  const { doc, filename } = await buildPriceListPdf(opts)
  doc.save(filename)
}

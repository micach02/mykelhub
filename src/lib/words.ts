const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

const SCALES: Array<[value: number, name: string]> = [
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1_000, 'thousand'],
]

function underHundred(n: number): string {
  if (n < 20) return ONES[n]
  const tens = TENS[Math.floor(n / 10)]
  const ones = n % 10
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`
}

function underThousand(n: number): string {
  if (n < 100) return underHundred(n)
  const hundreds = `${ONES[Math.floor(n / 100)]} hundred`
  const rest = n % 100
  return rest === 0 ? hundreds : `${hundreds} ${underHundred(rest)}`
}

/** Plain English for a whole number. Used on printed receipts. */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value))
  if (n === 0) return 'zero'

  const parts: string[] = []
  for (const [scale, name] of SCALES) {
    if (n >= scale) {
      parts.push(`${underThousand(Math.floor(n / scale))} ${name}`)
      n %= scale
    }
  }
  if (n > 0) parts.push(underThousand(n))
  return parts.join(' ')
}

/** Currency codes worth spelling out; anything else keeps its code. */
const CURRENCY_WORDS: Record<string, [singular: string, plural: string]> = {
  PHP: ['peso', 'pesos'],
  USD: ['dollar', 'dollars'],
  SGD: ['dollar', 'dollars'],
  HKD: ['dollar', 'dollars'],
  AED: ['dirham', 'dirhams'],
}

/**
 * The amount as a receipt writes it: words for the whole part, and the
 * fraction as hundredths, which is how a paper receipt has always done it.
 */
export function amountInWords(value: number, currency = 'PHP'): string {
  const rounded = Math.round(Math.abs(value) * 100) / 100
  const whole = Math.floor(rounded)
  const fraction = Math.round((rounded - whole) * 100)

  const [singular, plural] = CURRENCY_WORDS[currency] ?? [currency, currency]
  const unit = whole === 1 ? singular : plural
  const words = `${numberToWords(whole)} ${unit}`

  const sentence =
    fraction > 0
      ? `${words} and ${String(fraction).padStart(2, '0')}/100`
      : `${words} only`

  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

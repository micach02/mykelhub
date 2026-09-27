# MykelHub

Store management for a small sari-sari store. Four jobs: track **who owes you**,
collect the **parking fees**, keep the **inventory** straight, and show
**reports**.

Everything runs in the browser. No server, no database, no login, no internet
needed after the first load. The whole store lives in `localStorage` and can be
exported to a JSON file.

There is deliberately **no point of sale**. A small store does not ring up a ₱9
sachet on a register — it needs to remember who owes what.

## Stack

| Piece | Choice |
|---|---|
| Build | Vite 7 |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4, themed with CSS custom properties |
| State | Zustand with `persist` to `localStorage` |
| Charts | Recharts, on a CVD-validated palette |
| Icons | lucide-react |
| Routing | React Router (hash mode) |

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check, then bundle to dist/
npm run preview  # serve the built bundle
```

A new workspace starts empty. Load the sample store (33 products, 8 customers,
5 of them on a monthly parking fee, two months of sales) from the dashboard or
**Settings → Data**, and clear it again from the same place.

### Serving from XAMPP

Relative `base` plus hash routing, so `dist/` works from any subdirectory with no
Apache rewrite rule:

```
http://localhost/MykelHub/dist/
```

## The six screens

**Credit** — the reason this app exists. Every customer with their running
balance, how long the oldest unpaid charge has sat, and their total charged vs.
total paid. A balance can be goods, parking, or both, and the table shows the
split. Open a customer to see the full ledger: each credit sale with what was
taken, each monthly parking charge, each payment, and the running balance after
every entry. Two actions do the work: **Add credit sale** (pick items, they come
off the shelf and go onto the account) and **Record payment** (with the date
paid, so you can enter it the next morning). **Print** produces a proper
statement of account on A4 — see below.

Entries can be corrected in place. A charge opens its line items, date, note
and which customer it belongs to; changing the quantities moves stock by the
difference and writes a "Sale edited" movement, so the shelf never drifts from
the audit trail. A payment opens its amount, date, method and note. A monthly
parking row is marked *auto* and has no edit: it is derived from the fee, so it
changes on the Parking page rather than one month at a time. A voided sale
cannot be edited — its stock has already gone back.

**Parking** — a monthly fee charged to a customer. Set their rate and the month
they started, and the fee **accrues by itself every calendar month**. Unpaid
months are not a separate debt: they join what that customer owes on the Credit
page, because it is the same person and the same pocket. The table shows the
monthly fee, what month each is paid through, how many months they are behind,
and how much of their total balance is parking. *Stop charging* freezes accrual
when someone leaves, keeping whatever they still owe.

**Inventory** — what is on the shelves, what each item costs and sells for, the
profit per unit, and what is running low. Three stock actions: *Restock*,
*Remove* (damaged, expired, taken for the house), and *Count* (set the counted
quantity). Each product opens to its stock movement history.

**Sales** — the sales log, and the **vault**: the cash actually in the drawer.
Cash sales and cash payments go in on their own, GCash never does, and you can
put money in or take it out by hand (paying the wholesaler, the owner's draw) or
correct it to a count. Recording cash sales is **optional**; see below.

**Reports** — four tabs. *Sales and profit*: revenue, profit, what went on
credit, what was collected, daily trend, by weekday, by hour, by category, per
product. *Credit*: total outstanding, aging, and every customer ranked.
*Parking*: expected monthly income, collected vs. last month, unpaid, six-month
trend, and every parker. *Stock*: capital tied up, value by category, and the
restock list with what it would cost to refill.

**Settings** — store name, currency, reorder defaults, overdue threshold,
default parking rate, theme, and JSON backup/restore.

CSV export on credit, parking, inventory, sales, and every report tab.

## Recording sales is optional

Stock has to come off the shelf somehow, and there are two honest ways to do it:

1. **Credit only.** Record credit sales as they happen (you have to — you need to
   remember them), and correct the shelf now and then with *Count*. Reports then
   cover the credit side accurately and the cash side partially.
2. **Record everything.** Use *Record sale* for cash and GCash too, and every
   number in Reports is complete.

Nothing forces the second. The app is built so option 1 still works properly —
which is why stock adjustments are first-class rather than buried.

## How the money math works

**One balance per customer.** Two things put someone in debt — goods taken on
credit, and the monthly parking fee — and they share a single balance and a
single payment stream, because that is how it works across the counter.

```
balance = total charged − total paid
```

**Parking accrues; it is never billed.** A monthly fee is charged by whole
calendar month from the month the customer started:

```
months billed = calendar months from parkingSince to min(now, parkingUntil)
```

Counting by calendar month rather than by the day is deliberate: somebody who
takes a space on the 20th still owes for that month, which is how a space is
actually let. There is no proration, and no charge is ever written down — the
months are derived on read, so a new month starts owing the moment it arrives,
with no scheduled job and nothing to forget.

**Payments clear the oldest thing owed first**, whatever it was for. Goods and
parking charges are merged into one chronological list and payments are walked
across it. That single allocation produces everything else:

- `goodsOwed` and `parkingOwed`, which always sum to `balance`
- `parkingBehind`, the count of monthly fees not yet covered
- `parkingPaidThrough`, the last month fully covered
- `daysOutstanding`, the age of the oldest uncovered charge

So a ₱600 payment against ₱300 January parking, ₱300 February parking, and ₱250
of goods taken on 14 February clears the two parking months and leaves the
goods — not the other way round. Overpayment shows as credit, never a negative
balance.

Aging buckets: this week, 1–2 weeks, 2–4 weeks, over a month. The last one is the
overdue flag, and the threshold is configurable in Settings.

Money is collected **on or before the 15th of the month**, configurable in
Settings. Statements and receipts print the next such date as the due date;
`nextCollectionDate` rolls to next month once the day has passed, and clamps
to the 28th so the date exists in February.

There is no per-customer credit limit. It only ever produced a warning nobody
could act on, so the decision stays with whoever is behind the counter.

## The vault

The vault is the cash in the drawer, not a bank balance. It is a signed ledger —
`vaultBalance` is just the sum — so every peso in it can be traced to a line:

| Moves the vault | Does not |
|---|---|
| Cash sale (+) | GCash sale — the money never reaches the box |
| Cash payment on a balance (+) | Credit sale — nothing has been paid yet |
| Voiding a cash sale (−) | GCash payment |
| Money put in or taken out by hand (±) | |

**Record sale** shows the drawer before and after, and carries an *Also put money
in* field for any extra cash going in at the same time. **Adjust vault** on the
Sales page handles the rest: put money in, take money out with a reason, or
*count the drawer* — which writes the difference as a single correcting entry
rather than silently overwriting the running total, so a short drawer leaves a
trace.

## Documents

Two documents, both **generated as PDFs** rather than printed: the text is
drawn, so it stays selectable and the file stays small. jsPDF is pulled in on
demand — it is larger than anything else in the app and most sessions never
download a document — so it costs nothing until the button is pressed.

### Payment receipt

Recording a payment offers a receipt straight away, and the receipt icon on any
payment row in the ledger fetches an old one. It is a 76mm slip **centred on an
A4 page**, so it can be cut out or handed over whole.

It itemises **what the payment settled**, grouped into Parking and Goods
with a subtotal each, and every product listed on its own line rather than
run together — since money clears the oldest charge
first, the slip can say which months of parking and which goods it went to,
marking the last one "(part)" where it ran out — alongside the amount in
figures and words, who paid, how, the balance before and after, and when the
next collection falls due.

The before-and-after comes from the ledger's own running balance rather than
from today's figures, so a receipt downloaded months later reads exactly as it
did on the day.

### Price list

**Price list** on the Inventory page produces a customer-facing menu: products
grouped by category with dotted leaders to the price, two columns, flowing onto
further pages as needed. Cost price is deliberately absent — this one gets
handed across the counter.

It prints on **long bond** (8.5 × 13in, 216 × 330mm), not A4 — the taller sheet
fits noticeably more products per page, and it is what the shop has in the
printer. Note this is the Philippine long/folio size, not US Legal (8.5 × 14in),
which would leave a blank strip at the foot. Receipts and statements stay on A4.

### Statement of account

The ledger's **Download PDF** produces a statement on A4. It lists **only what
is still unpaid** — not the whole history — because a statement exists to be
settled, and a customer does not need to re-read months of paid entries to find
what they owe. The part-paid charge shows its remainder. Totals charged and
paid to date stay in the header as context.

**Download all statements** on the Credit page puts one statement per customer
who owes into a single PDF, each starting on its own page, biggest debt first —
so the round can be prepared in one go rather than customer by customer.

Below the table, when anything is owed, comes **How to pay**: five InstaPay QR
codes from [src/lib/paymentQr.ts](src/lib/paymentQr.ts). A settled statement
gets no QR block.

Each code was cropped out of its bank's share sheet, then decoded three times
over — after cropping, at the size it prints, and finally back out of a
generated PDF — with the payload compared byte-for-byte against the original
each time. **A QR that does not scan is worse than none at all.** They print at
42mm, two per row with **24mm of clear space between them**. Both numbers are
deliberate: below roughly 40mm the denser codes stop reading reliably, and
codes packed close together get scanned by mistake, since a phone grabs
whichever is nearest the middle of frame.

Long histories paginate with the column heads repeated. Page numbers are
stamped after the whole document exists, so the totals are right and a page
added after the table still gets one.

Both are built in [src/lib/pdf.ts](src/lib/pdf.ts). `buildReceiptPdf` and
`buildStatementPdf` return the document, and the `download*` wrappers save
it — the split is what lets the layout be exercised in tests without a browser.

Amounts print as `PHP 1,234.00` rather than with a currency sign: the built-in
PDF fonts have no peso glyph, and a missing glyph is worse than a currency code.

## Data model

`Product`, `Customer`, `Sale` (with denormalized line items, so history survives
price changes), `Payment`, `StockMovement`, `Settings` — all in
[src/types.ts](src/types.ts). The store and its actions are in
[src/store/useStore.ts](src/store/useStore.ts).

There is no parker record. Parking is three optional fields on `Customer` —
`parkingRate`, `parkingSince`, `parkingUntil` — because a parker is a customer
who owes a monthly fee, not a separate kind of person. That is what lets unpaid
parking land on their credit balance without any cross-referencing.

Parking is still kept out of *sales* revenue: folding rent into product revenue
would wreck margin analysis. Reports show them in separate tabs.

A sale's `settlement` is `cash`, `gcash`, or `credit`. Only `credit` touches a
customer account.

Stock only ever changes through an action that also writes a `StockMovement`, so
the audit trail cannot drift from the on-hand figure.

No tax, no discounts, no SKUs, no barcodes, no suppliers, no cashier accounts —
a small store has none of those, and leaving them out is the point.

## Design notes

- **One palette, two modes.** Colors are CSS custom properties defined once on
  `:root` and redefined under `[data-theme="dark"]`. The dark steps are chosen for
  the dark surface, not flipped from light, and the theme is stamped on `<html>`
  before first paint.
- **Charts follow a validated palette** that passes colorblind-separation,
  lightness, chroma, and contrast checks in both modes. Every chart carries
  visible value labels or a table beside it, so nothing depends on hue alone.
- **Status is never color-only** — stock states and balance ages pair color with
  an icon and a word.
- Money is formatted through `Intl`; columns of figures use tabular numerals.

## Where the data lives

By default everything sits in the browser's `localStorage`, which is fine
until someone clears site data.

**Settings → Data file** connects the store to a real JSON file on the
computer, through the File System Access API. Once connected, every change is
written to that file automatically — debounced, so a burst of edits costs one
write. On the next visit the app reconnects to the same file and loads from it.

No server is involved, so this works identically whether the app is opened from
XAMPP, from GitHub Pages, or from a folder on a USB stick. **The data never
leaves the machine it was entered on.**

Chrome and Edge on a desktop support this. Firefox, Safari and every browser on
iOS do not, and there the card says so and browser storage carries on as
before. Browsers also drop file permission between visits and will only restore
it after a click, so the card asks rather than failing quietly.

A file is only loaded if it actually looks like a MykelHub file; a truncated or
unrelated JSON document is refused rather than applied over good data. Settings
missing from a file written by an older build fall back to their defaults.

## Cloud sync

To use MykelHub on a phone and a computer with the same data, connect it to a
free Supabase project under **Settings → Cloud sync**. Setup, once:

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [supabase/schema.sql](supabase/schema.sql). A
   successful run reports "Success. No rows returned" — it only creates
   things, so there is nothing to show. To see the result, run
   [supabase/verify.sql](supabase/verify.sql), which should report "yes"
   on every row.
3. In the project's **Settings**, copy the URL from **Data API** and the
   public key from **API Keys**, and paste both into Settings → Cloud sync.
   (Older Supabase dashboards had these together under Settings → API.)
4. Create the single account. The least fiddly way is in Supabase under
   **Authentication → Users → Add user**, ticking **Auto Confirm User** —
   that skips the confirmation email entirely. Then sign in from the app.

   Signing up from the app works too, but a fresh project sends a
   confirmation email whose link points at `http://localhost:3000`, because
   that is the default Site URL. Either confirm the account from the
   dashboard instead, or set **Authentication → URL Configuration → Site
   URL** to the address the app is served from.
5. Turn sign-ups off in Supabase under **Authentication → Sign In / Providers**,
   so nobody else can register against your store.

The API Keys page lists a secret key beside the public one. **Never paste the
secret key here**: it ignores row-level security, so in a static site it would
hand every visitor the whole database. The app checks which key was pasted and
refuses a `service_role` or `sb_secret_` one outright.

The project details are entered in the app rather than built in, so they stay
out of the repository. `.env.example` shows the build-time alternative.

**The anon key is public.** A static site cannot hide it, and it is not meant
to be hidden. What keeps the data private is the row-level security policy in
the schema: every row belongs to one account, and the database refuses to hand
rows to anybody else. Without that policy the key alone would expose every
customer's debts — which is why the schema is not optional.

### How the syncing works

The store is held in memory as always, so the interface stays instant; the
cloud is a persistence layer underneath, the same shape as the data file.

Data is stored as **seven rows, one per collection**, rather than one large
document. That matters more than it sounds: the demo store is 505KB of JSON,
but editing a product only uploads the 6.7KB `products` row. Only collections
whose contents actually changed are sent, and sends are debounced.

Edits made offline are kept on the device and go up when the connection
returns.

**Conflicts are not resolved silently.** If this device has changes that never
went up *and* the cloud has newer data from elsewhere, the app stops and asks
which to keep, because either choice loses something real. Otherwise the last
save wins — fine for one person on two devices, not a substitute for
record-level merging if two people work at once.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to
`main`. Turn it on under **Settings → Pages → Source → GitHub Actions**. The
build already uses a relative `base` and hash routing, so it works from a
project subpath without further configuration.

Two things to be careful about before pushing:

- **Never commit the data file.** It holds customer names, phone numbers and
  what each of them owes. `.gitignore` already blocks `*-data.json` and
  `data/`, and the file picker defaults to somewhere outside the repo — but a
  public repo is public forever, so keep the data well away from it.
- **The payment QR codes are in the source.** [paymentQr.ts](src/lib/paymentQr.ts)
  contains real InstaPay codes, the account-holder name and masked account
  numbers. Publishing the repo publishes those. They are codes for *receiving*
  money so the risk is limited, but if that is not wanted, use a private repo
  or replace them before pushing.

GitHub Pages is static hosting, so there is no server-side storage: the data
file above is the way to keep data off the browser, and the app cannot write
back into the repository.

## Backups

Settings → Data exports everything as JSON and restores from the same format.
Clearing browser site data for this origin deletes the store, so export first.

The persisted state is versioned, and `migrate` in
[src/store/useStore.ts](src/store/useStore.ts) runs against whatever an existing
browser holds:

| Version | Change |
|---|---|
| v1, v2 | Register-based model. Dropped on upgrade; it cannot be mapped onto v3. |
| v3 | Credit-account model. |
| v4 | Renamed the `utang` settlement value to `credit`; existing records are rewritten in place. |
| v5 | Added parking as a separate register. |
| v6 | Folded parking onto the customer. v5 parkers are matched to customers by name and their rate carried over; their parking payments join the single payment stream tagged "Parking (carried over)". A v5 parker with no matching customer is dropped, since a fee has to belong to someone. |
| v7 | Added the vault and removed per-customer credit limits. The vault starts empty on upgrade — there is no way to know what was in the drawer before it was tracked, so count it in once to set the opening figure. |
| v8 | Renamed the GCash payment method to Maya and added bank transfer. Existing records are rewritten from `gcash` to `maya`. |

Settings are merged over the defaults on every migration, so a field added in a
later version is filled in rather than left undefined.

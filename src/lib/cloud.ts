import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoreSnapshot } from '../types'

/**
 * Talking to Supabase. The project details are entered in Settings rather
 * than baked into the build, so the app can be pointed at a project without
 * a rebuild and the key never has to sit in the repository.
 *
 * The anon key is public by design — a static site cannot hide it. What keeps
 * the data private is the row-level security policy in supabase/schema.sql,
 * which limits every row to the account that owns it.
 */

const CONFIG_KEY = 'mykelhub.cloud'

export interface CloudConfig {
  url: string
  anonKey: string
}

export function readConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return fromEnv()
    const parsed = JSON.parse(raw) as Partial<CloudConfig>
    if (!parsed.url || !parsed.anonKey) return fromEnv()
    return { url: parsed.url, anonKey: parsed.anonKey }
  } catch {
    return fromEnv()
  }
}

/**
 * Where the project came from: saved on this device, which can be changed
 * from the app, or built in, which only a new build can change.
 */
export function configSource(): 'saved' | 'built-in' | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<CloudConfig>) : null
    if (parsed?.url && parsed.anonKey) return 'saved'
  } catch {
    /* storage unavailable or unreadable: fall through to the build */
  }
  return fromEnv() ? 'built-in' : null
}

/** A project baked in at build time, for anyone who prefers it that way. */
function fromEnv(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && anonKey ? { url, anonKey } : null
}

export function writeConfig(config: CloudConfig | null): void {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    else localStorage.removeItem(CONFIG_KEY)
  } catch {
    /* storage unavailable */
  }
}

/**
 * The project URL the client wants, from whatever was pasted.
 *
 * The dashboard's Data API page shows the REST endpoint, ending /rest/v1/,
 * and the client appends that path itself. Pasting what is on screen is the
 * obvious thing to do, so trim it here rather than rejecting it.
 */
export function tidyUrl(url: string): string {
  return url
    .trim()
    .replace(/[/]+$/, '')
    .replace(/[/](?:rest|auth|storage|realtime|functions)[/]v[0-9]+$/i, '')
    .replace(/[/]+$/, '')
}

export function urlLooksValid(url: string): boolean {
  return /^https:[/][/][^\s/]+[.]supabase[.]co$/i.test(tidyUrl(url))
}

/** The role baked into a legacy Supabase JWT key, if it is one. */
function jwtRole(key: string): string | null {
  try {
    const payload = key.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return (JSON.parse(json) as { role?: string }).role ?? null
  } catch {
    return null
  }
}

export type KeyVerdict = { ok: true } | { ok: false; reason: string }

/**
 * Which key was pasted. This is a safety check, not a formality: the API Keys
 * page shows the secret key right beside the public one, and a secret key in
 * a static site bypasses every row-level policy, so anyone opening the page
 * could read and delete the lot. Better to refuse it than to store it.
 */
export function checkAnonKey(key: string): KeyVerdict {
  const k = key.trim()
  if (!k) return { ok: false, reason: 'Paste the key from Settings, API Keys.' }

  if (k.startsWith('sb_secret_')) {
    return {
      ok: false,
      reason:
        'That is the secret key. It would give anyone who opens this app full access to your database. Use the publishable key instead.',
    }
  }
  if (k.startsWith('sb_publishable_')) return { ok: true }

  if (k.startsWith('eyJ')) {
    const role = jwtRole(k)
    if (role === 'service_role') {
      return {
        ok: false,
        reason:
          'That is the service_role key. It ignores the security policy, so anyone opening this app could read every customer. Use the anon public key instead.',
      }
    }
    if (role === 'anon') return { ok: true }
    return { ok: false, reason: 'That key is not the anon public key.' }
  }

  return { ok: false, reason: 'That does not look like a Supabase key.' }
}

export function configLooksValid(config: CloudConfig): boolean {
  return urlLooksValid(config.url) && checkAnonKey(config.anonKey).ok
}

let client: SupabaseClient | null = null
let clientKey = ''

/** One client per project, created on first use so the SDK loads lazily. */
export async function getClient(): Promise<SupabaseClient | null> {
  const config = readConfig()
  if (!config) return null

  const key = `${tidyUrl(config.url)}|${config.anonKey}`
  if (client && clientKey === key) return client

  const { createClient } = await import('@supabase/supabase-js')
  client = createClient(tidyUrl(config.url), config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  clientKey = key
  return client
}

export function resetClient(): void {
  client = null
  clientKey = ''
}

/** The collections stored as separate rows, so a small edit is a small write. */
export const COLLECTIONS = [
  'products',
  'customers',
  'sales',
  'payments',
  'movements',
  'vault',
  'settings',
] as const

export type Collection = (typeof COLLECTIONS)[number]

export interface RemoteRow {
  collection: Collection
  data: unknown
  updated_at: string
}

export async function fetchAll(
  supabase: SupabaseClient,
  owner: string,
): Promise<RemoteRow[] | null> {
  const { data, error } = await supabase
    .from('store_data')
    .select('collection, data, updated_at')
    .eq('owner', owner)
  if (error) throw new Error(error.message)
  return (data as RemoteRow[]) ?? null
}

export async function pushCollections(
  supabase: SupabaseClient,
  owner: string,
  snapshot: StoreSnapshot,
  only?: Collection[],
): Promise<void> {
  const wanted = only ?? [...COLLECTIONS]
  const rows = wanted.map((collection) => ({
    owner,
    collection,
    data: snapshot[collection] as unknown,
  }))
  const { error } = await supabase.from('store_data').upsert(rows, { onConflict: 'owner,collection' })
  if (error) throw new Error(error.message)
}

/** Rebuilds a snapshot from the rows, falling back to what is already local. */
export function rowsToSnapshot(rows: RemoteRow[], fallback: StoreSnapshot): StoreSnapshot {
  const byName = new Map(rows.map((r) => [r.collection, r.data]))
  const pick = <K extends Collection>(name: K): StoreSnapshot[K] =>
    (byName.get(name) as StoreSnapshot[K]) ?? fallback[name]

  return {
    version: fallback.version,
    savedAt: new Date().toISOString(),
    products: pick('products'),
    customers: pick('customers'),
    sales: pick('sales'),
    payments: pick('payments'),
    movements: pick('movements'),
    vault: pick('vault'),
    settings: pick('settings'),
  }
}

export function newestTimestamp(rows: RemoteRow[]): string | null {
  return rows.reduce<string | null>(
    (latest, row) => (latest === null || row.updated_at > latest ? row.updated_at : latest),
    null,
  )
}

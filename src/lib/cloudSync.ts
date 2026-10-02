import { create } from 'zustand'
import { useStore } from '../store/useStore'
import {
  COLLECTIONS,
  fetchAll,
  getClient,
  newestTimestamp,
  pushCollections,
  readConfig,
  resetClient,
  rowsToSnapshot,
  writeConfig,
  type Collection,
  type CloudConfig,
} from './cloud'

export type CloudState =
  | 'off' // no project configured
  | 'starting' // a project is configured; checking for a saved sign-in
  | 'signed-out'
  | 'syncing'
  | 'ready'
  | 'offline' // configured and signed in, but the network is not answering
  | 'conflict' // this device and the cloud have both moved on
  | 'error'

interface CloudSyncState {
  state: CloudState
  email: string | null
  lastSyncedAt: string | null
  pendingCount: number
  message: string | null
  /** Chosen on the login page: work on this device without a cloud project. */
  localOnly: boolean

  configure: (config: CloudConfig) => Promise<void>
  disconnect: () => Promise<void>
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
  resolveConflict: (keep: 'cloud' | 'device') => Promise<void>
  chooseLocalOnly: () => void
}

/** Collections edited since the last successful sync. */
const dirty = new Set<Collection>()
let ownerId: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** Set while writing remote data into the store, so it is not pushed straight back. */
let applying = false

const SYNCED_AT_KEY = 'mykelhub.cloud.syncedAt'
/** Who last signed in here, so the store still opens when the network does not. */
const ACCOUNT_KEY = 'mykelhub.cloud.account'
const LOCAL_ONLY_KEY = 'mykelhub.localOnly'

/**
 * Supabase's auth errors are short and assume you know your way around the
 * dashboard. Say what to actually do, since the fix is usually a setting
 * rather than anything the person typed.
 */
function explainAuthError(message: string): string {
  const m = message.toLowerCase()

  if (m.includes('not confirmed')) {
    return 'This account still needs confirming. The quickest fix is in Supabase: Authentication, Users, open the account and confirm it there. Or turn confirmation off under Authentication, Sign In / Providers, Email.'
  }
  if (m.includes('invalid login credentials')) {
    return 'That email and password did not match. If this is the first time, use Create the account instead.'
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'That account already exists, so use Sign in rather than Create the account.'
  }
  if (m.includes('password') && m.includes('6')) {
    return 'The password needs to be at least six characters.'
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'Sign-ups are turned off for this project. Create the account in Supabase under Authentication, Users, then sign in here.'
  }
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'Could not reach the project. Check the connection, and that the project URL is right.'
  }
  return message
}

function readSyncedAt(): string | null {
  try {
    return localStorage.getItem(SYNCED_AT_KEY)
  } catch {
    return null
  }
}
function writeSyncedAt(at: string | null): void {
  try {
    if (at) localStorage.setItem(SYNCED_AT_KEY, at)
    else localStorage.removeItem(SYNCED_AT_KEY)
  } catch {
    /* storage unavailable */
  }
}

function readAccount(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_KEY)
  } catch {
    return null
  }
}
function writeAccount(email: string | null): void {
  try {
    if (email) localStorage.setItem(ACCOUNT_KEY, email)
    else localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    /* storage unavailable */
  }
}

function readLocalOnly(): boolean {
  try {
    return localStorage.getItem(LOCAL_ONLY_KEY) === '1'
  } catch {
    return false
  }
}
function writeLocalOnly(on: boolean): void {
  try {
    if (on) localStorage.setItem(LOCAL_ONLY_KEY, '1')
    else localStorage.removeItem(LOCAL_ONLY_KEY)
  } catch {
    /* storage unavailable */
  }
}

/** A failure to reach the project, as opposed to the project saying no. */
function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '')
  return /fetch|network|load failed|timed? ?out/i.test(message)
}

function applyRemote(rows: Parameters<typeof rowsToSnapshot>[0]): void {
  const merged = rowsToSnapshot(rows, useStore.getState().snapshot())
  applying = true
  useStore.getState().replaceAll(merged)
  applying = false
  dirty.clear()
}

export const useCloudSync = create<CloudSyncState>((set, get) => ({
  state: readConfig() ? 'starting' : 'off',
  email: null,
  lastSyncedAt: readSyncedAt(),
  pendingCount: 0,
  message: null,
  localOnly: readLocalOnly(),

  configure: async (config) => {
    watchStore()
    writeConfig(config)
    resetClient()
    ownerId = null
    set({ state: 'signed-out', email: null, message: null })
    await restoreSession(set)
  },

  disconnect: async () => {
    const supabase = await getClient()
    if (supabase) await supabase.auth.signOut().catch(() => undefined)
    writeConfig(null)
    writeSyncedAt(null)
    writeAccount(null)
    writeLocalOnly(true)
    resetClient()
    ownerId = null
    dirty.clear()
    set({
      state: 'off',
      email: null,
      lastSyncedAt: null,
      pendingCount: 0,
      message: null,
      localOnly: true,
    })
  },

  signIn: async (email, password) => {
    const supabase = await getClient()
    if (!supabase) return false
    set({ state: 'syncing', message: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      set({
        state: 'signed-out',
        message: error ? explainAuthError(error.message) : 'Could not sign in.',
      })
      return false
    }
    ownerId = data.user.id
    writeAccount(data.user.email ?? email)
    set({ email: data.user.email ?? email })
    await get().syncNow()
    return true
  },

  signUp: async (email, password) => {
    const supabase = await getClient()
    if (!supabase) return false
    set({ state: 'syncing', message: null })
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ state: 'signed-out', message: explainAuthError(error.message) })
      return false
    }
    // Projects with email confirmation on return no session until confirmed.
    if (!data.session) {
      set({
        state: 'signed-out',
        message:
          'Account created, but the project wants it confirmed by email first. Confirming from the dashboard is easier: Supabase, Authentication, Users, open the account and confirm it. Then sign in here.',
      })
      return false
    }
    ownerId = data.user?.id ?? null
    writeAccount(data.user?.email ?? email)
    set({ email: data.user?.email ?? email })
    await get().syncNow()
    return true
  },

  signOut: async () => {
    const supabase = await getClient()
    if (supabase) await supabase.auth.signOut().catch(() => undefined)
    ownerId = null
    writeAccount(null)
    dirty.clear()
    set({ state: 'signed-out', email: null, pendingCount: 0, message: null })
  },

  syncNow: async () => {
    const supabase = await getClient()
    if (!supabase || !ownerId) return
    set({ state: 'syncing', message: null })

    try {
      const rows = (await fetchAll(supabase, ownerId)) ?? []
      const remoteAt = newestTimestamp(rows)
      const syncedAt = readSyncedAt()
      const hasLocalEdits = dirty.size > 0

      // Nothing up there yet: this device seeds the account.
      if (rows.length === 0) {
        await pushCollections(supabase, ownerId, useStore.getState().snapshot())
        dirty.clear()
        const now = new Date().toISOString()
        writeSyncedAt(now)
        set({ state: 'ready', lastSyncedAt: now, pendingCount: 0 })
        return
      }

      // Both sides moved since this device last synced. Never silently pick
      // one: unsent work here and newer work there are both real.
      const remoteMovedOn = remoteAt !== null && (syncedAt === null || remoteAt > syncedAt)
      if (hasLocalEdits && remoteMovedOn) {
        set({
          state: 'conflict',
          pendingCount: dirty.size,
          message:
            'This device has changes that were never sent, and the cloud has newer data. Choose which to keep.',
        })
        return
      }

      if (remoteMovedOn) {
        applyRemote(rows)
        const now = new Date().toISOString()
        writeSyncedAt(now)
        set({ state: 'ready', lastSyncedAt: now, pendingCount: 0 })
        return
      }

      if (hasLocalEdits) {
        await pushCollections(supabase, ownerId, useStore.getState().snapshot(), [...dirty])
        dirty.clear()
      }
      const now = new Date().toISOString()
      writeSyncedAt(now)
      set({ state: 'ready', lastSyncedAt: now, pendingCount: 0 })
    } catch (error) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      set({
        state: offline ? 'offline' : 'error',
        pendingCount: dirty.size,
        message: offline
          ? 'No connection. Changes are kept on this device and will go up when you are back online.'
          : error instanceof Error
            ? error.message
            : 'Could not reach the cloud.',
      })
    }
  },

  resolveConflict: async (keep) => {
    const supabase = await getClient()
    if (!supabase || !ownerId) return
    set({ state: 'syncing', message: null })
    try {
      if (keep === 'cloud') {
        const rows = (await fetchAll(supabase, ownerId)) ?? []
        applyRemote(rows)
      } else {
        await pushCollections(supabase, ownerId, useStore.getState().snapshot())
        dirty.clear()
      }
      const now = new Date().toISOString()
      writeSyncedAt(now)
      set({ state: 'ready', lastSyncedAt: now, pendingCount: 0 })
    } catch (error) {
      set({ state: 'error', message: error instanceof Error ? error.message : 'Sync failed.' })
    }
  },

  chooseLocalOnly: () => {
    writeLocalOnly(true)
    set({ localOnly: true })
  },
}))

type Setter = (partial: Partial<CloudSyncState>) => void

/**
 * Picks up a saved sign-in. When the project cannot be reached, someone who
 * signed in here before keeps working offline rather than being locked out of
 * their own store; their edits wait and go up once the connection is back.
 */
async function restoreSession(set: Setter): Promise<void> {
  const offline = () => {
    const known = readAccount()
    if (known) {
      set({
        state: 'offline',
        email: known,
        message: 'No connection. Changes are kept on this device and go up when you are back online.',
      })
      return true
    }
    return false
  }

  try {
    const supabase = await getClient()
    if (!supabase) {
      set({ state: 'off' })
      return
    }
    const { data, error } = await supabase.auth.getSession()
    if (data.session?.user) {
      ownerId = data.session.user.id
      writeAccount(data.session.user.email ?? null)
      set({ email: data.session.user.email ?? null })
      await useCloudSync.getState().syncNow()
      return
    }
    if (error && isNetworkError(error) && offline()) return
    set({ state: 'signed-out', email: null })
  } catch (error) {
    if (isNetworkError(error) && offline()) return
    set({
      state: 'signed-out',
      email: null,
      message: 'Could not reach the cloud. Check the connection, then sign in.',
    })
  }
}

let watching = false

/**
 * Watch the store for edits. Installed regardless of whether a project is
 * configured yet: the usual path is to configure it from Settings *after*
 * the page has loaded, and if the watcher only went on at start-up then
 * every edit made in that session would quietly never be uploaded.
 */
function watchStore(): void {
  if (watching) return
  watching = true

  useStore.subscribe((state, prev) => {
    if (applying) return
    for (const collection of COLLECTIONS) {
      if (state[collection] !== prev[collection]) dirty.add(collection)
    }
    if (dirty.size === 0) return

    useCloudSync.setState({ pendingCount: dirty.size })

    // Still kept, just not sent yet: they go up on sign-in, or once the
    // conflict is settled.
    const { state: status } = useCloudSync.getState()
    if (status === 'conflict' || status === 'signed-out' || status === 'off' || status === 'starting') {
      return
    }

    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void useCloudSync.getState().syncNow()
    }, 1200)
  })

  // Catch up as soon as the connection comes back. A device that opened
  // offline never got a session, so it picks one up first.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (!ownerId && useCloudSync.getState().state === 'offline') {
        void restoreSession((p) => useCloudSync.setState(p))
      } else if (dirty.size > 0) {
        void useCloudSync.getState().syncNow()
      }
    })
  }
}

/**
 * Reconnects to the cloud, if one is configured, and keeps it in step.
 * Pushes are debounced and only carry the collections that actually changed,
 * so renaming a product does not re-upload the sales history.
 */
export async function initCloudSync(): Promise<void> {
  watchStore()
  if (!readConfig()) return
  await restoreSession((p) => useCloudSync.setState(p))
}

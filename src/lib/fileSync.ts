import { create } from 'zustand'
import { useStore } from '../store/useStore'
import {
  chooseExistingFile,
  chooseNewFile,
  fileStorageSupported,
  forgetFile,
  permissionState,
  readFile,
  recallFile,
  rememberFile,
  requestPermission,
  writeFile,
  type StoreFileHandle,
} from './fileStore'
import type { StoreSnapshot } from '../types'

export type SyncState =
  | 'unsupported' // browser cannot do this
  | 'off' // no file chosen
  | 'needs-permission' // file remembered, but the browser dropped the grant
  | 'ready' // saving to the file
  | 'saving'
  | 'error'

interface FileSyncState {
  state: SyncState
  fileName: string | null
  lastSavedAt: string | null
  message: string | null
  connectNew: () => Promise<void>
  connectExisting: () => Promise<void>
  grantPermission: () => Promise<void>
  disconnect: () => Promise<void>
  saveNow: () => Promise<void>
}

let handle: StoreFileHandle | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** Set while loading a file into the store, so the write-back is not retriggered. */
let applying = false

/** A file is only trusted if it carries the collections we expect. */
function looksLikeSnapshot(data: unknown): data is StoreSnapshot {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Partial<StoreSnapshot>
  return (
    Array.isArray(d.products) &&
    Array.isArray(d.customers) &&
    Array.isArray(d.sales) &&
    Array.isArray(d.payments)
  )
}

export const useFileSync = create<FileSyncState>((set, get) => ({
  state: fileStorageSupported() ? 'off' : 'unsupported',
  fileName: null,
  lastSavedAt: null,
  message: null,

  connectNew: async () => {
    const picked = await chooseNewFile()
    if (!picked) return
    handle = picked
    await rememberFile(picked)
    // A brand-new file is empty, so seed it from what is already in the app.
    set({ state: 'ready', fileName: picked.name, message: null })
    await get().saveNow()
  },

  connectExisting: async () => {
    const picked = await chooseExistingFile()
    if (!picked) return
    try {
      const data = await readFile(picked)
      if (data !== null && !looksLikeSnapshot(data)) {
        set({ state: 'error', message: 'That file is not a MykelHub data file.' })
        return
      }
      handle = picked
      await rememberFile(picked)
      if (data === null) {
        // Empty file: keep what is in the app and write it out.
        set({ state: 'ready', fileName: picked.name, message: null })
        await get().saveNow()
      } else {
        applying = true
        useStore.getState().replaceAll(data)
        applying = false
        set({
          state: 'ready',
          fileName: picked.name,
          lastSavedAt: new Date().toISOString(),
          message: null,
        })
      }
    } catch {
      set({ state: 'error', message: 'That file could not be read.' })
    }
  },

  grantPermission: async () => {
    if (!handle) return
    if (!(await requestPermission(handle))) {
      set({ state: 'needs-permission' })
      return
    }
    await loadFromFile(set)
  },

  disconnect: async () => {
    handle = null
    await forgetFile()
    set({ state: 'off', fileName: null, lastSavedAt: null, message: null })
  },

  saveNow: async () => {
    if (!handle) return
    set({ state: 'saving' })
    try {
      await writeFile(handle, useStore.getState().snapshot())
      set({ state: 'ready', lastSavedAt: new Date().toISOString(), message: null })
    } catch {
      set({
        state: 'error',
        message: 'The data file could not be written. It may have been moved or deleted.',
      })
    }
  },
}))

type Setter = (partial: Partial<FileSyncState>) => void

async function loadFromFile(set: Setter): Promise<void> {
  if (!handle) return
  try {
    const data = await readFile(handle)
    if (data === null) {
      // Nothing in the file yet; the app's own copy is the better source.
      set({ state: 'ready', fileName: handle.name, message: null })
      await useFileSync.getState().saveNow()
      return
    }
    if (!looksLikeSnapshot(data)) {
      set({ state: 'error', fileName: handle.name, message: 'The data file could not be read.' })
      return
    }
    applying = true
    useStore.getState().replaceAll(data)
    applying = false
    set({
      state: 'ready',
      fileName: handle.name,
      lastSavedAt: new Date().toISOString(),
      message: null,
    })
  } catch {
    set({ state: 'error', message: 'The data file could not be read.' })
  }
}

/**
 * Reconnects to the remembered file and keeps it in step with the app.
 * Called once at start-up. Writes are debounced so a burst of edits costs one
 * write rather than twenty.
 */
export async function initFileSync(): Promise<void> {
  if (!fileStorageSupported()) return

  const remembered = await recallFile()
  if (remembered) {
    handle = remembered
    const state = await permissionState(remembered)
    if (state === 'granted') {
      await loadFromFile((p) => useFileSync.setState(p))
    } else {
      // Browsers drop the grant between sessions and only restore it after a
      // click, so the interface has to ask rather than silently failing.
      useFileSync.setState({ state: 'needs-permission', fileName: remembered.name })
    }
  }

  useStore.subscribe(() => {
    if (!handle || applying) return
    if (useFileSync.getState().state === 'needs-permission') return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void useFileSync.getState().saveNow()
    }, 600)
  })
}

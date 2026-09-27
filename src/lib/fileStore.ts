/**
 * Keeping the store in a real JSON file on disk, using the File System Access
 * API. No server is involved, so this works the same whether the app is opened
 * from XAMPP, from GitHub Pages, or from a file on a USB stick — the data never
 * leaves the machine it was entered on.
 *
 * Chrome and Edge support this. Firefox and Safari do not, and neither does any
 * browser on iOS, so everything here degrades to browser storage rather than
 * failing.
 */

/** Minimal shape of the bits of the API we use; TS DOM types lag behind. */
interface PickerOptions {
  suggestedName?: string
  types?: Array<{ description: string; accept: Record<string, string[]> }>
  multiple?: boolean
}
interface StoreFileHandle {
  readonly name: string
  readonly kind: 'file'
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  queryPermission(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  isSameEntry(other: StoreFileHandle): Promise<boolean>
}
type PickerWindow = Window & {
  showSaveFilePicker?: (o: PickerOptions) => Promise<StoreFileHandle>
  showOpenFilePicker?: (o: PickerOptions) => Promise<StoreFileHandle[]>
}

const JSON_TYPE = {
  description: 'MykelHub data',
  accept: { 'application/json': ['.json'] as string[] },
}

export function fileStorageSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

// ---------------------------------------------------------------------------
// Remembering the file between visits
//
// A file handle survives a reload only if it is kept in IndexedDB; it cannot be
// serialised to localStorage. This is a two-row database, so it is hand-rolled
// rather than pulling in a wrapper.
// ---------------------------------------------------------------------------

const DB_NAME = 'mykelhub.files'
const STORE = 'handles'
const KEY = 'store-file'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function rememberFile(handle: StoreFileHandle): Promise<void> {
  await idb('readwrite', (s) => s.put(handle, KEY))
}

export async function recallFile(): Promise<StoreFileHandle | null> {
  try {
    return (await idb<StoreFileHandle | undefined>('readonly', (s) => s.get(KEY))) ?? null
  } catch {
    return null
  }
}

export async function forgetFile(): Promise<void> {
  try {
    await idb('readwrite', (s) => s.delete(KEY))
  } catch {
    /* nothing remembered */
  }
}

// ---------------------------------------------------------------------------
// Choosing, reading and writing
// ---------------------------------------------------------------------------

/** Create or choose the file the store lives in. Null if the user cancels. */
export async function chooseNewFile(): Promise<StoreFileHandle | null> {
  const picker = (window as PickerWindow).showSaveFilePicker
  if (!picker) return null
  try {
    return await picker({ suggestedName: 'mykelhub-data.json', types: [JSON_TYPE] })
  } catch {
    return null // the user dismissed the dialog
  }
}

/** Open an existing data file, e.g. one carried over from another machine. */
export async function chooseExistingFile(): Promise<StoreFileHandle | null> {
  const picker = (window as PickerWindow).showOpenFilePicker
  if (!picker) return null
  try {
    const [handle] = await picker({ types: [JSON_TYPE], multiple: false })
    return handle ?? null
  } catch {
    return null
  }
}

/**
 * Whether we may still write to the remembered file. Browsers drop the grant
 * between sessions, so it has to be re-requested, and that needs a click.
 */
export async function permissionState(handle: StoreFileHandle): Promise<PermissionState> {
  try {
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

export async function requestPermission(handle: StoreFileHandle): Promise<boolean> {
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

export async function readFile(handle: StoreFileHandle): Promise<unknown> {
  const text = await (await handle.getFile()).text()
  // A file that has just been created is empty, which is not an error.
  if (!text.trim()) return null
  return JSON.parse(text)
}

export async function writeFile(handle: StoreFileHandle, data: unknown): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(JSON.stringify(data, null, 2))
  } finally {
    await writable.close()
  }
}

export type { StoreFileHandle }

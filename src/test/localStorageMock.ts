/**
 * Minimal in-memory `Storage` for tests, with switches for the two failure
 * modes the app has to survive: storage being unavailable and storage being
 * full.
 */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  /** When true, every write throws like a quota error. */
  full = false

  get length(): number {
    return this.data.size
  }

  clear(): void {
    this.data.clear()
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  setItem(key: string, value: string): void {
    if (this.full) throw new DOMException('QuotaExceededError')
    this.data.set(key, value)
  }
}

/** Install a fresh MemoryStorage as `globalThis.localStorage`. */
export function installMemoryStorage(): MemoryStorage {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  return storage
}

/** Make `localStorage` throw on access, like a blocked cross-origin frame. */
export function installBlockedStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Access to localStorage is denied')
    },
  })
}

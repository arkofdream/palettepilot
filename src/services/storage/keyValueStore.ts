import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';

/**
 * Minimal async key-value contract. Repositories depend on this interface only,
 * so IndexedDB can be swapped for an HTTP API (or a test double) without touching
 * repository or UI code.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const IDB_TIMEOUT_MS = 600;

function withTimeout<T>(promise: Promise<T>, ms = IDB_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IndexedDB timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Resilient browser key-value store: uses IndexedDB when healthy, and transparently
 * falls back to localStorage / in-memory storage when IndexedDB is unavailable,
 * blocked by privacy settings, or throttled by browser disk-quota policies.
 */
export class IndexedDbStore implements KeyValueStore {
  private store: UseStore | null = null;
  private fallback: LocalStorageFallbackStore;
  private useFallback = false;

  constructor(private namespace: string, storeName: string) {
    this.fallback = new LocalStorageFallbackStore(this.namespace);
    try {
      if (typeof indexedDB !== 'undefined') {
        this.store = createStore(namespace, storeName);
      } else {
        this.useFallback = true;
      }
    } catch {
      this.useFallback = true;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.useFallback || !this.store) return this.fallback.get<T>(key);
    try {
      const val = await withTimeout(get<T>(key, this.store));
      if (val !== undefined) return val;
      return this.fallback.get<T>(key);
    } catch {
      this.useFallback = true;
      return this.fallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    // Always mirror JSON-serializable records to localStorage fallback for instant recovery
    await this.fallback.set(key, value);
    if (this.useFallback || !this.store) return;
    try {
      await withTimeout(set(key, value, this.store));
    } catch {
      this.useFallback = true;
    }
  }

  async delete(key: string): Promise<void> {
    await this.fallback.delete(key);
    if (this.useFallback || !this.store) return;
    try {
      await withTimeout(del(key, this.store));
    } catch {
      this.useFallback = true;
    }
  }

  async keys(): Promise<string[]> {
    if (this.useFallback || !this.store) return this.fallback.keys();
    try {
      const idbKeys = (await withTimeout(keys(this.store))).map(String);
      const fbKeys = await this.fallback.keys();
      return [...new Set([...idbKeys, ...fbKeys])];
    } catch {
      this.useFallback = true;
      return this.fallback.keys();
    }
  }
}

class LocalStorageFallbackStore implements KeyValueStore {
  private memory = new Map<string, unknown>();

  constructor(private prefix: string) {}

  private lsKey(key: string) {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.memory.has(key)) return this.memory.get(key) as T;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.lsKey(key));
        if (raw !== null) return JSON.parse(raw) as T;
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.memory.set(key, value);
    try {
      if (typeof localStorage !== 'undefined' && !(value instanceof Blob)) {
        localStorage.setItem(this.lsKey(key), JSON.stringify(value));
      }
    } catch {
      // If localStorage is unavailable or full, memory store still holds session value
    }
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.lsKey(key));
      }
    } catch {
      // ignore
    }
  }

  async keys(): Promise<string[]> {
    const out = new Set<string>(this.memory.keys());
    try {
      if (typeof localStorage !== 'undefined') {
        const p = `${this.prefix}:`;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(p)) out.add(k.slice(p.length));
        }
      }
    } catch {
      // ignore
    }
    return [...out];
  }
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, unknown>();

  async get<T>(key: string) {
    return this.map.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async keys() {
    return [...this.map.keys()];
  }
}

export class StorageError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

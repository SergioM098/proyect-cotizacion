interface TtlEntry<T> {
  data: T;
  lastAccessed: number;
}

export class TtlMap<T> {
  private store = new Map<string, TtlEntry<T>>();
  private timer: ReturnType<typeof setInterval>;
  private onExpire?: (key: string, value: T) => void;

  constructor(
    private maxAgeMs: number,
    options?: { cleanupIntervalMs?: number; onExpire?: (key: string, value: T) => void }
  ) {
    const cleanupMs = options?.cleanupIntervalMs ?? 60_000;
    this.onExpire = options?.onExpire;
    this.timer = setInterval(() => this.cleanup(), cleanupMs);
    if (this.timer.unref) this.timer.unref();
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    entry.lastAccessed = Date.now();
    return entry.data;
  }

  set(key: string, value: T): void {
    this.store.set(key, { data: value, lastAccessed: Date.now() });
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  get size(): number {
    return this.store.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.lastAccessed > this.maxAgeMs) {
        if (this.onExpire) this.onExpire(key, entry.data);
        this.store.delete(key);
      }
    }
  }
}

import type { ContextSnapshot } from "@/lib/types";
import type { SnapshotCacheLike } from "./types";

export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  snapshot: ContextSnapshot;
  storedAt: number;
}

/**
 * 極簡記憶體快取。只用於「實時資料逾時後仍有上一份可用資料」這一個用途；
 * 不引入資料庫或外部快取服務（見專案範圍限制）。
 */
export class SnapshotCache implements SnapshotCacheLike {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS) {}

  get(key: string, nowMs: number): ContextSnapshot | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (nowMs - entry.storedAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.snapshot;
  }

  set(key: string, snapshot: ContextSnapshot, nowMs: number): void {
    this.store.set(key, { snapshot, storedAt: nowMs });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** 進程內共用的快取；測試可自行建立新的實例以避免互相污染。 */
export const snapshotCache = new SnapshotCache();

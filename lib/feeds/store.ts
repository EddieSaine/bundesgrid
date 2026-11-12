/**
 * Optional Postgres persistence for feed snapshots and upstream checks.
 * The dashboard works without a database: every function here degrades to a no-op when DATABASE_URL is
 * missing or the database is unreachable (a circuit breaker stops retrying for five minutes).
 */
import type { FeedId, FeedState } from '@/lib/domain/types';

let breakerUntil = 0;
const BREAKER_MS = 5 * 60_000;
const CHECK_RETENTION_MS = 48 * 3_600_000;
const MAX_SNAPSHOT_BYTES = 350_000;

async function client() {
  if (!process.env.DATABASE_URL || Date.now() < breakerUntil) return null;
  try {
    const mod = await import('@/lib/db');
    return mod.prisma;
  } catch {
    breakerUntil = Date.now() + BREAKER_MS;
    return null;
  }
}

function trip(e: unknown) {
  breakerUntil = Date.now() + BREAKER_MS;
  console.warn('[store] database unavailable, falling back to memory only:', e instanceof Error ? e.message.slice(0, 160) : e);
}

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function saveSnapshot(key: string, feedId: FeedId, payload: unknown, fetchedAt: number): Promise<void> {
  const db = await client();
  if (!db) return;
  try {
    const json = JSON.stringify(payload ?? null);
    if (json.length > MAX_SNAPSHOT_BYTES) return;
    const value = JSON.parse(json);
    await db.feedSnapshot.upsert({
      where: { key },
      create: { key, feedId, payload: value, fetchedAt: new Date(fetchedAt) },
      update: { payload: value, fetchedAt: new Date(fetchedAt) },
    });
  } catch (e) {
    trip(e);
  }
}

export async function readSnapshot<T>(key: string): Promise<{ data: T; fetchedAt: number } | null> {
  const db = await client();
  if (!db) return null;
  try {
    const row = await db.feedSnapshot.findUnique({ where: { key } });
    if (!row) return null;
    return { data: row.payload as T, fetchedAt: row.fetchedAt.getTime() };
  } catch (e) {
    trip(e);
    return null;
  }
}

export async function recordCheck(feedId: FeedId, status: FeedState, latencyMs: number, error?: string): Promise<void> {
  const db = await client();
  if (!db) return;
  try {
    await db.feedCheck.create({
      data: { feedId, status, latencyMs: Math.round(latencyMs), error: error ? error.slice(0, 240) : null },
    });
    // Bounded table: prune on roughly every 40th write (indexed on ts).
    if (Math.floor(Date.now() / 1000) % 40 === 0) {
      await db.feedCheck.deleteMany({ where: { ts: { lt: new Date(Date.now() - CHECK_RETENTION_MS) } } });
    }
  } catch (e) {
    trip(e);
  }
}

export interface CheckStats {
  total: number;
  ok: number;
}

let statsCache: { at: number; value: Record<string, CheckStats> } | null = null;

/** Successful / total upstream attempts per feed over the last 24 h (cached for 60 s). */
export async function checkStats24h(): Promise<Record<string, CheckStats>> {
  if (statsCache && Date.now() - statsCache.at < 60_000) return statsCache.value;
  const db = await client();
  if (!db) return {};
  try {
    const rows = await db.feedCheck.groupBy({
      by: ['feedId', 'status'],
      where: { ts: { gte: new Date(Date.now() - 24 * 3_600_000) } },
      _count: { _all: true },
    });
    const out: Record<string, CheckStats> = {};
    for (const r of rows) {
      const cur = out[r.feedId] ?? { total: 0, ok: 0 };
      const n = r._count?._all ?? 0;
      cur.total += n;
      if (r.status === 'LIVE') cur.ok += n;
      out[r.feedId] = cur;
    }
    statsCache = { at: Date.now(), value: out };
    return out;
  } catch (e) {
    trip(e);
    return {};
  }
}

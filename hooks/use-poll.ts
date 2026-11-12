'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  fetchedAt: number | null;
  reload: () => void;
}

/** Polls a JSON endpoint at a configurable interval; keeps the last good payload on errors. */
export function usePoll<T>(url: string, refreshMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setRefreshing(true);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res?.ok) throw new Error(`HTTP ${res?.status ?? '?'}`);
      const json = (await res.json()) as T;
      if (id !== seq.current) return;
      setData(json);
      setError(null);
      setFetchedAt(Date.now());
    } catch (e) {
      console.error('poll failed', url, e);
      if (id === seq.current) setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [url]);

  useEffect(() => {
    setLoading(true);
    void load();
    if (!refreshMs || refreshMs <= 0) return undefined;
    const t = setInterval(() => { if (!document?.hidden) void load(); }, refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);

  return { data, error, loading, refreshing, fetchedAt, reload: () => { void load(); } };
}

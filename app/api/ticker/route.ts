import { NextResponse } from 'next/server';
import { buildTicker } from '@/lib/views';
import { allFeedStatuses } from '@/lib/feeds/core';
import type { StreamPayload } from '@/lib/domain/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload: StreamPayload = { ts: new Date().toISOString(), ticker: await buildTicker(), feeds: await allFeedStatuses() };
    return NextResponse.json(payload);
  } catch (e) {
    console.error('ticker failed', e);
    return NextResponse.json({ error: 'Ticker failed' }, { status: 500 });
  }
}

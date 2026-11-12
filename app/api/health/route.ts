import { NextResponse } from 'next/server';
import { allFeedStatuses } from '@/lib/feeds/core';
import { databaseConfigured } from '@/lib/feeds/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ts: new Date().toISOString(), feeds: await allFeedStatuses(), database: databaseConfigured() });
  } catch (e) {
    console.error('health failed', e);
    return NextResponse.json({ error: 'Health failed' }, { status: 500 });
  }
}

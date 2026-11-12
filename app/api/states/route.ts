import { NextResponse } from 'next/server';
import { buildStateRows } from '@/lib/views';
import { STATE_METRICS } from '@/lib/data/states';
import { oldestUpdate, statusOf } from '@/lib/feeds/core';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows, results } = await buildStateRows();
    return NextResponse.json({
      data_as_of: (results ?? []).length ? oldestUpdate(results) : new Date().toISOString(),
      rows,
      metrics: STATE_METRICS,
      feeds: statusOf(results ?? []),
    });
  } catch (e) {
    console.error('states failed', e);
    return NextResponse.json({ error: 'State data failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { buildView } from '@/lib/views';
import { parseHorizon } from '@/lib/time';
import { oldestUpdate, statusOf } from '@/lib/feeds/core';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const url = new URL(req.url);
  try {
    const out = await buildView(view, parseHorizon(url.searchParams.get('h')), url.searchParams.get('state') || null);
    if (!out) return NextResponse.json({ error: 'Unknown view' }, { status: 404 });
    const results = out.results ?? [];
    return NextResponse.json({
      data_as_of: results.length ? oldestUpdate(results) : new Date().toISOString(),
      manifest: out.manifest,
      data: out.data,
      feeds: statusOf(results),
      horizon: out.horizon,
    });
  } catch (e) {
    console.error('dash view failed', view, e);
    return NextResponse.json({ error: 'View failed to build' }, { status: 500 });
  }
}

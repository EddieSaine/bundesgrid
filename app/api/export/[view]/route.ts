import { NextResponse } from 'next/server';
import { buildView, buildStateRows } from '@/lib/views';
import { parseHorizon } from '@/lib/time';
import { toCsv, type Row } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const dataset = url.searchParams.get('dataset');
  const h = parseHorizon(url.searchParams.get('h'));
  try {
    let data: Record<string, Row[]> = {};
    if (view === 'states') {
      data = { states: ((await buildStateRows())?.rows ?? []) as Row[] };
    } else {
      const out = await buildView(view, h, url.searchParams.get('state') || null);
      if (!out) return NextResponse.json({ error: 'Unknown view' }, { status: 404 });
      data = (out.data ?? {}) as unknown as Record<string, Row[]>;
    }
    const keys = Object.keys(data ?? {});
    const key = dataset && keys.includes(dataset) ? dataset : null;
    const name = `deutschland-${view}${key ? `-${key}` : ''}-${h}`;
    if (format === 'csv') {
      const k = key ?? keys[0];
      if (!k) return NextResponse.json({ error: 'No dataset' }, { status: 404 });
      return new Response(toCsv(data?.[k] ?? []), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` },
      });
    }
    return new Response(JSON.stringify(key ? data?.[key] : data, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.json"` },
    });
  } catch (e) {
    console.error('export failed', view, e);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

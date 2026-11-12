export type Row = Record<string, unknown>;

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Row[] | null | undefined): string {
  const safe = rows ?? [];
  const cols: string[] = [];
  safe.forEach((r: Row) => Object.keys(r ?? {}).forEach((k: string) => { if (!cols.includes(k)) cols.push(k); }));
  const lines = [cols.join(',')];
  safe.forEach((r: Row) => lines.push(cols.map((c: string) => cell(r?.[c])).join(',')));
  return lines.join('\n');
}

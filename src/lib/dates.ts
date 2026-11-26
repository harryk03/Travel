/** Date helpers working on local calendar dates as YYYY-MM-DD strings (no time zones involved). */

export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  const n = daysBetween(start, end);
  for (let i = 0; i <= Math.min(n, 120); i++) out.push(addDays(start, i));
  return out;
}

export function fmtDay(s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return parseISO(s).toLocaleDateString('en-AU', opts);
}

export function fmtRange(start: string | null, end: string | null): string {
  if (!start) return 'Dates not set';
  if (!end || end === start) return fmtDay(start, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmtDay(start, { day: 'numeric', month: 'short' })} – ${fmtDay(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

export type TripPhase =
  | { phase: 'none' }
  | { phase: 'before'; days: number }
  | { phase: 'during'; day: number; total: number }
  | { phase: 'after' };

export function tripPhase(start: string | null, end: string | null, today = todayISO()): TripPhase {
  if (!start) return { phase: 'none' };
  const last = end ?? start;
  if (today < start) return { phase: 'before', days: daysBetween(today, start) };
  if (today > last) return { phase: 'after' };
  return { phase: 'during', day: daysBetween(start, today) + 1, total: daysBetween(start, last) + 1 };
}

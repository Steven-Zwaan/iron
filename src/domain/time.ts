/** Local-day helpers. Sessions belong to the local calendar day they were started on. */

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'YYYY-MM-DD' in the device's local timezone. */
export function localDateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midnight (local) of the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Parse 'YYYY-MM-DD' as local midnight. */
export function parseLocalDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export function addDays(dateStr: string, days: number): string {
  return localDateStr(parseLocalDate(dateStr) + days * DAY_MS);
}

export function isSameLocalDay(dateStr: string, ms: number): boolean {
  return dateStr === localDateStr(ms);
}

/** First local date (inclusive) of a rolling window that ends today. */
export function rangeStartDate(now: number, rangeDays: number): string {
  return localDateStr(startOfLocalDay(now) - (rangeDays - 1) * DAY_MS);
}

/** Monday 00:00 of the week containing `ms`. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfLocalDay(ms));
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return d.getTime() - day * DAY_MS;
}

export function daysBetween(aDateStr: string, bDateStr: string): number {
  return Math.round((parseLocalDate(bDateStr) - parseLocalDate(aDateStr)) / DAY_MS);
}

export { DAY_MS };

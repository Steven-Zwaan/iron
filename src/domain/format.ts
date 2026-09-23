import { parseLocalDate, localDateStr } from './time';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "TUESDAY 22 SEPTEMBER" (caller applies the eyebrow style) */
export function longDate(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "18 Sep" or "18 Sep 2025" when not this year */
export function shortDate(dateStr: string, now = Date.now()): string {
  const d = new Date(parseLocalDate(dateStr));
  const y = new Date(now).getFullYear();
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === y ? base : `${base} ${d.getFullYear()}`;
}

/** "Today", "Yesterday", "3 days ago", "18 Sep" */
export function relativeDate(dateStr: string, now = Date.now()): string {
  const today = localDateStr(now);
  if (dateStr === today) return 'Today';
  const diff = Math.round((parseLocalDate(today) - parseLocalDate(dateStr)) / 86_400_000);
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return shortDate(dateStr, now);
}

/** "1:22" */
export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** "52 min" / "1 h 12 min" */
export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "1 h 03 m" elapsed style for the resume button */
export function elapsedLabel(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${m < 10 ? '0' : ''}${m} min`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Sentence-join: "a, b and c" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

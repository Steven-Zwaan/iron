import type { PlanDay, Session } from './types';

export const DEBT_CAP = 3;

export function performed(session: Session, exerciseId: string): boolean {
  const log = session.logs[exerciseId];
  return !!log && log.sets.some((s) => s.done && s.type !== 'warmup');
}

/**
 * Skip-debt rules (§4.5), evaluated once at finalisation:
 *   performed  -> debt = max(0, debt - 1)
 *   skipped    -> debt = min(cap, debt + 1)
 * Plan-day items that never made it into the queue also incur debt, unless Freestyle.
 */
export function applyDebt(
  debt: Record<string, number>,
  session: Session,
  planDay: PlanDay | null,
): { debt: Record<string, number>; carried: string[]; cleared: string[] } {
  const next = { ...debt };
  const carried: string[] = [];
  const cleared: string[] = [];
  const seen = new Set<string>();

  for (const ex of session.queue) {
    if (seen.has(ex)) continue;
    seen.add(ex);
    const d = next[ex] ?? 0;
    if (performed(session, ex)) {
      if (d > 0) cleared.push(ex);
      next[ex] = Math.max(0, d - 1);
    } else {
      next[ex] = Math.min(DEBT_CAP, d + 1);
      carried.push(ex);
    }
  }

  if (planDay && session.dayId) {
    for (const item of planDay.items) {
      if (seen.has(item.exerciseId)) continue;
      seen.add(item.exerciseId);
      const d = next[item.exerciseId] ?? 0;
      next[item.exerciseId] = Math.min(DEBT_CAP, d + 1);
      carried.push(item.exerciseId);
    }
  }

  for (const k of Object.keys(next)) if (!next[k]) delete next[k];
  return { debt: next, carried, cleared };
}

export function owedIds(debt: Record<string, number>): string[] {
  return Object.entries(debt)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

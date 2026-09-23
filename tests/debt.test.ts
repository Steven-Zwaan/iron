import { describe, expect, it } from 'vitest';
import { applyDebt, owedIds } from '@/domain/debt';
import { createSession, finalizeSession, logSet, skipExercise, jumpTo } from '@/domain/session';
import { EX, MONDAY, SETTINGS, THURSDAY, completedSession } from './helpers';

function mondayWithSkippedTriceps(now: number) {
  let s = createSession({ queue: MONDAY.items.map((i) => i.exerciseId), day: MONDAY, exercises: EX, settings: SETTINGS, now });
  // perform everything except tricep extension
  for (let i = 0; i < s.queue.length; i++) {
    s = jumpTo(s, i, now);
    const id = s.queue[i];
    if (id === 'cable_overhead_extension') {
      s = skipExercise(s, id, now);
      continue;
    }
    for (let k = 0; k < s.logs[id].sets.length; k++) s = logSet(s, 40, now + k);
  }
  return s;
}

describe('skip debt (§4.5 / §10.6)', () => {
  const now = Date.parse('2026-09-21T18:00:00');

  it('skipping tricep extension on Monday sets debt to 1, everything else stays 0', () => {
    const s = mondayWithSkippedTriceps(now);
    const r = finalizeSession(s, {}, MONDAY, now + 3_600_000);
    expect(r.debt).toEqual({ cable_overhead_extension: 1 });
    expect(r.carried).toEqual(['cable_overhead_extension']);
    expect(r.session.endedAt).toBe(now + 3_600_000);
    expect(owedIds(r.debt)).toEqual(['cable_overhead_extension']);
  });

  it('completing it on Thursday clears the debt to 0', () => {
    const thu = completedSession(THURSDAY, now + 3 * 86_400_000);
    const r = applyDebt({ cable_overhead_extension: 1 }, thu, THURSDAY);
    expect(r.debt.cable_overhead_extension).toBeUndefined();
    expect(r.cleared).toEqual(['cable_overhead_extension']);
  });

  it('never exceeds 3', () => {
    let debt: Record<string, number> = {};
    for (let i = 0; i < 6; i++) debt = applyDebt(debt, mondayWithSkippedTriceps(now), MONDAY).debt;
    expect(debt.cable_overhead_extension).toBe(3);
  });

  it('plan-day items never queued incur debt, but not in Freestyle', () => {
    const queue = MONDAY.items.slice(0, 7).map((i) => i.exerciseId); // dropped tricep extension from the queue
    const planned = { ...completedSession(MONDAY, now), queue, logs: Object.fromEntries(queue.map((id) => [id, completedSession(MONDAY, now).logs[id]])) };
    expect(applyDebt({}, planned, MONDAY).debt).toEqual({ cable_overhead_extension: 1 });
    const free = { ...planned, dayId: null, label: 'Freestyle' };
    expect(applyDebt({}, free, null).debt).toEqual({});
  });

  it('a warm-up alone does not count as performed', () => {
    let s = createSession({ queue: ['db_curl'], day: null, exercises: EX, settings: SETTINGS, now });
    s = logSet(s, 10, now); // only the warm-up
    expect(applyDebt({}, s, null).debt).toEqual({ db_curl: 1 });
  });
});

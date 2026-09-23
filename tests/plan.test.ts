import { describe, expect, it } from 'vitest';
import { dueDay, lastCompleted, planFromTemplate, PLAN_TEMPLATES, seedPlan } from '@/domain/plan';
import { MONDAY, THURSDAY, completedSession } from './helpers';
import { CATALOGUE_IDS } from '@/domain/exercises';

const DAY = 86_400_000;

describe('due-day selection (§10.3)', () => {
  const plan = seedPlan(0);

  it("picks today's scheduled day when it has not been done today", () => {
    const monday = Date.parse('2026-09-21T09:00:00'); // a Monday
    expect(dueDay(plan, [], monday)?.id).toBe('mon');
  });

  it('falls back to the day whose last completion is oldest', () => {
    const monday = Date.parse('2026-09-21T20:00:00');
    const doneToday = completedSession(MONDAY, monday - 3_600_000);
    const thuLastWeek = completedSession(THURSDAY, monday - 4 * DAY);
    expect(dueDay(plan, [doneToday, thuLastWeek], monday)?.id).toBe('thu');
    // Tuesday with nothing scheduled: the never-done day comes first
    const tuesday = Date.parse('2026-09-22T09:00:00');
    expect(dueDay(plan, [doneToday], tuesday)?.id).toBe('thu');
    expect(lastCompleted('mon', [doneToday])).toBe(doneToday.endedAt);
  });

  it('returns null for an empty plan', () => {
    expect(dueDay({ id: 'default', days: [], updatedAt: 0 }, [], Date.now())).toBeNull();
  });
});

describe('templates', () => {
  it('ship three templates whose exercises all exist in the catalogue', () => {
    expect(PLAN_TEMPLATES.map((t) => t.id)).toEqual(['upper_lower', 'ppl', 'full_body']);
    for (const t of PLAN_TEMPLATES) {
      const p = planFromTemplate(t, 0);
      expect(p.days.length).toBe(t.days.length);
      for (const d of p.days) for (const it of d.items) expect(CATALOGUE_IDS.has(it.exerciseId)).toBe(true);
    }
  });
});

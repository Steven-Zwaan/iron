import planSeedJson from '@shared/data/plan-seed.json';
import templatesJson from '@shared/data/plan-templates.json';
import type { Plan, PlanDay, PlanItem, Session } from './types';
import { isSameLocalDay } from './time';
import { newId } from './ids';

export const SEED_PLAN_DAYS: PlanDay[] = (planSeedJson as { days: PlanDay[] }).days;

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  days: Omit<PlanDay, 'id'>[];
}
export const PLAN_TEMPLATES: PlanTemplate[] = templatesJson as PlanTemplate[];

export function seedPlan(now = Date.now()): Plan {
  return { id: 'default', days: structuredClone(SEED_PLAN_DAYS), updatedAt: now };
}

export function emptyPlan(now = Date.now()): Plan {
  return { id: 'default', days: [], updatedAt: now };
}

export function planFromTemplate(t: PlanTemplate, now = Date.now()): Plan {
  return {
    id: 'default',
    days: t.days.map((d) => ({ ...structuredClone(d), id: newId('day') })),
    updatedAt: now,
  };
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Timestamp of the most recent finalised session for a day (0 if never). */
export function lastCompleted(dayId: string, sessions: Session[]): number {
  let best = 0;
  for (const s of sessions) if (s.dayId === dayId && s.endedAt && s.endedAt > best) best = s.endedAt;
  return best;
}

/**
 * Which day is "up next" (§10.3): today's scheduled day if it has not been done today,
 * otherwise the day whose last completion is oldest.
 */
export function dueDay(plan: Plan, sessions: Session[], now = Date.now()): PlanDay | null {
  if (!plan.days.length) return null;
  const todayWd = new Date(now).getDay();
  const scheduled = plan.days.find((d) => d.weekday === todayWd);
  const doneToday =
    !!scheduled && sessions.some((s) => s.dayId === scheduled.id && s.endedAt && isSameLocalDay(s.date, now));
  if (scheduled && !doneToday) return scheduled;
  return [...plan.days].sort((a, b) => lastCompleted(a.id, sessions) - lastCompleted(b.id, sessions))[0];
}

export function newDay(label: string, weekday?: number): PlanDay {
  return { id: newId('day'), label, weekday, items: [] };
}

export function newItem(exerciseId: string): PlanItem {
  return { exerciseId, workSets: 2, dropSets: 0 };
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}

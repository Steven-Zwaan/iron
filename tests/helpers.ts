import { CATALOGUE, toMap } from '@/domain/exercises';
import { SEED_PLAN_DAYS } from '@/domain/plan';
import { createSession } from '@/domain/session';
import type { ExerciseMap, PlanDay, Session, Settings } from '@/domain/types';
import { localDateStr } from '@/domain/time';

export const EX: ExerciseMap = toMap(CATALOGUE);

export const SETTINGS: Settings = {
  theme: 'dark',
  restAutoStart: true,
  restSound: true,
  restVibrate: true,
  repChipsOnRest: true,
  askRepsBeforeDrop: true,
  aiEnabled: false,
  aiEndpoint: '',
};

export const MONDAY: PlanDay = SEED_PLAN_DAYS[0];
export const THURSDAY: PlanDay = SEED_PLAN_DAYS[1];

/** A finished session where every set was logged at `weight` with reps null. */
export function completedSession(day: PlanDay, startedAt: number, weight = 40): Session {
  const s = createSession({ queue: day.items.map((i) => i.exerciseId), day, exercises: EX, settings: SETTINGS, now: startedAt });
  const logs = Object.fromEntries(
    Object.entries(s.logs).map(([id, log]) => [
      id,
      { ...log, sets: log.sets.map((set) => ({ ...set, done: true, at: startedAt, segments: [{ weight, reps: null }] })) },
    ]),
  );
  return { ...s, logs, endedAt: startedAt + 3_600_000, date: localDateStr(startedAt), scratch: undefined };
}

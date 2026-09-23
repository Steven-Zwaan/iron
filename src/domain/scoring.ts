import type { BodyScore, ExerciseMap, MuscleId, MuscleScore, Session, SetLog, Settings, Tier } from './types';
import { MUSCLE_IDS, targetFor } from './muscles';
import { rangeStartDate } from './time';

export const SET_VALUE: Record<SetLog['type'], number> = { warmup: 0.25, work: 1.0, drop: 1.0 };
export const EXTRA_SEGMENT_VALUE = 0.4;
export const HEADROOM = 1.15; // you hit 100 slightly above target, not exactly at it

export function setValue(s: SetLog): number {
  if (!s.done) return 0;
  return SET_VALUE[s.type] + Math.max(0, s.segments.length - 1) * EXTRA_SEGMENT_VALUE;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function score(eff: number, weeklyTarget: number, rangeDays: number): number {
  const weeks = Math.max(1, rangeDays / 7);
  return clamp(Math.round((100 * eff) / (weeklyTarget * weeks * HEADROOM)), 0, 100);
}

export function tier(s: number): Tier {
  if (s <= 0) return 0;
  if (s < 40) return 1; // Okay — green
  if (s < 70) return 2; // Good — blue
  if (s < 90) return 3; // Amazing — purple
  return 4; // Perfect — gold
}

export function emptyAcc(): Record<MuscleId, number> {
  return Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0])) as Record<MuscleId, number>;
}

/** Sessions that count: finalised, and on/after the range start date (inclusive, local). */
export function sessionsInRange(sessions: Session[], rangeDays: number, now = Date.now()): Session[] {
  const start = rangeStartDate(now, rangeDays);
  return sessions.filter((s) => s.endedAt && s.date >= start);
}

export interface EffectiveSetsResult {
  perMuscle: Record<MuscleId, number>;
  /** muscle -> exerciseId -> effective sets, for the "top contributors" readout */
  contributors: Record<MuscleId, Record<string, number>>;
}

export function effectiveSets(sessions: Session[], exercises: ExerciseMap, rangeDays: number, now = Date.now()): EffectiveSetsResult {
  const perMuscle = emptyAcc();
  const contributors = Object.fromEntries(MUSCLE_IDS.map((m) => [m, {}])) as Record<MuscleId, Record<string, number>>;
  for (const s of sessionsInRange(sessions, rangeDays, now)) {
    for (const log of Object.values(s.logs)) {
      const ex = exercises[log.exerciseId];
      if (!ex) continue;
      for (const set of log.sets) {
        const v = setValue(set);
        if (!v) continue;
        for (const [m, contribution] of Object.entries(ex.muscles) as [MuscleId, number][]) {
          if (!(m in perMuscle)) continue;
          const add = v * contribution;
          perMuscle[m] += add;
          contributors[m][ex.id] = (contributors[m][ex.id] ?? 0) + add;
        }
      }
    }
  }
  return { perMuscle, contributors };
}

export function overall(scores: Record<MuscleId, MuscleScore>): number {
  // weighted by target, so chest and quads matter more than forearms
  let num = 0;
  let den = 0;
  for (const m of MUSCLE_IDS) {
    const t = scores[m].target;
    num += scores[m].score * t;
    den += 100 * t;
  }
  return den ? Math.round((100 * num) / den) : 0;
}

export function computeBodyScore(
  sessions: Session[],
  exercises: ExerciseMap,
  rangeDays: number,
  overrides?: Settings['weeklyTargets'],
  now = Date.now(),
): BodyScore {
  const { perMuscle, contributors } = effectiveSets(sessions, exercises, rangeDays, now);
  const muscles = {} as Record<MuscleId, MuscleScore>;
  for (const m of MUSCLE_IDS) {
    const target = targetFor(m, overrides);
    const eff = perMuscle[m];
    const sc = score(eff, target, rangeDays);
    const top = Object.entries(contributors[m])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([exerciseId, v]) => ({ exerciseId, effectiveSets: v }));
    muscles[m] = { muscle: m, effectiveSets: eff, target, score: sc, tier: tier(sc), topContributors: top };
  }
  return { overall: overall(muscles), muscles, rangeDays };
}

/** Empty score (fresh account / before any session). */
export function emptyBodyScore(rangeDays: number, overrides?: Settings['weeklyTargets']): BodyScore {
  return computeBodyScore([], {}, rangeDays, overrides);
}

/** Summed effective sets and target for a set of muscles (session-builder category headers). */
export function categorySummary(body: BodyScore, muscleIds: MuscleId[]): { eff: number; target: number; score: number; tier: Tier } {
  let eff = 0;
  let target = 0;
  for (const m of muscleIds) {
    eff += body.muscles[m].effectiveSets;
    target += body.muscles[m].target;
  }
  const weeks = Math.max(1, body.rangeDays / 7);
  const sc = target ? clamp(Math.round((100 * eff) / (target * weeks * HEADROOM)), 0, 100) : 0;
  return { eff, target: target * weeks, score: sc, tier: tier(sc) };
}

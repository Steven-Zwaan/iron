/**
 * Client-side context assembly (§12.2). The server owns the system prompts; the
 * client only sends structured facts about the lifter.
 */
import type { BodyScore, Exercise, ExerciseMap, GymProfile, PlanDay, Session } from '@/domain/types';
import { MUSCLE_IDS, muscleName } from '@/domain/muscles';
import { EQUIPMENT_NAME } from '@/domain/exercises';
import { owedIds } from '@/domain/debt';
import { shortDate } from '@/domain/format';

export interface CoachContext {
  unit: string;
  today: string;
  nextDay: string | null;
  nextExercises: string[];
  overall: number;
  weakest: { muscle: string; score: number }[];
  owed: string[];
  gymCount: number;
  equipment: string[];
  recent: string[];
}

export function buildContext(args: { gym: GymProfile; exercises: ExerciseMap; body: BodyScore; due: PlanDay | null; debt: Record<string, number>; sessions: Session[]; now?: number }): CoachContext {
  const { gym, exercises, body, due, debt, sessions, now = Date.now() } = args;
  const weakest = [...MUSCLE_IDS]
    .map((m) => ({ muscle: muscleName(m), score: body.muscles[m].score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  const equipment = [...new Set(gym.available.map((id) => exercises[id]?.equipment).filter(Boolean))].map((e) => EQUIPMENT_NAME[e as keyof typeof EQUIPMENT_NAME]);
  const recent = [...sessions]
    .filter((s) => s.endedAt)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, 4)
    .map((s) => {
      const parts = s.queue.map((id) => {
        const log = s.logs[id];
        const name = exercises[id]?.name ?? id;
        const n = log?.sets.filter((x) => x.done && x.type !== 'warmup').length ?? 0;
        return log?.skipped || n === 0 ? `${name} SKIPPED` : `${name} ×${n} sets`;
      });
      return `${shortDate(s.date, now)}, ${s.label}: ${parts.join(', ')}`;
    });
  return {
    unit: gym.unit,
    today: new Date(now).toDateString(),
    nextDay: due?.label ?? null,
    nextExercises: due?.items.map((i) => exercises[i.exerciseId]?.name ?? i.exerciseId) ?? [],
    overall: body.overall,
    weakest,
    owed: owedIds(debt).map((id) => exercises[id]?.name ?? id),
    gymCount: gym.available.length,
    equipment,
    recent,
  };
}

/** Plain-text rendering of the context, mirrored server-side into the system prompt. */
export function renderContext(c: CoachContext): string {
  return [
    `Lifter context (${c.unit}). Trains to failure. Default 2 work sets per exercise, 1 light warm-up set per new muscle group per day. Rarely counts reps.`,
    `Today: ${c.today}. Next session: ${c.nextDay ?? 'nothing planned'}${c.nextExercises.length ? ` — ${c.nextExercises.join(', ')}` : ''}.`,
    `Weekly body score ${c.overall}/100. Weakest: ${c.weakest.map((w) => `${w.muscle} ${w.score}`).join(', ')}.`,
    `Owed (skipped last time): ${c.owed.length ? c.owed.join(', ') : 'none'}.`,
    `Gym has: ${c.gymCount} exercises; notable equipment: ${c.equipment.join(', ')}.`,
    `Recent sessions:`,
    ...(c.recent.length ? c.recent : ['none yet']),
  ].join('\n');
}

/** Does this free text look like a workout log rather than a question? (§5.6) */
export function looksLikeLog(text: string): boolean {
  return /\d/.test(text) && /\b(did|logged|sets?|reps?|skipped|kg|lbs?|x\d|\d\s*x)\b/i.test(text);
}

export function knownExercisesForParser(exercises: ExerciseMap): { id: string; name: string }[] {
  return Object.values(exercises).map((e: Exercise) => ({ id: e.id, name: e.name }));
}

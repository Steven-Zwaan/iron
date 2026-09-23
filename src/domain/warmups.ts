import type { ExerciseMap, MuscleId, PlanItem, SetType } from './types';
import { primaryMuscle } from './exercises';

/**
 * "Every new muscle group per day gets 1 light warm-up set."
 * Computed from the order of exercises, never stored.
 */
export function warmupFlags(exerciseIds: string[], exercises: ExerciseMap): boolean[] {
  const seen = new Set<MuscleId>();
  return exerciseIds.map((id) => {
    const ex = exercises[id];
    if (!ex) return false;
    const p = primaryMuscle(ex);
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

export function warmupNeeded(exerciseIds: string[], index: number, exercises: ExerciseMap): boolean {
  return warmupFlags(exerciseIds.slice(0, index + 1), exercises)[index] ?? false;
}

export interface SetScheme {
  workSets: number;
  dropSets: number;
}

export const DEFAULT_SCHEME: SetScheme = { workSets: 2, dropSets: 0 };

/** `[warmup?] + [drop × dropSets] + [work × workSets]` */
export function setTypes(scheme: SetScheme, warmup: boolean): SetType[] {
  const out: SetType[] = [];
  if (warmup) out.push('warmup');
  for (let i = 0; i < Math.max(0, scheme.dropSets); i++) out.push('drop');
  for (let i = 0; i < Math.max(0, scheme.workSets); i++) out.push('work');
  return out;
}

/** "warm-up + 2 dropset + 3 to failure" */
export function schemeLabel(scheme: SetScheme, warmup: boolean): string {
  const parts: string[] = [];
  if (warmup) parts.push('warm-up');
  if (scheme.dropSets > 0) parts.push(`${scheme.dropSets} dropset`);
  parts.push(`${scheme.workSets} to failure`);
  return parts.join(' + ');
}

/** Short form for the Today card: "warm-up+2", "2", "warm-up+2d+3". */
export function schemeShort(scheme: SetScheme, warmup: boolean): string {
  const parts: string[] = [];
  if (warmup) parts.push('warm-up');
  if (scheme.dropSets > 0) parts.push(`${scheme.dropSets}d`);
  parts.push(String(scheme.workSets));
  return parts.join('+');
}

export function schemeOf(item: PlanItem | undefined): SetScheme {
  return item ? { workSets: item.workSets, dropSets: item.dropSets } : DEFAULT_SCHEME;
}

/** Total sets in a plan day including derived warm-ups (the seeded Monday = 23). */
export function daySetCount(items: PlanItem[], exercises: ExerciseMap): number {
  const flags = warmupFlags(items.map((i) => i.exerciseId), exercises);
  return items.reduce((acc, it, i) => acc + setTypes(schemeOf(it), flags[i]).length, 0);
}

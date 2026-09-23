import type { Exercise, ExerciseMap, GymProfile, MuscleId } from './types';
import { MUSCLE_IDS } from './muscles';

export function vector(m: Partial<Record<MuscleId, number>>): number[] {
  return MUSCLE_IDS.map((id) => m[id] ?? 0);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface RankedAlternative {
  exercise: Exercise;
  similarity: number;
}

/**
 * Cosine similarity over the 17-dimensional muscle contribution vector, restricted to
 * gym-available exercises, excluding the current one. No AI needed (§10.5).
 * If nothing clears `minSim`, the best `fallback` matches are returned so the sheet is never empty.
 */
export function rankAlternatives(
  ex: Exercise,
  gym: GymProfile,
  exercises: ExerciseMap,
  opts: { minSim?: number; fallback?: number; limit?: number } = {},
): RankedAlternative[] {
  const { minSim = 0.6, fallback = 4, limit = 12 } = opts;
  const v = vector(ex.muscles);
  const ranked = gym.available
    .map((id) => exercises[id])
    .filter((e): e is Exercise => !!e && e.id !== ex.id)
    .map((e) => ({ exercise: e, similarity: cosine(vector(e.muscles), v) }))
    .sort((a, b) => b.similarity - a.similarity);
  const good = ranked.filter((r) => r.similarity > minSim);
  return (good.length ? good : ranked.slice(0, fallback)).slice(0, limit);
}

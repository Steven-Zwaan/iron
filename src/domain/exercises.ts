import catalogueJson from '@shared/data/catalogue.json';
import gymDefaults from '@shared/data/gym-defaults.json';
import type { Equipment, Exercise, ExerciseMap, GymProfile, MuscleId, MuscleCategory, Unit } from './types';
import { MUSCLE_BY_ID } from './muscles';

interface SeedExercise {
  id: string;
  name: string;
  aliases?: string[];
  equipment: Equipment;
  defaultRestSec: number;
  muscles: Partial<Record<MuscleId, number>>;
  measure?: Exercise['measure'];
  unilateral?: boolean;
}

/** The seeded catalogue, hydrated into full Exercise objects. */
export const CATALOGUE: Exercise[] = (catalogueJson as unknown as SeedExercise[]).map((s) => ({
  id: s.id,
  name: s.name,
  aliases: s.aliases,
  equipment: s.equipment,
  measure: s.measure ?? 'weight',
  defaultRestSec: s.defaultRestSec,
  muscles: s.muscles,
  unilateral: s.unilateral,
}));

export const CATALOGUE_IDS = new Set(CATALOGUE.map((e) => e.id));

export function toMap(list: Exercise[]): ExerciseMap {
  return Object.fromEntries(list.map((e) => [e.id, e]));
}

/** Primary muscle = the one with the highest contribution (ties broken by declaration order). */
export function primaryMuscle(ex: Exercise): MuscleId {
  let best: MuscleId | null = null;
  let bestV = -1;
  for (const [m, v] of Object.entries(ex.muscles) as [MuscleId, number][]) {
    if (v > bestV) {
      best = m;
      bestV = v;
    }
  }
  return best ?? 'chest';
}

export function primaryCategory(ex: Exercise): MuscleCategory {
  return MUSCLE_BY_ID[primaryMuscle(ex)].category;
}

/** Muscles sorted by contribution, primary first. */
export function musclesSorted(ex: Exercise): [MuscleId, number][] {
  return (Object.entries(ex.muscles) as [MuscleId, number][]).sort((a, b) => b[1] - a[1]);
}

export const EQUIPMENT_NAME: Record<Equipment, string> = {
  machine_stack: 'Machine',
  cable_stack: 'Cable',
  plate_loaded: 'Plate-loaded',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  bodyweight: 'Bodyweight',
  other: 'Other',
};

export const EQUIPMENT_ORDER: Equipment[] = [
  'machine_stack', 'cable_stack', 'plate_loaded', 'barbell', 'dumbbell', 'bodyweight', 'other',
];

export const MEASURE_NAME: Record<Exercise['measure'], string> = {
  weight: 'Weight',
  stack_level: 'Stack level (1-20)',
  bodyweight: 'Bodyweight (+ added)',
  assisted: 'Assisted (assistance weight)',
};

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Case/diacritic-insensitive search over name and aliases. */
export function matchesQuery(ex: Exercise, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  if (norm(ex.name).includes(q)) return true;
  return (ex.aliases ?? []).some((a) => norm(a).includes(q));
}

/** Find an exercise by exact name or alias (used by the log parser). */
export function findByName(list: Exercise[], name: string): Exercise | undefined {
  const q = norm(name);
  return (
    list.find((e) => norm(e.name) === q) ??
    list.find((e) => (e.aliases ?? []).some((a) => norm(a) === q)) ??
    list.find((e) => norm(e.name).includes(q) || q.includes(norm(e.name)))
  );
}

export function defaultGym(unit: Unit = 'kg', now = Date.now()): GymProfile {
  const d = gymDefaults[unit];
  return {
    id: 'default',
    name: 'My gym',
    unit,
    available: CATALOGUE.map((e) => e.id), // typical commercial gym: everything on
    increments: { ...(d.increments as Record<Equipment, number>) },
    dumbbells: [...d.dumbbells],
    barWeight: d.barWeight,
    plates: [...d.plates],
    updatedAt: now,
  };
}

/** Merge new catalogue entries into a stored exercise list without touching user edits. */
export function mergeCatalogue(stored: Exercise[]): Exercise[] {
  const have = new Set(stored.map((e) => e.id));
  const added = CATALOGUE.filter((e) => !have.has(e.id));
  return added.length ? [...stored, ...added] : stored;
}

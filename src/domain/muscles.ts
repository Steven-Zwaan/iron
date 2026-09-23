import musclesJson from '@shared/data/muscles.json';
import type { MuscleCategory, MuscleDef, MuscleId, Settings } from './types';

export const MUSCLE_DEFS: MuscleDef[] = musclesJson as MuscleDef[];
export const MUSCLE_IDS: MuscleId[] = MUSCLE_DEFS.map((m) => m.id);
export const MUSCLE_BY_ID: Record<MuscleId, MuscleDef> = Object.fromEntries(
  MUSCLE_DEFS.map((m) => [m.id, m]),
) as Record<MuscleId, MuscleDef>;

export const CATEGORIES: MuscleCategory[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
export const CATEGORY_NAME: Record<MuscleCategory, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

export function musclesInCategory(cat: MuscleCategory): MuscleId[] {
  return MUSCLE_DEFS.filter((m) => m.category === cat).map((m) => m.id);
}

export function muscleName(id: MuscleId): string {
  return MUSCLE_BY_ID[id]?.name ?? id;
}

/** Weekly target with the user's Settings overrides applied. */
export function targetFor(id: MuscleId, overrides?: Settings['weeklyTargets']): number {
  const o = overrides?.[id];
  return typeof o === 'number' && o > 0 ? o : MUSCLE_BY_ID[id].weeklyTarget;
}

export function targets(overrides?: Settings['weeklyTargets']): Record<MuscleId, number> {
  return Object.fromEntries(MUSCLE_IDS.map((m) => [m, targetFor(m, overrides)])) as Record<MuscleId, number>;
}

/** Sum of weekly targets in a category (chest 12, back 28, shoulders 34, arms 26, legs 42, core 14). */
export function categoryTarget(cat: MuscleCategory, overrides?: Settings['weeklyTargets']): number {
  return musclesInCategory(cat).reduce((acc, m) => acc + targetFor(m, overrides), 0);
}

export const TIER_NAME = ['None', 'Okay', 'Good', 'Amazing', 'Perfect'] as const;
/** Dark-theme tier colours (design tokens --t0..--t4). Prefer the CSS variables in UI. */
export const TIER_COLOUR = ['#2A2F3C', '#3FB950', '#3D8BFD', '#A371F7', '#E3B341'] as const;
export const TIER_VAR = ['var(--t0)', 'var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)'] as const;

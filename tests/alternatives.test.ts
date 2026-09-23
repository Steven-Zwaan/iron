import { describe, expect, it } from 'vitest';
import { cosine, rankAlternatives, vector } from '@/domain/alternatives';
import { defaultGym, CATALOGUE } from '@/domain/exercises';
import { EX } from './helpers';

describe('swap ranking without AI (§10.5)', () => {
  const gym = defaultGym('kg', 0);

  it('cosine similarity is 1 for identical maps and 0 for disjoint ones', () => {
    expect(cosine(vector(EX.pec_deck.muscles), vector(EX.cable_fly_mid.muscles))).toBeCloseTo(1);
    expect(cosine(vector(EX.pec_deck.muscles), vector(EX.standing_calf_raise.muscles))).toBe(0);
  });

  it('ranks chest presses and flys as alternatives to the inclined chest press, never itself', () => {
    const alts = rankAlternatives(EX.incline_machine_press, gym, EX);
    expect(alts.length).toBeGreaterThan(3);
    expect(alts.some((a) => a.exercise.id === 'incline_machine_press')).toBe(false);
    expect(alts[0].similarity).toBeGreaterThan(0.95);
    expect(alts.every((a) => a.similarity > 0.6)).toBe(true);
    expect(alts.slice(0, 5).every((a) => 'chest' in a.exercise.muscles)).toBe(true);
  });

  it('only offers gym-available exercises', () => {
    const small = { ...gym, available: ['pec_deck', 'cable_fly_mid', 'db_curl'] };
    const alts = rankAlternatives(EX.pec_deck, small, EX);
    expect(alts.map((a) => a.exercise.id)).toEqual(['cable_fly_mid']);
  });

  it('falls back to the closest matches when nothing clears the threshold', () => {
    const lonely = { ...gym, available: ['db_curl', 'standing_calf_raise', 'plank'] };
    const alts = rankAlternatives(EX.pec_deck, lonely, EX);
    expect(alts.length).toBe(3);
  });

  it('every catalogue exercise has exactly one primary muscle at 1.0 (unless deliberately accessory)', () => {
    const noPrimary = CATALOGUE.filter((e) => !Object.values(e.muscles).some((v) => v === 1));
    expect(noPrimary.map((e) => e.id)).toEqual(['hip_adduction']);
  });
});

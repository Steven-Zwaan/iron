import { describe, expect, it } from 'vitest';
import { defaultGym } from '@/domain/exercises';
import { dropWeight, formatSegment, formatWeight, multiples, plateCombinations, snap, stepTick, ticksFor, warmupWeight } from '@/domain/weights';
import { EX } from './helpers';

describe('weight ticks (§10.4 / §6.2)', () => {
  const gym = defaultGym('kg', 0);

  it('dumbbells snap to the rack list only', () => {
    const t = ticksFor(EX.db_curl, gym);
    expect(t).toEqual(gym.dumbbells);
    expect(snap(t, 23)).toBe(22.5);
    expect(snap(t, 24)).toBe(25);
    expect(snap(t, 33)).toBe(32.5);
  });

  it('machine stacks use the configured step', () => {
    const t = ticksFor(EX.incline_machine_press, gym);
    expect(t.slice(0, 4)).toEqual([0, 5, 10, 15]);
    expect(ticksFor(EX.cable_lateral_raise, gym).slice(0, 4)).toEqual([0, 2.5, 5, 7.5]);
  });

  it('barbells are bar + 2 × plate combinations', () => {
    const t = ticksFor(EX.bench_press, gym);
    expect(t[0]).toBe(20);
    expect(t).toContain(22.5);
    expect(t).toContain(60);
    expect(t).toContain(100);
    expect(t).not.toContain(21);
    const coarse = plateCombinations(20, [5, 10, 20], 60);
    expect(coarse).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140]);
  });

  it('stack levels are 1..20 and bodyweight starts at BW', () => {
    expect(ticksFor({ ...EX.pec_deck, measure: 'stack_level' }, gym)).toEqual(multiples(1, 1, 20));
    const bw = ticksFor(EX.pullup, gym);
    expect(bw[0]).toBe(0);
    expect(bw[1]).toBe(2.5);
    expect(formatWeight(0, EX.pullup, 'kg')).toBe('BW');
    expect(formatWeight(5, EX.pullup, 'kg')).toBe('BW +5');
  });

  it('drops by 20% and snaps to a real, strictly lower tick', () => {
    const cable = ticksFor(EX.cable_lateral_raise, gym);
    expect(dropWeight(cable, 60, 20)).toBe(47.5);
    const db = ticksFor(EX.db_curl, gym);
    expect(dropWeight(db, 10, 20)).toBe(8);
    expect(dropWeight(db, 4, 20)).toBe(2);
    expect(dropWeight(db, 2, 20)).toBe(2);
    expect(dropWeight(db, null, 20)).toBeNull();
  });

  it('warm-up presets to half the working weight, snapped', () => {
    expect(warmupWeight(ticksFor(EX.incline_machine_press, gym), 60)).toBe(30);
    expect(warmupWeight(ticksFor(EX.db_curl, gym), 25)).toBe(12);
  });

  it('steps exactly one tick and clamps at the ends', () => {
    const db = ticksFor(EX.db_curl, gym);
    expect(stepTick(db, 20, 1)).toBe(22.5);
    expect(stepTick(db, 20, -1)).toBe(18);
    expect(stepTick(db, 50, 1)).toBe(50);
    expect(stepTick(db, null, 1, 10)).toBe(10);
  });

  it('formats weights and segments', () => {
    expect(formatWeight(62.5, EX.bench_press, 'kg')).toBe('62.5');
    expect(formatWeight(60, EX.bench_press, 'kg', { withUnit: true })).toBe('60 kg');
    expect(formatWeight(9, { ...EX.pec_deck, measure: 'stack_level' }, 'kg')).toBe('level 9');
    expect(formatWeight(null, EX.bench_press, 'kg')).toBe('—');
    expect(formatSegment(60, 5, EX.bench_press, 'kg')).toBe('60×5');
    expect(formatSegment(60, null, EX.bench_press, 'kg')).toBe('60×—');
  });
});

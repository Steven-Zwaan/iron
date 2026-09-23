import { describe, expect, it } from 'vitest';
import { computeBodyScore, setValue, tier } from '@/domain/scoring';
import { MUSCLE_IDS } from '@/domain/muscles';
import { EX, MONDAY, THURSDAY, completedSession } from './helpers';

const DAY = 86_400_000;

describe('scoring (§10.1)', () => {
  it('values sets: warm-up 0.25, work 1.0, extra segments +0.4', () => {
    expect(setValue({ id: 'a', type: 'warmup', done: true, segments: [{ weight: 20, reps: null }] })).toBe(0.25);
    expect(setValue({ id: 'b', type: 'work', done: true, segments: [{ weight: 60, reps: null }] })).toBe(1);
    expect(setValue({ id: 'c', type: 'drop', done: true, segments: [{ weight: 60, reps: 5 }, { weight: 48, reps: 6 }, { weight: 40, reps: 4 }] })).toBeCloseTo(1.8);
    expect(setValue({ id: 'd', type: 'work', done: false, segments: [] })).toBe(0);
  });

  it('tier boundaries: 39 green, 40 blue, 69 blue, 70 purple, 89 purple, 90 gold', () => {
    expect(tier(0)).toBe(0);
    expect(tier(1)).toBe(1);
    expect(tier(39)).toBe(1);
    expect(tier(40)).toBe(2);
    expect(tier(69)).toBe(2);
    expect(tier(70)).toBe(3);
    expect(tier(89)).toBe(3);
    expect(tier(90)).toBe(4);
    expect(tier(100)).toBe(4);
  });

  it("reproduces the spec's sanity check for the Monday + Thursday split run once each in a week", () => {
    const now = Date.parse('2026-09-24T12:00:00');
    const sessions = [completedSession(MONDAY, now - 3 * DAY), completedSession(THURSDAY, now - 1 * DAY)];
    const body = computeBodyScore(sessions, EX, 7, undefined, now);
    const s = (m: (typeof MUSCLE_IDS)[number]) => body.muscles[m].score;

    expect(s('delts_side')).toBe(91);
    expect(body.muscles.delts_side.tier).toBe(4);
    expect(s('biceps')).toBe(70);
    expect(body.muscles.biceps.tier).toBe(3);
    expect(s('chest')).toBe(62);
    expect(s('upper_back')).toBe(55);
    expect(s('triceps')).toBe(55);
    expect(s('lats')).toBe(52);
    expect(s('calves')).toBe(39);
    expect(s('delts_front')).toBe(38);
    expect(s('traps')).toBe(29);
    expect(s('delts_rear')).toBe(27);
    expect(s('forearms')).toBe(26);
    for (const m of ['quads', 'hamstrings', 'glutes', 'abs', 'obliques', 'lower_back'] as const) {
      expect(s(m)).toBe(0);
      expect(body.muscles[m].tier).toBe(0);
    }
    expect(body.overall).toBe(34);
  });

  it('after the Monday session alone, side delts are the highest-scoring muscle', () => {
    const now = Date.parse('2026-09-24T12:00:00');
    const body = computeBodyScore([completedSession(MONDAY, now - DAY)], EX, 7, undefined, now);
    const top = [...MUSCLE_IDS].sort((a, b) => body.muscles[b].score - body.muscles[a].score)[0];
    expect(top).toBe('delts_side');
    expect(body.muscles.delts_side.topContributors[0].exerciseId).toBe('cable_lateral_raise');
  });

  it('ignores sessions outside the range and unfinished sessions', () => {
    const now = Date.parse('2026-09-24T12:00:00');
    const old = completedSession(MONDAY, now - 10 * DAY);
    const open = { ...completedSession(MONDAY, now - DAY), endedAt: null };
    expect(computeBodyScore([old, open], EX, 7, undefined, now).overall).toBe(0);
    expect(computeBodyScore([old], EX, 30, undefined, now).overall).toBeGreaterThan(0);
  });

  it('respects weekly target overrides', () => {
    const now = Date.parse('2026-09-24T12:00:00');
    const sessions = [completedSession(MONDAY, now - DAY)];
    const a = computeBodyScore(sessions, EX, 7, undefined, now).muscles.chest.score;
    const b = computeBodyScore(sessions, EX, 7, { chest: 24 }, now).muscles.chest.score;
    expect(b).toBeLessThan(a);
  });
});

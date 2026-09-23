import { describe, expect, it } from 'vitest';
import {
  activeSet,
  addExercise,
  commitSegment,
  createSession,
  currentExerciseId,
  derivePerformance,
  estimateDurationMin,
  jumpTo,
  liftHistory,
  logSet,
  nextExercise,
  reorderQueue,
  setPendingReps,
  setSetReps,
  skipExercise,
  swapExercise,
  unlogSet,
  updateSetSegments,
} from '@/domain/session';
import { EX, MONDAY, SETTINGS, completedSession } from './helpers';

const now = Date.parse('2026-09-21T18:00:00');

describe('session creation', () => {
  it('pre-fills sets from the plan scheme with derived warm-ups and resolved rest', () => {
    const s = createSession({ queue: MONDAY.items.map((i) => i.exerciseId), day: MONDAY, exercises: EX, settings: SETTINGS, now });
    expect(s.label).toBe('Monday');
    expect(s.dayId).toBe('mon');
    expect(s.logs.incline_machine_press.sets.map((x) => x.type)).toEqual(['warmup', 'work', 'work']);
    expect(s.logs.pec_deck.sets.map((x) => x.type)).toEqual(['work', 'work']);
    expect(s.logs.cable_lateral_raise.sets.map((x) => x.type)).toEqual(['warmup', 'drop', 'drop', 'work', 'work', 'work']);
    expect(s.logs.incline_machine_press.restSec).toBe(100);
    expect(Object.values(s.logs).reduce((n, l) => n + l.sets.length, 0)).toBe(26);
  });

  it('freestyle sessions have no day and use the default scheme', () => {
    const s = createSession({ queue: ['bench_press', 'db_curl'], day: null, exercises: EX, settings: SETTINGS, now });
    expect(s.dayId).toBeNull();
    expect(s.label).toBe('Freestyle');
    expect(s.logs.bench_press.sets.map((x) => x.type)).toEqual(['warmup', 'work', 'work']);
  });

  it('estimates duration in 5-minute steps', () => {
    const min = estimateDurationMin(MONDAY.items.map((i) => i.exerciseId), EX, MONDAY, SETTINGS);
    expect(min % 5).toBe(0);
    expect(min).toBeGreaterThan(30);
    expect(min).toBeLessThan(90);
  });
});

describe('one-tap logging (§6.3)', () => {
  it('LOG SET writes the carried weight with reps null and advances to the next set', () => {
    let s = createSession({ queue: ['incline_machine_press'], day: MONDAY, exercises: EX, settings: SETTINGS, now });
    expect(activeSet(s)?.type).toBe('warmup');
    s = logSet(s, 30, now);
    expect(s.logs.incline_machine_press.sets[0]).toMatchObject({ done: true, segments: [{ weight: 30, reps: null }] });
    expect(s.cursor.setIndex).toBe(1);
    s = logSet(s, 60, now + 1);
    s = logSet(s, 60, now + 2);
    expect(s.cursor.setIndex).toBe(3); // past the end = exercise complete
    expect(activeSet(s)).toBeUndefined();
    expect(logSet(s, 60, now + 3)).toBe(s); // nothing left to log
  });

  it('rep chips write reps on the last segment of the set', () => {
    let s = createSession({ queue: ['pec_deck'], day: MONDAY, exercises: EX, settings: SETTINGS, now });
    s = logSet(s, 50, now);
    const set = s.logs.pec_deck.sets[0];
    s = setSetReps(s, 'pec_deck', set.id, 9);
    expect(s.logs.pec_deck.sets[0].segments[0]).toEqual({ weight: 50, reps: 9 });
  });
});

describe('dropset chaining (§6.4)', () => {
  it('Drop weight commits a segment, Finish set closes the chain as 60x5 -> 48x6 -> 40x4', () => {
    let s = createSession({ queue: ['pec_deck'], day: MONDAY, exercises: EX, settings: SETTINGS, now });
    s = commitSegment(s, 60, null, now);
    s = setPendingReps(s, 0, 5);
    expect(s.scratch?.pendingSegments).toEqual([{ weight: 60, reps: 5 }]);
    s = commitSegment(s, 48, 6, now);
    s = logSet(s, 40, now); // ✓ Finish set
    const set = s.logs.pec_deck.sets[0];
    expect(set.done).toBe(true);
    expect(set.segments).toEqual([{ weight: 60, reps: 5 }, { weight: 48, reps: 6 }, { weight: 40, reps: null }]);
    s = setSetReps(s, 'pec_deck', set.id, 4);
    expect(s.logs.pec_deck.sets[0].segments[2].reps).toBe(4);
    expect(s.scratch?.pendingSegments).toEqual([]);
  });

  it('a plan item with dropSets: 2 starts those sets as drop type', () => {
    const s = createSession({ queue: ['cable_lateral_raise'], day: MONDAY, exercises: EX, settings: SETTINGS, now });
    expect(s.logs.cable_lateral_raise.sets[1].type).toBe('drop');
    expect(s.logs.cable_lateral_raise.sets[2].type).toBe('drop');
    expect(s.logs.cable_lateral_raise.sets[3].type).toBe('work');
  });
});

describe('mid-session control (§6.7)', () => {
  const queue = MONDAY.items.map((i) => i.exerciseId);

  it('reordering the queue keeps the cursor on the active exercise', () => {
    let s = createSession({ queue, day: MONDAY, exercises: EX, settings: SETTINGS, now });
    s = jumpTo(s, 1, now);
    expect(currentExerciseId(s)).toBe('lat_pulldown');
    s = reorderQueue(s, [...queue].reverse(), now);
    expect(currentExerciseId(s)).toBe('lat_pulldown');
    expect(s.queue[0]).toBe('cable_overhead_extension');
  });

  it('jump to preserves logged progress', () => {
    let s = createSession({ queue, day: MONDAY, exercises: EX, settings: SETTINGS, now });
    s = logSet(s, 30, now);
    s = jumpTo(s, 3, now);
    expect(currentExerciseId(s)).toBe('seated_row_machine');
    s = jumpTo(s, 0, now);
    expect(s.cursor.setIndex).toBe(1);
    expect(s.logs.incline_machine_press.sets[0].done).toBe(true);
  });

  it('skip advances to the next exercise and Next exercise skips completed ones', () => {
    let s = createSession({ queue, day: MONDAY, exercises: EX, settings: SETTINGS, now });
    s = skipExercise(s, 'incline_machine_press', now);
    expect(s.logs.incline_machine_press.skipped).toBe(true);
    expect(currentExerciseId(s)).toBe('lat_pulldown');
    s = nextExercise(s, now);
    expect(currentExerciseId(s)).toBe('standing_calf_raise');
  });

  it('swap replaces an untouched exercise and keeps done sets of a started one', () => {
    let s = createSession({ queue: ['lat_pulldown', 'db_curl'], day: MONDAY, exercises: EX, settings: SETTINGS, now });
    s = swapExercise(s, 'lat_pulldown', EX.wide_pulldown, EX, SETTINGS, now);
    expect(s.queue).toEqual(['wide_pulldown', 'db_curl']);
    expect(s.logs.lat_pulldown).toBeUndefined();
    expect(s.logs.wide_pulldown.sets.map((x) => x.type)).toEqual(['warmup', 'work', 'work']);

    s = logSet(s, 40, now);
    s = logSet(s, 60, now);
    s = swapExercise(s, 'wide_pulldown', EX.neutral_pulldown, EX, SETTINGS, now);
    expect(s.queue).toEqual(['wide_pulldown', 'neutral_pulldown', 'db_curl']);
    expect(s.logs.wide_pulldown.sets).toHaveLength(2);
    expect(s.logs.neutral_pulldown.sets.map((x) => x.type)).toEqual(['work']);
    expect(currentExerciseId(s)).toBe('neutral_pulldown');
  });

  it('adding an exercise mid-session derives its warm-up from what was already trained', () => {
    let s = createSession({ queue: ['db_curl'], day: null, exercises: EX, settings: SETTINGS, now });
    s = addExercise(s, EX.hammer_curl, EX, SETTINGS, {}, now);
    expect(s.queue).toEqual(['db_curl', 'hammer_curl']);
    expect(s.logs.hammer_curl.addedMidSession).toBe(true);
    expect(s.logs.hammer_curl.sets.map((x) => x.type)).toEqual(['warmup', 'work', 'work']); // forearms is new
    s = addExercise(s, EX.bb_curl, EX, SETTINGS, {}, now);
    expect(s.logs.bb_curl.sets.map((x) => x.type)).toEqual(['work', 'work']); // biceps already seen
  });

  it('editing a logged set and un-logging it', () => {
    let s = createSession({ queue: ['pec_deck'], day: MONDAY, exercises: EX, settings: SETTINGS, now });
    s = logSet(s, 50, now);
    const id = s.logs.pec_deck.sets[0].id;
    s = updateSetSegments(s, 'pec_deck', id, [{ weight: 55, reps: 8 }]);
    expect(s.logs.pec_deck.sets[0].segments).toEqual([{ weight: 55, reps: 8 }]);
    s = unlogSet(s, 'pec_deck', id);
    expect(s.logs.pec_deck.sets[0].done).toBe(false);
    expect(s.cursor.setIndex).toBe(0);
  });
});

describe('derived performance and lift trend', () => {
  it('tracks last working weight, reps and best', () => {
    const a = completedSession(MONDAY, now - 7 * 86_400_000, 50);
    const b = completedSession(MONDAY, now, 45);
    const perf = derivePerformance([b, a]);
    expect(perf.pec_deck).toMatchObject({ weight: 45, best: 50 });
    const hist = liftHistory([b, a], 'pec_deck');
    expect(hist.map((p) => p.weight)).toEqual([50, 45]);
  });
});

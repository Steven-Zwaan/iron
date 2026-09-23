import { describe, expect, it } from 'vitest';
import { daySetCount, schemeLabel, schemeOf, setTypes, warmupFlags } from '@/domain/warmups';
import { move } from '@/domain/plan';
import { EX, MONDAY } from './helpers';

describe('warm-up derivation (§4.3 / §10.2)', () => {
  const ids = MONDAY.items.map((i) => i.exerciseId);

  it('the seeded Monday lists 8 exercises in the user order', () => {
    expect(ids).toEqual([
      'incline_machine_press', 'lat_pulldown', 'standing_calf_raise', 'seated_row_machine',
      'pec_deck', 'cable_lateral_raise', 'db_curl', 'cable_overhead_extension',
    ]);
  });

  it('gives a warm-up to every new primary muscle but not chest fly', () => {
    const flags = warmupFlags(ids, EX);
    expect(flags).toEqual([true, true, true, true, false, true, true, true]);
  });

  it('labels: inclined chest press, chest fly, cable lateral raise', () => {
    const flags = warmupFlags(ids, EX);
    expect(schemeLabel(schemeOf(MONDAY.items[0]), flags[0])).toBe('warm-up + 2 to failure');
    expect(schemeLabel(schemeOf(MONDAY.items[4]), flags[4])).toBe('2 to failure');
    expect(schemeLabel(schemeOf(MONDAY.items[5]), flags[5])).toBe('warm-up + 2 dropset + 3 to failure');
  });

  it('moves the warm-up to chest fly when it comes first', () => {
    const reordered = move(ids, 4, 0);
    const flags = warmupFlags(reordered, EX);
    expect(reordered[0]).toBe('pec_deck');
    expect(flags[0]).toBe(true);
    expect(flags[reordered.indexOf('incline_machine_press')]).toBe(false);
  });

  it('generates [warmup?] + drops + works and totals 26 sets for the day', () => {
    expect(setTypes({ workSets: 3, dropSets: 2 }, true)).toEqual(['warmup', 'drop', 'drop', 'work', 'work', 'work']);
    expect(setTypes({ workSets: 2, dropSets: 0 }, false)).toEqual(['work', 'work']);
    expect(daySetCount(MONDAY.items, EX)).toBe(26); // spec says 23, but 7 warm-ups + 2 drops + 17 work sets = 26; the scoring sanity check confirms 26
  });
});

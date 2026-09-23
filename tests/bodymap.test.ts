import { describe, expect, it } from 'vitest';
import bodymap from '@shared/data/bodymap.json';
import { MUSCLE_IDS } from '@/domain/muscles';

interface Shape {
  cls: 'base' | 'mf';
  m?: string;
  d: string;
}
const data = bodymap as unknown as { frame: { width: number; height: number }; gap: number; front: Shape[]; back: Shape[] };

describe('body map geometry contract (shared/data/bodymap.json)', () => {
  const all = [...data.front, ...data.back];

  it('covers all 17 muscles across the two views, front and back muscles on the right side', () => {
    const present = new Set(all.filter((s) => s.m).map((s) => s.m));
    for (const m of MUSCLE_IDS) expect(present.has(m), m).toBe(true);
    const frontIds = new Set(data.front.map((s) => s.m));
    const backIds = new Set(data.back.map((s) => s.m));
    for (const m of ['chest', 'abs', 'obliques', 'biceps', 'quads', 'delts_front', 'delts_side']) expect(frontIds.has(m), m).toBe(true);
    for (const m of ['lats', 'upper_back', 'lower_back', 'glutes', 'hamstrings', 'triceps', 'delts_rear']) expect(backIds.has(m), m).toBe(true);
  });

  it('uses only absolute M/L/C/Z path commands so a Swift parser stays trivial', () => {
    for (const s of all) {
      expect(s.d).toMatch(/^M/);
      expect(s.d).toMatch(/Z$/);
      expect(s.d).not.toMatch(/[^MLCZ0-9.,\s-]/);
    }
  });

  it('keeps every coordinate inside the body frame', () => {
    const { width, height } = data.frame;
    for (const s of all) {
      const nums = s.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      for (let i = 0; i < nums.length; i += 2) {
        expect(nums[i]).toBeGreaterThanOrEqual(-1);
        expect(nums[i]).toBeLessThanOrEqual(width + 1);
        expect(nums[i + 1]).toBeGreaterThanOrEqual(-1);
        expect(nums[i + 1]).toBeLessThanOrEqual(height + 1);
      }
    }
  });

  it('has a left and right instance of every muscle in the back view', () => {
    const counts = new Map<string, number>();
    for (const s of data.back) if (s.m) counts.set(s.m, (counts.get(s.m) ?? 0) + 1);
    for (const [m, n] of counts) expect(n, m).toBeGreaterThanOrEqual(2);
  });
});

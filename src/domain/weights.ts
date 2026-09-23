import type { Exercise, GymProfile, Unit } from './types';

const EPS = 1e-6;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function multiples(step: number, from: number, to: number): number[] {
  if (!(step > 0)) return [from];
  const out: number[] = [];
  for (let v = from; v <= to + EPS; v += step) out.push(round2(v));
  return out;
}

/**
 * base + 2 × (every achievable per-side sum of the available plates), deduplicated,
 * ascending. Plates are assumed to exist in multiples (a real gym has more than one
 * 20 kg plate), so sums are all reachable combinations up to `maxPerSide`.
 */
export function plateCombinations(base: number, plates: number[], maxPerSide = 150): number[] {
  const ps = [...new Set(plates.filter((p) => p > 0))].sort((a, b) => a - b);
  if (!ps.length) return [base];
  // Integer DP in units of the smallest representable increment (0.25 handles 1.25 plates).
  const unit = 0.25;
  const toU = (v: number) => Math.round(v / unit);
  const max = toU(maxPerSide);
  const reachable = new Uint8Array(max + 1);
  reachable[0] = 1;
  for (const p of ps) {
    const pu = toU(p);
    if (pu <= 0) continue;
    for (let i = pu; i <= max; i++) if (reachable[i - pu]) reachable[i] = 1;
  }
  const out: number[] = [];
  for (let i = 0; i <= max; i++) if (reachable[i]) out.push(round2(base + 2 * i * unit));
  return out;
}

/** The weights that physically exist for this exercise at this gym (§10.4). */
export function ticksFor(ex: Exercise, gym: GymProfile): number[] {
  switch (ex.measure) {
    case 'stack_level':
      return multiples(1, 1, 20);
    case 'bodyweight': {
      const inc = gym.increments.bodyweight || gym.increments.plate_loaded || 2.5;
      return [0, ...multiples(inc, inc, 60)];
    }
    case 'assisted':
      return multiples(gym.increments.machine_stack || 5, 0, 150);
    default:
      switch (ex.equipment) {
        case 'dumbbell':
          return gym.dumbbells.length ? [...gym.dumbbells].sort((a, b) => a - b) : multiples(2, 2, 60);
        case 'barbell':
          return plateCombinations(gym.barWeight, gym.plates);
        case 'plate_loaded':
          return plateCombinations(0, gym.plates);
        default:
          return multiples(gym.increments[ex.equipment] || 2.5, 0, 250);
      }
  }
}

/** Nearest tick. */
export function snap(ticks: number[], value: number): number {
  if (!ticks.length) return value;
  let best = ticks[0];
  let bestD = Math.abs(value - best);
  for (const t of ticks) {
    const d = Math.abs(value - t);
    if (d < bestD - EPS) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

export function tickIndex(ticks: number[], value: number): number {
  const v = snap(ticks, value);
  return ticks.findIndex((t) => Math.abs(t - v) < EPS);
}

/** Move exactly one tick. */
export function stepTick(ticks: number[], value: number | null, dir: 1 | -1, fallback = 0): number {
  if (!ticks.length) return (value ?? fallback) + dir;
  if (value == null) return snap(ticks, fallback);
  const i = tickIndex(ticks, value);
  const j = Math.min(ticks.length - 1, Math.max(0, i + dir));
  return ticks[j];
}

/** Drop by `pct` percent, snapped to a real tick and strictly lower when possible. */
export function dropWeight(ticks: number[], value: number | null, pct = 20): number | null {
  if (value == null) return null;
  const target = value * (1 - pct / 100);
  let snapped = snap(ticks, target);
  if (snapped >= value - EPS) snapped = stepTick(ticks, value, -1);
  return snapped;
}

/** Warm-up preset: half the working weight, snapped. */
export function warmupWeight(ticks: number[], lastWeight: number | null): number | null {
  if (lastWeight == null) return null;
  return snap(ticks, lastWeight * 0.5);
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n)).replace(/\.?0+$/, '');
}

/** "62.5", "level 9", "BW", "BW +5", "assist 45", "—" */
export function formatWeight(w: number | null | undefined, ex: Exercise | undefined, unit: Unit, opts: { withUnit?: boolean } = {}): string {
  if (w == null || Number.isNaN(w)) return '—';
  const measure = ex?.measure ?? 'weight';
  switch (measure) {
    case 'stack_level':
      return `level ${fmtNum(w)}`;
    case 'bodyweight':
      return w <= 0 ? 'BW' : `BW +${fmtNum(w)}`;
    case 'assisted':
      return `assist ${fmtNum(w)}${opts.withUnit ? ` ${unit}` : ''}`;
    default:
      return `${fmtNum(w)}${opts.withUnit ? ` ${unit}` : ''}`;
  }
}

/** Unit label shown next to the big scrubber number. */
export function weightUnitLabel(ex: Exercise | undefined, unit: Unit): string {
  switch (ex?.measure) {
    case 'stack_level':
      return 'level';
    case 'bodyweight':
      return `+${unit}`;
    default:
      return unit;
  }
}

/** Compact "60×9" / "60×—" segment text. */
export function formatSegment(weight: number | null, reps: number | null, ex: Exercise | undefined, unit: Unit): string {
  const w = weight == null ? '—' : ex?.measure === 'bodyweight' ? formatWeight(weight, ex, unit) : ex?.measure === 'stack_level' ? `L${fmtNum(weight)}` : fmtNum(weight);
  return `${w}×${reps == null ? '—' : reps}`;
}

import type {
  Equipment,
  Exercise,
  ExerciseLog,
  ExerciseMap,
  LastPerformance,
  PlanDay,
  PlanItem,
  Segment,
  Session,
  SetLog,
  SetType,
  Settings,
} from './types';
import { newId } from './ids';
import { localDateStr } from './time';
import { schemeOf, setTypes, warmupFlags, type SetScheme } from './warmups';
import { applyDebt } from './debt';

export const WORK_DURATION_EST_SEC = 45;
export const AUTO_FINALISE_AFTER_MS = 12 * 3_600_000;

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function resolveRest(ex: Exercise, item: PlanItem | undefined, settings: Settings): number {
  if (item?.restSecOverride && item.restSecOverride > 0) return item.restSecOverride;
  const eq = settings.restDefaults?.[ex.equipment as Equipment];
  if (eq && eq > 0) return eq;
  return ex.defaultRestSec;
}

function makeSets(types: SetType[]): SetLog[] {
  return types.map((type) => ({ id: newId('set'), type, segments: [], done: false }));
}

export interface CreateSessionInput {
  queue: string[];
  day: PlanDay | null;
  exercises: ExerciseMap;
  settings: Settings;
  now?: number;
}

/** Build a session from an ordered queue. Warm-ups derive from the queue order. */
export function createSession({ queue, day, exercises, settings, now = Date.now() }: CreateSessionInput): Session {
  const ids = queue.filter((id) => exercises[id]);
  const flags = warmupFlags(ids, exercises);
  const logs: Record<string, ExerciseLog> = {};
  ids.forEach((id, i) => {
    const ex = exercises[id];
    const item = day?.items.find((it) => it.exerciseId === id);
    logs[id] = {
      exerciseId: id,
      sets: makeSets(setTypes(schemeOf(item), flags[i])),
      skipped: false,
      restSec: resolveRest(ex, item, settings),
    };
  });
  return {
    id: newId('ses'),
    startedAt: now,
    endedAt: null,
    date: localDateStr(now),
    dayId: day?.id ?? null,
    label: day?.label ?? 'Freestyle',
    queue: ids,
    logs,
    cursor: { exIndex: 0, setIndex: 0 },
    scratch: { weight: null, pendingSegments: [] },
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function currentExerciseId(s: Session): string | undefined {
  return s.queue[s.cursor.exIndex];
}

export function currentLog(s: Session): ExerciseLog | undefined {
  const id = currentExerciseId(s);
  return id ? s.logs[id] : undefined;
}

export function activeSet(s: Session): SetLog | undefined {
  return currentLog(s)?.sets[s.cursor.setIndex];
}

export function exerciseComplete(log: ExerciseLog | undefined): boolean {
  return !!log && (log.skipped || log.sets.every((x) => x.done));
}

export function firstUndoneIndex(log: ExerciseLog): number {
  const i = log.sets.findIndex((x) => !x.done);
  return i < 0 ? log.sets.length : i;
}

export function doneSetCount(s: Session): number {
  let n = 0;
  for (const log of Object.values(s.logs)) for (const set of log.sets) if (set.done) n++;
  return n;
}

export function exercisesDone(s: Session): number {
  return s.queue.filter((id) => s.logs[id] && !s.logs[id].skipped && s.logs[id].sets.some((x) => x.done)).length;
}

export function remainingSetCount(s: Session): number {
  let n = 0;
  for (const id of s.queue) {
    const log = s.logs[id];
    if (!log || log.skipped) continue;
    n += log.sets.filter((x) => !x.done).length;
  }
  return n;
}

/** Index of the next exercise (after `from`) that still has work, or -1. */
export function nextIncompleteIndex(s: Session, from: number): number {
  for (let i = from + 1; i < s.queue.length; i++) if (!exerciseComplete(s.logs[s.queue[i]])) return i;
  for (let i = 0; i <= from && i < s.queue.length; i++) if (!exerciseComplete(s.logs[s.queue[i]])) return i;
  return -1;
}

export function allComplete(s: Session): boolean {
  return s.queue.every((id) => exerciseComplete(s.logs[id]));
}

/** Last weight actually logged for an exercise inside this session, or null. */
export function lastLoggedWeight(log: ExerciseLog | undefined, opts: { includeWarmup?: boolean } = {}): number | null {
  if (!log) return null;
  for (let i = log.sets.length - 1; i >= 0; i--) {
    const set = log.sets[i];
    if (!set.done || (set.type === 'warmup' && !opts.includeWarmup)) continue;
    const seg = set.segments[0];
    if (seg && seg.weight != null) return seg.weight;
  }
  return null;
}

/** Top-set working weight of a finished exercise log (first segment of the heaviest non-warmup set). */
export function topSet(log: ExerciseLog): Segment | null {
  let best: Segment | null = null;
  for (const set of log.sets) {
    if (!set.done || set.type === 'warmup') continue;
    const seg = set.segments[0];
    if (!seg || seg.weight == null) continue;
    if (!best || seg.weight > (best.weight ?? -Infinity)) best = seg;
  }
  return best;
}

/** Σ setCount × (45 s + rest), rounded to 5 minutes. */
export function estimateDurationMin(queue: string[], exercises: ExerciseMap, day: PlanDay | null, settings: Settings): number {
  const flags = warmupFlags(queue, exercises);
  let sec = 0;
  queue.forEach((id, i) => {
    const ex = exercises[id];
    if (!ex) return;
    const item = day?.items.find((it) => it.exerciseId === id);
    const n = setTypes(schemeOf(item), flags[i]).length;
    sec += n * (WORK_DURATION_EST_SEC + resolveRest(ex, item, settings));
  });
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

// ---------------------------------------------------------------------------
// Mutation (all pure: return a new Session)
// ---------------------------------------------------------------------------

function touch(s: Session, now: number): Session {
  return { ...s, updatedAt: now };
}

function withLog(s: Session, exId: string, fn: (log: ExerciseLog) => ExerciseLog): Session {
  const log = s.logs[exId];
  if (!log) return s;
  return { ...s, logs: { ...s.logs, [exId]: fn(log) } };
}

export function setScratchWeight(s: Session, weight: number | null): Session {
  return { ...s, scratch: { weight, pendingSegments: s.scratch?.pendingSegments ?? [] } };
}

/** `⤵ Drop weight` / `LOG DROP n`: commit the current weight as a pending segment. */
export function commitSegment(s: Session, weight: number | null, reps: number | null = null, now = Date.now()): Session {
  const pending = [...(s.scratch?.pendingSegments ?? []), { weight, reps }];
  return touch({ ...s, scratch: { weight: s.scratch?.weight ?? weight, pendingSegments: pending } }, now);
}

export function setPendingReps(s: Session, index: number, reps: number | null): Session {
  const pending = [...(s.scratch?.pendingSegments ?? [])];
  if (!pending[index]) return s;
  pending[index] = { ...pending[index], reps };
  return { ...s, scratch: { weight: s.scratch?.weight ?? null, pendingSegments: pending } };
}

export function clearPending(s: Session): Session {
  return { ...s, scratch: { weight: s.scratch?.weight ?? null, pendingSegments: [] } };
}

/**
 * `LOG SET` / `✓ Finish set`: writes pending segments + the current weight as the final
 * segment, marks the set done and advances the cursor within the exercise.
 */
export function logSet(s: Session, weight: number | null, now = Date.now()): Session {
  const exId = currentExerciseId(s);
  const log = exId ? s.logs[exId] : undefined;
  if (!exId || !log) return s;
  const idx = s.cursor.setIndex;
  const set = log.sets[idx];
  if (!set || set.done) return s;
  const segments: Segment[] = [...(s.scratch?.pendingSegments ?? []), { weight, reps: null }];
  const sets = log.sets.map((x, i) => (i === idx ? { ...x, segments, done: true, at: now } : x));
  const nextLog = { ...log, sets, skipped: false };
  const next = withLog(s, exId, () => nextLog);
  return touch(
    {
      ...next,
      cursor: { exIndex: s.cursor.exIndex, setIndex: firstUndoneIndex(nextLog) },
      scratch: { weight, pendingSegments: [] },
    },
    now,
  );
}

/** Rep chip during rest: writes reps on the last segment of a set. */
export function setSetReps(s: Session, exId: string, setId: string, reps: number | null, now = Date.now()): Session {
  return touch(
    withLog(s, exId, (log) => ({
      ...log,
      sets: log.sets.map((x) => {
        if (x.id !== setId || !x.segments.length) return x;
        const segs = [...x.segments];
        segs[segs.length - 1] = { ...segs[segs.length - 1], reps };
        return { ...x, segments: segs };
      }),
    })),
    now,
  );
}

export function updateSetSegments(s: Session, exId: string, setId: string, segments: Segment[], now = Date.now()): Session {
  return touch(
    withLog(s, exId, (log) => ({
      ...log,
      sets: log.sets.map((x) => (x.id === setId ? { ...x, segments: segments.length ? segments : x.segments } : x)),
    })),
    now,
  );
}

export function unlogSet(s: Session, exId: string, setId: string, now = Date.now()): Session {
  const next = withLog(s, exId, (log) => ({
    ...log,
    sets: log.sets.map((x) => (x.id === setId ? { ...x, segments: [], done: false, at: undefined } : x)),
  }));
  return touch(resyncCursor(next), now);
}

export function deleteSet(s: Session, exId: string, setId: string, now = Date.now()): Session {
  const next = withLog(s, exId, (log) => ({ ...log, sets: log.sets.filter((x) => x.id !== setId) }));
  return touch(resyncCursor(next), now);
}

export function addSet(s: Session, exId: string, type: SetType = 'work', now = Date.now()): Session {
  const next = withLog(s, exId, (log) => ({ ...log, sets: [...log.sets, { id: newId('set'), type, segments: [], done: false }], skipped: false }));
  return touch(resyncCursor(next), now);
}

/** Keep the set cursor pointing at the first undone set of the current exercise. */
function resyncCursor(s: Session): Session {
  const log = currentLog(s);
  if (!log) return s;
  return { ...s, cursor: { ...s.cursor, setIndex: firstUndoneIndex(log) } };
}

export function jumpTo(s: Session, exIndex: number, now = Date.now()): Session {
  if (exIndex < 0 || exIndex >= s.queue.length) return s;
  const log = s.logs[s.queue[exIndex]];
  return touch(clearPending({ ...s, cursor: { exIndex, setIndex: log ? firstUndoneIndex(log) : 0 } }), now);
}

/** `Next exercise`: the next incomplete one; returns the same session when nothing is left. */
export function nextExercise(s: Session, now = Date.now()): Session {
  const i = nextIncompleteIndex(s, s.cursor.exIndex);
  return i < 0 ? s : jumpTo(s, i, now);
}

export function skipExercise(s: Session, exId: string, now = Date.now()): Session {
  const next = withLog(s, exId, (log) => ({ ...log, skipped: true }));
  const idx = next.queue.indexOf(exId);
  const i = nextIncompleteIndex(next, idx);
  return touch(i < 0 ? next : jumpTo(next, i, now), now);
}

export function unskipExercise(s: Session, exId: string, now = Date.now()): Session {
  return touch(withLog(s, exId, (log) => ({ ...log, skipped: false })), now);
}

/** Reorder the queue; the cursor follows the exercise that was active. */
export function reorderQueue(s: Session, newQueue: string[], now = Date.now()): Session {
  const cur = currentExerciseId(s);
  const queue = newQueue.filter((id) => s.logs[id]);
  for (const id of s.queue) if (!queue.includes(id)) queue.push(id);
  const exIndex = cur ? Math.max(0, queue.indexOf(cur)) : 0;
  return touch({ ...s, queue, cursor: { ...s.cursor, exIndex } }, now);
}

/** `+ Add exercise` mid-session. Warm-up derives from what has been trained so far. */
export function addExercise(
  s: Session,
  ex: Exercise,
  exercises: ExerciseMap,
  settings: Settings,
  opts: { position?: number; scheme?: SetScheme; restSec?: number } = {},
  now = Date.now(),
): Session {
  if (s.logs[ex.id]) return s;
  const position = opts.position == null ? s.queue.length : Math.min(s.queue.length, Math.max(0, opts.position));
  const queue = [...s.queue];
  queue.splice(position, 0, ex.id);
  const flags = warmupFlags(queue, exercises);
  const log: ExerciseLog = {
    exerciseId: ex.id,
    sets: makeSets(setTypes(opts.scheme ?? { workSets: 2, dropSets: 0 }, flags[position])),
    skipped: false,
    addedMidSession: true,
    restSec: opts.restSec ?? resolveRest(ex, undefined, settings),
  };
  const cur = currentExerciseId(s);
  const exIndex = cur ? queue.indexOf(cur) : 0;
  return touch({ ...s, queue, logs: { ...s.logs, [ex.id]: log }, cursor: { ...s.cursor, exIndex } }, now);
}

export function removeExercise(s: Session, exId: string, now = Date.now()): Session {
  if (!s.logs[exId]) return s;
  const cur = currentExerciseId(s);
  const queue = s.queue.filter((id) => id !== exId);
  const logs = { ...s.logs };
  delete logs[exId];
  let exIndex = cur && cur !== exId ? queue.indexOf(cur) : Math.min(s.cursor.exIndex, queue.length - 1);
  if (exIndex < 0) exIndex = 0;
  const next = { ...s, queue, logs, cursor: { exIndex, setIndex: 0 } };
  return touch(resyncCursor(next), now);
}

/**
 * `⇄ Swap`: replace the current exercise with an alternative. Logged sets on the old
 * exercise are kept (it stays in the queue, truncated to what was done); the new
 * exercise takes over the remaining sets.
 */
export function swapExercise(
  s: Session,
  fromId: string,
  to: Exercise,
  exercises: ExerciseMap,
  settings: Settings,
  now = Date.now(),
): Session {
  const oldLog = s.logs[fromId];
  if (!oldLog || s.logs[to.id]) return s;
  const idx = s.queue.indexOf(fromId);
  const doneSets = oldLog.sets.filter((x) => x.done);
  const remaining = oldLog.sets.filter((x) => !x.done);
  // The warm-up is re-derived for the new exercise below; carry over only the working sets.
  const remainingTypes: SetType[] = remaining.map((x) => x.type).filter((t) => t !== 'warmup');
  let next: Session = s;
  if (doneSets.length) {
    next = withLog(next, fromId, (log) => ({ ...log, sets: doneSets }));
  } else {
    const queue = next.queue.filter((id) => id !== fromId);
    const logs = { ...next.logs };
    delete logs[fromId];
    next = { ...next, queue, logs };
  }
  const position = doneSets.length ? idx + 1 : idx;
  const queue = [...next.queue];
  queue.splice(position, 0, to.id);
  const flags = warmupFlags(queue, exercises);
  const types: SetType[] = remainingTypes.length ? [...remainingTypes] : ['work', 'work'];
  if (flags[position]) types.unshift('warmup');
  const log: ExerciseLog = {
    exerciseId: to.id,
    sets: makeSets(types),
    skipped: false,
    addedMidSession: true,
    restSec: resolveRest(to, undefined, settings),
  };
  return touch(
    clearPending({ ...next, queue, logs: { ...next.logs, [to.id]: log }, cursor: { exIndex: position, setIndex: 0 } }),
    now,
  );
}

// ---------------------------------------------------------------------------
// Finalisation
// ---------------------------------------------------------------------------

export interface FinalizeResult {
  session: Session;
  debt: Record<string, number>;
  carried: string[];
  cleared: string[];
}

/** §6.8 / §10.6: debt and session written together, once. */
export function finalizeSession(s: Session, debt: Record<string, number>, planDay: PlanDay | null, now = Date.now()): FinalizeResult {
  const ended: Session = { ...s, endedAt: s.endedAt ?? now, scratch: undefined, updatedAt: now };
  const r = applyDebt(debt, ended, planDay);
  return { session: ended, debt: r.debt, carried: r.carried, cleared: r.cleared };
}

// ---------------------------------------------------------------------------
// Derived performance (rebuilt from sessions at boot and after import)
// ---------------------------------------------------------------------------

export function derivePerformance(sessions: Session[]): Record<string, LastPerformance> {
  const out: Record<string, LastPerformance> = {};
  const ordered = sessions.filter((s) => s.endedAt).sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  for (const s of ordered) {
    for (const log of Object.values(s.logs)) {
      const top = topSet(log);
      if (!top) continue;
      const prev = out[log.exerciseId];
      const best = Math.max(prev?.best ?? -Infinity, top.weight ?? -Infinity);
      out[log.exerciseId] = {
        weight: top.weight,
        reps: top.reps,
        at: s.endedAt ?? s.startedAt,
        best: Number.isFinite(best) ? best : null,
      };
    }
  }
  return out;
}

export interface LiftPoint {
  date: string;
  sessionId: string;
  weight: number | null;
}

/** Top-set weight per session for the last `n` sessions containing the exercise. */
export function liftHistory(sessions: Session[], exerciseId: string, n = 10): LiftPoint[] {
  return sessions
    .filter((s) => s.endedAt && s.logs[exerciseId])
    .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
    .map((s) => ({ date: s.date, sessionId: s.id, weight: topSet(s.logs[exerciseId])?.weight ?? null }))
    .filter((p) => p.weight != null)
    .slice(-n);
}

export function sessionDurationMin(s: Session): number {
  const end = s.endedAt ?? Date.now();
  return Math.max(1, Math.round((end - s.startedAt) / 60000));
}

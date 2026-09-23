import type { AppState, Backup, Exercise, GymProfile, Plan, Session } from './types';
import { CATALOGUE_IDS, mergeCatalogue } from './exercises';
import { derivePerformance } from './session';

export const SCHEMA_VERSION = 1 as const;

export interface Snapshot {
  exercises: Exercise[];
  gym: GymProfile;
  plan: Plan;
  sessions: Session[];
  state: AppState;
}

export function makeBackup(snap: Snapshot, now = Date.now()): Backup {
  return {
    app: 'iron',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    exercises: snap.exercises,
    gym: snap.gym,
    plan: snap.plan,
    sessions: snap.sessions.filter((s) => s.endedAt), // in-progress sessions are device-local
    state: { ...snap.state, updatedAt: now },
  };
}

export function backupFilename(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `iron-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export class BackupError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Structural validation; throws BackupError with a human message. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }
  if (!isObj(raw) || raw.app !== 'iron') throw new BackupError('That file is not an Iron backup.');
  if (raw.schemaVersion !== SCHEMA_VERSION) throw new BackupError(`Unsupported backup version ${String(raw.schemaVersion)}.`);
  for (const k of ['exercises', 'gym', 'plan', 'sessions', 'state'] as const) {
    if (!(k in raw)) throw new BackupError(`Backup is missing "${k}".`);
  }
  if (!Array.isArray(raw.exercises) || !Array.isArray(raw.sessions)) throw new BackupError('Backup is malformed.');
  if (!isObj(raw.gym) || !isObj(raw.plan) || !isObj(raw.state)) throw new BackupError('Backup is malformed.');
  return raw as unknown as Backup;
}

/**
 * Merge: union of sessions by id (newer wins), union of exercises (imported edits win),
 * gym/plan/settings from whichever is newer. Replace: the backup wins wholesale.
 */
export function applyBackup(current: Snapshot, backup: Backup, mode: 'merge' | 'replace'): Snapshot {
  if (mode === 'replace') {
    const exercises = mergeCatalogue(backup.exercises);
    const sessions = [...backup.sessions];
    return {
      exercises,
      gym: backup.gym,
      plan: backup.plan,
      sessions,
      state: { ...backup.state, lastPerformance: derivePerformance(sessions) },
    };
  }
  const exById = new Map(current.exercises.map((e) => [e.id, e]));
  for (const e of backup.exercises) {
    const cur = exById.get(e.id);
    if (!cur || (e.updatedAt ?? 0) >= (cur.updatedAt ?? 0) || (!CATALOGUE_IDS.has(e.id) && !cur)) exById.set(e.id, e);
  }
  const sesById = new Map(current.sessions.map((s) => [s.id, s]));
  for (const s of backup.sessions) {
    const cur = sesById.get(s.id);
    if (!cur || (s.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) sesById.set(s.id, s);
  }
  const sessions = [...sesById.values()].sort((a, b) => a.startedAt - b.startedAt);
  const gym = backup.gym.updatedAt > current.gym.updatedAt ? backup.gym : current.gym;
  const plan = backup.plan.updatedAt > current.plan.updatedAt ? backup.plan : current.plan;
  const newerState = backup.state.updatedAt > current.state.updatedAt ? backup.state : current.state;
  const debt: Record<string, number> = { ...current.state.debt };
  for (const [k, v] of Object.entries(backup.state.debt ?? {})) debt[k] = Math.max(debt[k] ?? 0, v);
  return {
    exercises: mergeCatalogue([...exById.values()]),
    gym,
    plan,
    sessions,
    state: {
      ...newerState,
      onboarded: current.state.onboarded || backup.state.onboarded,
      debt,
      coachCache: { ...backup.state.coachCache, ...current.state.coachCache },
      lastPerformance: derivePerformance(sessions),
    },
  };
}

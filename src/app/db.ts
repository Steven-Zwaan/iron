/**
 * Dexie (IndexedDB) persistence. Everything is read into memory at boot and written
 * through on mutation (fire-and-forget), so all reads in the app are synchronous (N4).
 */
import Dexie, { type EntityTable } from 'dexie';
import type { AppState, Exercise, GymProfile, Plan, Session } from '@/domain/types';
import { CATALOGUE, defaultGym, mergeCatalogue } from '@/domain/exercises';
import { seedPlan } from '@/domain/plan';
import type { Snapshot } from '@/domain/backup';

interface MetaRow {
  key: string;
  value: unknown;
}

export const DB_NAME = 'iron';

type IronDB = Dexie & {
  exercises: EntityTable<Exercise, 'id'>;
  gym: EntityTable<GymProfile, 'id'>;
  plans: EntityTable<Plan, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  state: EntityTable<AppState, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

export function openDb(): IronDB {
  const db = new Dexie(DB_NAME) as IronDB;
  db.version(1).stores({
    exercises: 'id, name, equipment',
    gym: 'id',
    plans: 'id',
    sessions: 'id, date, dayId, endedAt',
    state: 'id', // single row, id='app'
    meta: 'key', // schema version, lastBackupAt
  });
  return db;
}

export let db: IronDB = openDb();

export const DEFAULT_SETTINGS: AppState['settings'] = {
  theme: 'auto',
  restAutoStart: true,
  restSound: true,
  restVibrate: true,
  repChipsOnRest: true,
  askRepsBeforeDrop: true,
  aiEnabled: false,
  aiEndpoint: '/api/coach',
};

export function defaultState(now = Date.now()): AppState {
  return {
    id: 'app',
    onboarded: false,
    debt: {},
    lastPerformance: {},
    coachCache: {},
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: now,
  };
}

export interface LoadedData extends Snapshot {
  fresh: boolean; // true on very first launch (nothing stored yet)
}

function report(err: unknown): void {
  console.warn('[iron] persistence error', err);
}

/** Read everything. Seeds the catalogue, gym and plan on first launch. */
export async function loadAll(): Promise<LoadedData> {
  const now = Date.now();
  const [exercises, gym, plan, sessions, state] = await Promise.all([
    db.exercises.toArray(),
    db.gym.get('default'),
    db.plans.get('default'),
    db.sessions.toArray(),
    db.state.get('app'),
  ]);
  const fresh = !state;
  const merged = exercises.length ? mergeCatalogue(exercises) : CATALOGUE;
  if (merged !== exercises) {
    db.exercises.bulkPut(merged.filter((e) => !exercises.some((x) => x.id === e.id))).catch(report);
  }
  const g = gym ?? defaultGym('kg', now);
  const p = plan ?? seedPlan(now);
  const st = state ?? defaultState(now);
  if (fresh) {
    db.transaction('rw', [db.gym, db.plans, db.state, db.meta], async () => {
      await db.gym.put(g);
      await db.plans.put(p);
      await db.state.put(st);
      await db.meta.put({ key: 'schemaVersion', value: 1 });
      await db.meta.put({ key: 'installedAt', value: now });
    }).catch(report);
  }
  return { exercises: merged, gym: g, plan: p, sessions, state: st, fresh };
}

export const persist = {
  exercise(ex: Exercise): void {
    db.exercises.put(ex).catch(report);
  },
  exercises(list: Exercise[]): void {
    db.exercises.bulkPut(list).catch(report);
  },
  deleteExercise(id: string): void {
    db.exercises.delete(id).catch(report);
  },
  gym(g: GymProfile): void {
    db.gym.put(g).catch(report);
  },
  plan(p: Plan): void {
    db.plans.put(p).catch(report);
  },
  session(s: Session): void {
    db.sessions.put(s).catch(report);
  },
  deleteSession(id: string): void {
    db.sessions.delete(id).catch(report);
  },
  state(st: AppState): void {
    db.state.put(st).catch(report);
  },
  /** Session + debt written in one transaction so debt can never double-apply (§10.6). */
  finalize(session: Session, st: AppState): void {
    db.transaction('rw', [db.sessions, db.state], async () => {
      await db.sessions.put(session);
      await db.state.put(st);
    }).catch(report);
  },
  meta(key: string, value: unknown): void {
    db.meta.put({ key, value }).catch(report);
  },
  /** Used by import: replace all tables atomically. */
  async replaceAll(snap: Snapshot): Promise<void> {
    await db.transaction('rw', [db.exercises, db.gym, db.plans, db.sessions, db.state], async () => {
      await db.exercises.clear();
      await db.exercises.bulkPut(snap.exercises);
      await db.gym.put(snap.gym);
      await db.plans.put(snap.plan);
      await db.sessions.clear();
      await db.sessions.bulkPut(snap.sessions);
      await db.state.put(snap.state);
    });
  },
  async clearAll(): Promise<void> {
    await db.delete();
    db = openDb();
  },
};

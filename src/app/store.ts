/**
 * Zustand store: the single in-memory source of truth plus every mutation.
 * Domain logic lives in src/domain; this file only wires it to state + persistence.
 */
import { create } from 'zustand';
import type { AppState, Backup, CoachCacheEntry, Exercise, ExerciseMap, GymProfile, Plan, PlanDay, PlanItem, Session, Settings } from '@/domain/types';
import { toMap } from '@/domain/exercises';
import { move, newDay, newItem } from '@/domain/plan';
import { AUTO_FINALISE_AFTER_MS, createSession, derivePerformance, finalizeSession, type FinalizeResult } from '@/domain/session';
import { applyBackup, makeBackup, type Snapshot } from '@/domain/backup';
import { defaultState, loadAll, persist } from './db';
import { toast } from './ui';
import { relativeDate } from '@/domain/format';

export interface IronStore {
  ready: boolean;
  fresh: boolean;
  exercises: ExerciseMap;
  gym: GymProfile;
  plan: Plan;
  sessions: Session[]; // finalised
  active: Session | null; // in progress
  state: AppState;

  boot(): Promise<void>;

  // gym / exercises
  saveGym(patch: Partial<GymProfile>): void;
  setAvailable(ids: string[], on: boolean): void;
  upsertExercise(ex: Exercise): void;
  deleteExercise(id: string): void;

  // plan
  savePlan(plan: Plan): void;
  addDay(label: string, weekday?: number): PlanDay;
  updateDay(dayId: string, patch: Partial<Pick<PlanDay, 'label' | 'weekday'>>): void;
  deleteDay(dayId: string): void;
  duplicateDay(dayId: string): void;
  moveDay(from: number, to: number): void;
  addItem(dayId: string, exerciseId: string): void;
  updateItem(dayId: string, index: number, patch: Partial<PlanItem>): void;
  removeItem(dayId: string, index: number): void;
  moveItem(dayId: string, from: number, to: number): void;

  // state
  saveSettings(patch: Partial<Settings>): void;
  setOnboarded(v: boolean): void;
  clearDebt(exerciseId?: string): void;
  setCoachCache(exerciseId: string, entry: Partial<CoachCacheEntry>): void;

  // sessions
  startSession(queue: string[], day: PlanDay | null): Session;
  updateActive(fn: (s: Session) => Session): void;
  finishSession(): FinalizeResult | null;
  discardSession(): void;
  saveManualSession(session: Session): void;
  deleteSession(id: string): void;

  // backup
  exportBackup(): Backup;
  importBackup(backup: Backup, mode: 'merge' | 'replace'): Promise<void>;
  resetAll(): Promise<void>;
}

function snapshotOf(s: IronStore): Snapshot {
  return { exercises: Object.values(s.exercises), gym: s.gym, plan: s.plan, sessions: s.sessions, state: s.state };
}

export const useStore = create<IronStore>()((set, get) => {
  const bumpState = (patch: Partial<AppState>) => {
    const state: AppState = { ...get().state, ...patch, updatedAt: Date.now() };
    set({ state });
    persist.state(state);
    return state;
  };
  const bumpPlan = (fn: (p: Plan) => Plan) => {
    const plan = { ...fn(get().plan), updatedAt: Date.now() };
    set({ plan });
    persist.plan(plan);
  };
  const bumpDay = (dayId: string, fn: (d: PlanDay) => PlanDay) =>
    bumpPlan((p) => ({ ...p, days: p.days.map((d) => (d.id === dayId ? fn(d) : d)) }));

  return {
    ready: false,
    fresh: false,
    exercises: {},
    gym: { id: 'default', name: '', unit: 'kg', available: [], increments: { machine_stack: 5, cable_stack: 2.5, plate_loaded: 1.25, barbell: 2.5, dumbbell: 2, bodyweight: 2.5, other: 2.5 }, dumbbells: [], barWeight: 20, plates: [], updatedAt: 0 },
    plan: { id: 'default', days: [], updatedAt: 0 },
    sessions: [],
    active: null,
    state: defaultState(),

    async boot() {
      const data = await loadAll();
      const now = Date.now();
      const finalised = data.sessions.filter((s) => s.endedAt).sort((a, b) => a.startedAt - b.startedAt);
      const open = data.sessions.filter((s) => !s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
      let active: Session | null = open[0] ?? null;
      let state = data.state;

      // Stray extra open sessions (should not happen) are dropped.
      for (const s of open.slice(1)) persist.deleteSession(s.id);

      // A session left open for > 12 h is auto-finalised on next launch, with a toast (§6.7).
      if (active && now - active.startedAt > AUTO_FINALISE_AFTER_MS) {
        const day = data.plan.days.find((d) => d.id === active!.dayId) ?? null;
        const r = finalizeSession(active, state.debt, day, now);
        finalised.push(r.session);
        state = { ...state, debt: r.debt, updatedAt: now };
        persist.finalize(r.session, state);
        toast(`Your ${relativeDate(active.date, now).toLowerCase()} session was finished automatically.`);
        active = null;
      }

      state = { ...state, lastPerformance: derivePerformance(finalised) };
      set({
        ready: true,
        fresh: data.fresh,
        exercises: toMap(data.exercises),
        gym: data.gym,
        plan: data.plan,
        sessions: finalised,
        active,
        state,
      });
    },

    saveGym(patch) {
      const gym = { ...get().gym, ...patch, updatedAt: Date.now() };
      set({ gym });
      persist.gym(gym);
    },
    setAvailable(ids, on) {
      const cur = new Set(get().gym.available);
      for (const id of ids) on ? cur.add(id) : cur.delete(id);
      get().saveGym({ available: [...cur] });
    },
    upsertExercise(ex) {
      const now = Date.now();
      const next = { ...ex, updatedAt: now, createdAt: ex.createdAt ?? (ex.custom ? now : undefined) };
      set({ exercises: { ...get().exercises, [ex.id]: next } });
      persist.exercise(next);
      if (ex.custom && !get().gym.available.includes(ex.id)) get().setAvailable([ex.id], true);
    },
    deleteExercise(id) {
      const ex = get().exercises[id];
      if (!ex?.custom) return;
      const exercises = { ...get().exercises };
      delete exercises[id];
      set({ exercises });
      persist.deleteExercise(id);
      get().setAvailable([id], false);
      bumpPlan((p) => ({ ...p, days: p.days.map((d) => ({ ...d, items: d.items.filter((i) => i.exerciseId !== id) })) }));
    },

    savePlan(plan) {
      bumpPlan(() => plan);
    },
    addDay(label, weekday) {
      const d = newDay(label, weekday);
      bumpPlan((p) => ({ ...p, days: [...p.days, d] }));
      return d;
    },
    updateDay(dayId, patch) {
      bumpDay(dayId, (d) => ({ ...d, ...patch }));
    },
    deleteDay(dayId) {
      bumpPlan((p) => ({ ...p, days: p.days.filter((d) => d.id !== dayId) }));
    },
    duplicateDay(dayId) {
      bumpPlan((p) => {
        const i = p.days.findIndex((d) => d.id === dayId);
        if (i < 0) return p;
        const src = p.days[i];
        const copy = { ...newDay(`${src.label} copy`, undefined), items: structuredClone(src.items) };
        const days = [...p.days];
        days.splice(i + 1, 0, copy);
        return { ...p, days };
      });
    },
    moveDay(from, to) {
      bumpPlan((p) => ({ ...p, days: move(p.days, from, to) }));
    },
    addItem(dayId, exerciseId) {
      bumpDay(dayId, (d) => (d.items.some((i) => i.exerciseId === exerciseId) ? d : { ...d, items: [...d.items, newItem(exerciseId)] }));
    },
    updateItem(dayId, index, patch) {
      bumpDay(dayId, (d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }));
    },
    removeItem(dayId, index) {
      bumpDay(dayId, (d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }));
    },
    moveItem(dayId, from, to) {
      bumpDay(dayId, (d) => ({ ...d, items: move(d.items, from, to) }));
    },

    saveSettings(patch) {
      bumpState({ settings: { ...get().state.settings, ...patch } });
    },
    setOnboarded(v) {
      bumpState({ onboarded: v });
    },
    clearDebt(exerciseId) {
      const debt = exerciseId ? { ...get().state.debt } : {};
      if (exerciseId) delete debt[exerciseId];
      bumpState({ debt });
    },
    setCoachCache(exerciseId, entry) {
      const cur = get().state.coachCache[exerciseId] ?? { alternatives: [], cues: [], fetchedAt: 0 };
      bumpState({ coachCache: { ...get().state.coachCache, [exerciseId]: { ...cur, ...entry, fetchedAt: Date.now() } } });
    },

    startSession(queue, day) {
      const { exercises, state } = get();
      const s = createSession({ queue, day, exercises, settings: state.settings });
      set({ active: s });
      persist.session(s);
      return s;
    },
    updateActive(fn) {
      const cur = get().active;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      set({ active: next });
      persist.session(next);
    },
    finishSession() {
      const { active, plan, state, sessions } = get();
      if (!active) return null;
      const day = plan.days.find((d) => d.id === active.dayId) ?? null;
      const r = finalizeSession(active, state.debt, day);
      const nextSessions = [...sessions, r.session];
      const nextState: AppState = { ...state, debt: r.debt, lastPerformance: derivePerformance(nextSessions), updatedAt: Date.now() };
      set({ active: null, sessions: nextSessions, state: nextState });
      persist.finalize(r.session, nextState);
      return r;
    },
    discardSession() {
      const { active } = get();
      if (!active) return;
      set({ active: null });
      persist.deleteSession(active.id);
    },
    saveManualSession(session) {
      const { sessions, state } = get();
      const ended = { ...session, endedAt: session.endedAt ?? Date.now(), scratch: undefined };
      const nextSessions = [...sessions.filter((s) => s.id !== ended.id), ended].sort((a, b) => a.startedAt - b.startedAt);
      const nextState: AppState = { ...state, lastPerformance: derivePerformance(nextSessions), updatedAt: Date.now() };
      set({ sessions: nextSessions, state: nextState });
      persist.finalize(ended, nextState);
    },
    deleteSession(id) {
      const { sessions, state } = get();
      const nextSessions = sessions.filter((s) => s.id !== id);
      const nextState: AppState = { ...state, lastPerformance: derivePerformance(nextSessions), updatedAt: Date.now() };
      set({ sessions: nextSessions, state: nextState });
      persist.deleteSession(id);
      persist.state(nextState);
    },

    exportBackup() {
      persist.meta('lastBackupAt', Date.now());
      return makeBackup(snapshotOf(get()));
    },
    async importBackup(backup, mode) {
      const snap = applyBackup(snapshotOf(get()), backup, mode);
      await persist.replaceAll(snap);
      set({
        exercises: toMap(snap.exercises),
        gym: snap.gym,
        plan: snap.plan,
        sessions: snap.sessions.filter((s) => s.endedAt).sort((a, b) => a.startedAt - b.startedAt),
        state: snap.state,
      });
    },
    async resetAll() {
      await persist.clearAll();
      const data = await loadAll();
      set({
        exercises: toMap(data.exercises),
        gym: data.gym,
        plan: data.plan,
        sessions: [],
        active: null,
        state: data.state,
        fresh: true,
      });
    },
  };
});

/** Convenience: exercise lookup that tolerates missing ids. */
export function useExercise(id: string | undefined): Exercise | undefined {
  return useStore((s) => (id ? s.exercises[id] : undefined));
}

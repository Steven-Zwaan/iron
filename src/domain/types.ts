/**
 * Iron — domain types.
 *
 * Every persisted object is plain JSON. This file is the contract shared with
 * the future Swift port: each interface maps 1:1 onto a Codable struct.
 * See docs/PORTING-SWIFT.md.
 */

// ---------- muscles ----------
export type MuscleId =
  | 'traps' | 'delts_front' | 'delts_side' | 'delts_rear'
  | 'chest' | 'lats' | 'upper_back' | 'lower_back'
  | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques'
  | 'glutes' | 'quads' | 'hamstrings' | 'calves';

export type MuscleCategory = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

export interface MuscleDef {
  id: MuscleId;
  name: string;
  category: MuscleCategory;
  weeklyTarget: number; // effective sets per week
}

// ---------- equipment ----------
export type Equipment =
  | 'machine_stack' | 'cable_stack' | 'plate_loaded'
  | 'barbell' | 'dumbbell' | 'bodyweight' | 'other';

export type MeasureMode = 'weight' | 'stack_level' | 'bodyweight' | 'assisted';

export type Unit = 'kg' | 'lb';

// ---------- exercises ----------
export interface Exercise {
  id: string;
  name: string;
  aliases?: string[];
  equipment: Equipment;
  measure: MeasureMode;
  defaultRestSec: number;
  muscles: Partial<Record<MuscleId, number>>; // contribution 0..1, primary = 1
  unilateral?: boolean;
  dropStepPct?: number; // default 20
  custom?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

// ---------- gym ----------
export interface GymProfile {
  id: 'default';
  name: string;
  unit: Unit;
  available: string[]; // exercise ids
  increments: Record<Equipment, number>; // step size per equipment
  dumbbells: number[]; // the rack, ascending
  barWeight: number; // 20 kg / 45 lb
  plates: number[]; // per-side plates available
  updatedAt: number;
}

// ---------- plans ----------
export interface PlanItem {
  exerciseId: string;
  workSets: number; // to failure, default 2
  dropSets: number; // default 0, performed before the work sets
  restSecOverride?: number;
  note?: string;
}
export interface PlanDay {
  id: string;
  label: string;
  weekday?: number; // 0 = Sun .. 6 = Sat
  items: PlanItem[];
}
export interface Plan {
  id: 'default';
  days: PlanDay[];
  updatedAt: number;
}

// ---------- sessions ----------
export type SetType = 'warmup' | 'work' | 'drop';

export interface Segment {
  weight: number | null; // null = not recorded
  reps: number | null; // null = to failure / not counted
}
export interface SetLog {
  id: string;
  type: SetType;
  segments: Segment[]; // 1 = normal, >1 = dropset or mid-set change
  done: boolean;
  at?: number;
}
export interface ExerciseLog {
  exerciseId: string;
  sets: SetLog[];
  skipped: boolean;
  addedMidSession?: boolean;
  restSec: number; // resolved rest for this exercise in this session
}
export interface SessionCursor {
  exIndex: number;
  setIndex: number;
}
export interface SessionScratch {
  weight: number | null; // where the scrubber sits
  pendingSegments: Segment[]; // open dropset chain
}
export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  date: string; // ISO local date the session belongs to
  dayId: string | null; // null = freestyle
  label: string;
  queue: string[]; // exercise ids in performed order
  logs: Record<string, ExerciseLog>;
  cursor: SessionCursor;
  scratch?: SessionScratch;
  updatedAt: number;
}

// ---------- derived / state ----------
export interface LastPerformance {
  weight: number | null;
  reps: number | null;
  at: number;
  best: number | null;
}
export interface CoachAlternative {
  name: string;
  why: string;
  exerciseId?: string;
}
export interface CoachCacheEntry {
  alternatives: CoachAlternative[];
  cues: string[];
  fetchedAt: number;
}
export type Theme = 'auto' | 'dark' | 'light';

export interface Settings {
  theme: Theme;
  restAutoStart: boolean;
  restSound: boolean;
  restVibrate: boolean;
  repChipsOnRest: boolean;
  askRepsBeforeDrop: boolean;
  aiEnabled: boolean;
  aiEndpoint: string;
  aiToken?: string; // optional bearer token for a protected proxy (COACH_SECRET)
  weeklyTargets?: Partial<Record<MuscleId, number>>; // overrides
  restDefaults?: Partial<Record<Equipment, number>>; // per-equipment overrides
}

export interface AppState {
  id: 'app';
  onboarded: boolean;
  debt: Record<string, number>; // exerciseId -> count, capped at 3
  lastPerformance: Record<string, LastPerformance>;
  coachCache: Record<string, CoachCacheEntry>;
  settings: Settings;
  updatedAt: number;
}

export type Tier = 0 | 1 | 2 | 3 | 4;

export interface MuscleScore {
  muscle: MuscleId;
  effectiveSets: number;
  target: number;
  score: number; // 0..100
  tier: Tier;
  topContributors: { exerciseId: string; effectiveSets: number }[];
}
export interface BodyScore {
  overall: number; // 0..100
  muscles: Record<MuscleId, MuscleScore>;
  rangeDays: number;
}

// ---------- backup ----------
export interface Backup {
  app: 'iron';
  schemaVersion: 1;
  exportedAt: number;
  exercises: Exercise[];
  gym: GymProfile;
  plan: Plan;
  sessions: Session[];
  state: AppState;
}

export type ExerciseMap = Record<string, Exercise>;

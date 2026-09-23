/**
 * Fetch wrapper for the coach proxy (§12.1) with short-lived caching and graceful failure.
 * Nothing here ever blocks a screen; every caller has a deterministic fallback.
 */
import type { CoachAlternative, MuscleId, PlanDay } from '@/domain/types';
import { useStore } from '@/app/store';
import type { CoachContext } from './prompts';

export type CoachTask = 'brief' | 'weakpoints' | 'cues' | 'alternatives' | 'musclemap' | 'plan' | 'parselog' | 'chat';

export class CoachError extends Error {
  constructor(
    public code: 'offline' | 'disabled' | 'rate_limited' | 'bad_request' | 'refused' | 'network' | 'server',
    message: string,
  ) {
    super(message);
  }
}

export interface ParsedLogEntry {
  ex: string; // known id or plain name
  skipped: boolean;
  sets: { w: number | null; r: number | null }[];
}
export interface ParsedLog {
  date: string;
  entries: ParsedLogEntry[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const memo = new Map<string, { at: number; data: unknown }>();
const FIVE_MIN = 5 * 60_000;

function endpoint(): string {
  return useStore.getState().state.settings.aiEndpoint || '/api/coach';
}

function authHeaders(): Record<string, string> {
  const t = useStore.getState().state.settings.aiToken?.trim();
  return t ? { authorization: `Bearer ${t}` } : {};
}

export function aiEnabled(): boolean {
  return useStore.getState().state.settings.aiEnabled;
}

async function call<T>(task: CoachTask, payload: unknown, context?: CoachContext, opts: { cacheKey?: string; ttl?: number; signal?: AbortSignal } = {}): Promise<T> {
  if (!aiEnabled()) throw new CoachError('disabled', 'Coach is switched off in Settings.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CoachError('offline', 'You are offline. Everything else works without the network.');
  if (opts.cacheKey) {
    const hit = memo.get(opts.cacheKey);
    if (hit && Date.now() - hit.at < (opts.ttl ?? FIVE_MIN)) return hit.data as T;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ task, payload, context }),
      signal: ctrl.signal,
    });
  } catch {
    throw new CoachError('network', 'Could not reach the coach. Check your connection or endpoint.');
  } finally {
    clearTimeout(timer);
  }
  let body: { ok: boolean; data?: T; code?: CoachError['code']; message?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new CoachError('server', `Unexpected response (${res.status}).`);
  }
  if (!res.ok || !body.ok) throw new CoachError(body.code ?? 'server', body.message ?? `Coach error (${res.status}).`);
  if (opts.cacheKey) memo.set(opts.cacheKey, { at: Date.now(), data: body.data });
  return body.data as T;
}

/** Streams plain text for prose tasks; falls back to the JSON response when streaming is unavailable. */
async function stream(task: CoachTask, payload: unknown, context: CoachContext | undefined, onChunk: (text: string) => void, signal?: AbortSignal): Promise<string> {
  if (!aiEnabled()) throw new CoachError('disabled', 'Coach is switched off in Settings.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CoachError('offline', 'You are offline.');
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/plain', ...authHeaders() },
      body: JSON.stringify({ task, payload, context, stream: true }),
      signal,
    });
  } catch {
    throw new CoachError('network', 'Could not reach the coach.');
  }
  if (!res.ok) {
    let msg = `Coach error (${res.status}).`;
    let code: CoachError['code'] = 'server';
    try {
      const j = (await res.json()) as { message?: string; code?: CoachError['code'] };
      msg = j.message ?? msg;
      code = j.code ?? code;
    } catch {
      /* ignore */
    }
    throw new CoachError(code, msg);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const j = (await res.json()) as { ok: boolean; data?: { text: string }; message?: string; code?: CoachError['code'] };
    if (!j.ok) throw new CoachError(j.code ?? 'server', j.message ?? 'Coach error.');
    onChunk(j.data?.text ?? '');
    return j.data?.text ?? '';
  }
  const reader = res.body?.getReader();
  if (!reader) return '';
  const dec = new TextDecoder();
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const t = dec.decode(value, { stream: true });
    full += t;
    onChunk(full);
  }
  return full;
}

export const coach = {
  brief: (ctx: CoachContext, onChunk: (t: string) => void, signal?: AbortSignal) => stream('brief', {}, ctx, onChunk, signal),
  weakpoints: (ctx: CoachContext, onChunk: (t: string) => void, signal?: AbortSignal) => stream('weakpoints', {}, ctx, onChunk, signal),
  chat: (turns: ChatTurn[], ctx: CoachContext, onChunk: (t: string) => void, signal?: AbortSignal) => stream('chat', { turns }, ctx, onChunk, signal),
  cues: (exerciseName: string, muscles: Partial<Record<MuscleId, number>>) => call<string[]>('cues', { exerciseName, muscles }, undefined, { cacheKey: `cues:${exerciseName}`, ttl: Infinity }),
  alternatives: (exerciseName: string, muscles: Partial<Record<MuscleId, number>>, inventory: string[]) =>
    call<CoachAlternative[]>('alternatives', { exerciseName, muscles, inventory }, undefined, { cacheKey: `alt:${exerciseName}`, ttl: Infinity }),
  musclemap: (exerciseName: string) => call<Partial<Record<MuscleId, number>>>('musclemap', { exerciseName }),
  plan: (request: string, ctx: CoachContext, currentPlan: PlanDay[], inventory: { id: string; name: string }[]) =>
    call<{ days: { label: string; weekday?: number; items: { exerciseId: string; workSets: number; dropSets: number }[] }[] }>('plan', { request, currentPlan, inventory }, ctx),
  parselog: (text: string, known: { id: string; name: string }[], today: string, unit: string) => call<ParsedLog>('parselog', { text, known, today, unit }),
};

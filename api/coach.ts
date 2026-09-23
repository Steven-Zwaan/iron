/**
 * Coach proxy (§12.1) — a single Vercel Function. The API key never reaches the client.
 *
 *   POST /api/coach { task, payload, context, stream? }
 *   200 -> { ok: true, data } | text/plain stream for prose tasks when `stream: true`
 *   4xx -> { ok: false, code: 'rate_limited' | 'bad_request' | 'refused' | 'unauthorized', message }
 *
 * Env: ANTHROPIC_API_KEY (required), COACH_SECRET (optional bearer token the app sends),
 *      COACH_MODEL_STRONG (default claude-opus-5), COACH_MODEL_FAST (default claude-haiku-4-5).
 * Set a hard monthly spend cap on the Anthropic console; this function only rate-limits per IP.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

export const config = { maxDuration: 60 };

const STRONG = process.env.COACH_MODEL_STRONG ?? 'claude-opus-5';
const FAST = process.env.COACH_MODEL_FAST ?? 'claude-haiku-4-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const MUSCLES = [
  'traps', 'delts_front', 'delts_side', 'delts_rear', 'chest', 'lats', 'upper_back', 'lower_back',
  'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves',
] as const;

// ---------------------------------------------------------------------------
// Schemas (validated server-side; invalid JSON never reaches the client)
// ---------------------------------------------------------------------------
const Context = z
  .object({
    unit: z.string(),
    today: z.string(),
    nextDay: z.string().nullable(),
    nextExercises: z.array(z.string()),
    overall: z.number(),
    weakest: z.array(z.object({ muscle: z.string(), score: z.number() })),
    owed: z.array(z.string()),
    gymCount: z.number(),
    equipment: z.array(z.string()),
    recent: z.array(z.string()),
  })
  .partial();
type Ctx = z.infer<typeof Context>;

const Body = z.object({
  task: z.enum(['brief', 'weakpoints', 'cues', 'alternatives', 'musclemap', 'plan', 'parselog', 'chat']),
  payload: z.unknown().optional(),
  context: Context.optional(),
  stream: z.boolean().optional(),
});

const CuesOut = z.object({ cues: z.array(z.string().max(90)).min(3).max(3) });
const AlternativesOut = z.object({
  alternatives: z
    .array(z.object({ name: z.string(), why: z.string().max(80), equipment: z.string(), muscles: z.array(z.string()) }))
    .min(1)
    .max(4),
});
const MuscleMapOut = z.object({ muscles: z.array(z.object({ muscle: z.enum(MUSCLES), contribution: z.number().min(0).max(1) })).min(1).max(8) });
const PlanOut = z.object({
  days: z
    .array(
      z.object({
        label: z.string(),
        weekday: z.number().int().min(0).max(6).nullable(),
        items: z.array(z.object({ exerciseId: z.string(), workSets: z.number().int().min(1).max(6), dropSets: z.number().int().min(0).max(4) })).min(1).max(12),
      }),
    )
    .min(1)
    .max(7),
});
const ParseLogOut = z.object({
  date: z.string(),
  entries: z.array(
    z.object({
      ex: z.string(),
      skipped: z.boolean(),
      sets: z.array(z.object({ w: z.number().nullable(), r: z.number().nullable() })),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
function renderContext(c: Ctx | undefined): string {
  if (!c) return '';
  return [
    `Lifter context (${c.unit ?? 'kg'}). Trains to failure. Default 2 work sets per exercise, 1 light warm-up set per new muscle group per day. Rarely counts reps.`,
    `Today: ${c.today ?? ''}. Next session: ${c.nextDay ?? 'nothing planned'}${c.nextExercises?.length ? ` — ${c.nextExercises.join(', ')}` : ''}.`,
    `Weekly body score ${c.overall ?? 0}/100. Weakest: ${(c.weakest ?? []).map((w) => `${w.muscle} ${w.score}`).join(', ')}.`,
    `Owed (skipped last time): ${c.owed?.length ? c.owed.join(', ') : 'none'}.`,
    `Gym has: ${c.gymCount ?? 0} exercises; notable equipment: ${(c.equipment ?? []).join(', ')}.`,
    'Recent sessions:',
    ...(c.recent?.length ? c.recent : ['none yet']),
  ].join('\n');
}

const COACH_SYSTEM =
  'You are a concise strength coach inside a personal training-log app. The lifter trains to failure and does not want rep or RPE prescriptions. ' +
  'Be concrete, plain, and short. No headers, no bullet lists, no markdown. Never invent exercises the gym does not have when a list is given.';

// ---------------------------------------------------------------------------
// Rate limit (best effort, per warm instance)
// ---------------------------------------------------------------------------
const buckets = new Map<string, { n: number; resetAt: number }>();
function limited(ip: string, max = 40, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { n: 1, resetAt: now + windowMs });
    return false;
  }
  b.n++;
  return b.n > max;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function fail(status: number, code: string, message: string): Response {
  return json(status, { ok: false, code, message });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'bad_request', 'POST only.');
  if (!process.env.ANTHROPIC_API_KEY) return fail(500, 'bad_request', 'ANTHROPIC_API_KEY is not configured on the server.');

  const secret = process.env.COACH_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return fail(401, 'unauthorized', 'Missing or wrong coach token.');

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (limited(ip)) return fail(429, 'rate_limited', 'Too many requests. Try again in a few minutes.');

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return fail(400, 'bad_request', 'Malformed request.');
  }
  const { task, payload, context, stream } = parsed;
  const p = (payload ?? {}) as Record<string, unknown>;
  const client = new Anthropic();

  try {
    switch (task) {
      case 'brief':
      case 'weakpoints':
      case 'chat': {
        const instruction =
          task === 'brief'
            ? 'Give a pre-workout brief for the next session in at most 90 words of plain prose: what to focus on, what to push, and anything owed.'
            : task === 'weakpoints'
              ? 'Name the two weakest areas and give one concrete fix for each (an exercise the gym has, or a scheme change). At most 90 words, plain prose.'
              : 'Answer the lifter in at most 110 words of plain prose.';
        const turns = task === 'chat' ? (p.turns as { role: 'user' | 'assistant'; content: string }[] | undefined) ?? [] : [];
        const messages: Anthropic.MessageParam[] = turns.length
          ? turns.slice(-12).map((t) => ({ role: t.role, content: String(t.content).slice(0, 4000) }))
          : [{ role: 'user', content: instruction }];
        if (turns.length) messages.push({ role: 'system', content: instruction } as unknown as Anthropic.MessageParam);
        if (messages[0].role !== 'user') messages.unshift({ role: 'user', content: 'Hello.' });

        const s = client.beta.messages.stream({
          model: STRONG,
          max_tokens: 600,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: `${COACH_SYSTEM}\n\n${renderContext(context)}` }],
          messages,
        } as unknown as Parameters<typeof client.beta.messages.stream>[0]);

        if (stream) {
          const enc = new TextEncoder();
          const readable = new ReadableStream<Uint8Array>({
            async start(controller) {
              try {
                for await (const ev of s) {
                  if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') controller.enqueue(enc.encode(ev.delta.text));
                }
                const final = await s.finalMessage();
                if (final.stop_reason === 'refusal') controller.enqueue(enc.encode('\n\n(The coach declined to answer that.)'));
              } catch (err) {
                controller.enqueue(enc.encode(`\n\n(Coach error: ${err instanceof Error ? err.message : 'unknown'})`));
              } finally {
                controller.close();
              }
            },
          });
          return new Response(readable, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
        }
        const final = await s.finalMessage();
        if (final.stop_reason === 'refusal') return fail(200, 'refused', 'The coach declined to answer that.');
        const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        return json(200, { ok: true, data: { text } });
      }

      case 'cues': {
        const r = await client.messages.parse({
          model: FAST,
          max_tokens: 400,
          system: COACH_SYSTEM,
          messages: [{ role: 'user', content: `Give exactly three technique cues for "${String(p.exerciseName)}" (muscle map: ${JSON.stringify(p.muscles ?? {})}). Each cue at most 12 words, imperative voice.` }],
          output_config: { format: zodOutputFormat(CuesOut) },
        });
        if (!r.parsed_output) return fail(400, 'bad_request', 'The model returned invalid JSON.');
        return json(200, { ok: true, data: r.parsed_output.cues });
      }

      case 'alternatives': {
        const inventory = (p.inventory as string[] | undefined) ?? [];
        const r = await client.messages.parse({
          model: FAST,
          max_tokens: 700,
          system: COACH_SYSTEM,
          messages: [
            {
              role: 'user',
              content: `Suggest up to 4 alternatives to "${String(p.exerciseName)}" (muscle map: ${JSON.stringify(p.muscles ?? {})}) that hit the same muscles. Only choose from this gym inventory, using the exact names: ${inventory.join('; ')}. "why" is at most 9 words.`,
            },
          ],
          output_config: { format: zodOutputFormat(AlternativesOut) },
        });
        if (!r.parsed_output) return fail(400, 'bad_request', 'The model returned invalid JSON.');
        const allowed = new Set(inventory.map((n) => n.toLowerCase()));
        const list = r.parsed_output.alternatives.filter((a) => !inventory.length || allowed.has(a.name.toLowerCase()));
        return json(200, { ok: true, data: list.map((a) => ({ name: a.name, why: a.why })) });
      }

      case 'musclemap': {
        const r = await client.messages.parse({
          model: FAST,
          max_tokens: 400,
          system: COACH_SYSTEM,
          messages: [{ role: 'user', content: `Estimate the muscle contribution map for the exercise "${String(p.exerciseName)}". The primary muscle is 1.0; synergists 0.2–0.6. Use only these muscle ids: ${MUSCLES.join(', ')}.` }],
          output_config: { format: zodOutputFormat(MuscleMapOut) },
        });
        if (!r.parsed_output) return fail(400, 'bad_request', 'The model returned invalid JSON.');
        const map: Record<string, number> = {};
        for (const m of r.parsed_output.muscles) map[m.muscle] = Math.round(m.contribution * 20) / 20;
        const max = Math.max(...Object.values(map));
        if (max > 0 && max < 1) for (const k of Object.keys(map)) map[k] = Math.round((map[k] / max) * 20) / 20;
        return json(200, { ok: true, data: map });
      }

      case 'plan': {
        const inventory = (p.inventory as { id: string; name: string }[] | undefined) ?? [];
        const ids = new Set(inventory.map((i) => i.id));
        const r = await client.beta.messages.parse({
          model: STRONG,
          max_tokens: 4000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: zodOutputFormat(PlanOut) },
          system: [{ type: 'text', text: `${COACH_SYSTEM}\n\n${renderContext(context)}` }],
          messages: [
            {
              role: 'user',
              content:
                `Build or revise a training plan. Request: """${String(p.request ?? '')}"""\n` +
                `Current plan: ${JSON.stringify(p.currentPlan ?? [])}\n` +
                `Use only these exercise ids (id = name): ${inventory.map((i) => `${i.id} = ${i.name}`).join('; ')}.\n` +
                'workSets are sets to failure (default 2). dropSets are dropset-style sets before the work sets (default 0). Warm-ups are automatic; do not add them. weekday 0 = Sunday … 6 = Saturday, or null.',
            },
          ],
        } as unknown as Parameters<typeof client.beta.messages.parse>[0]);
        const out = (r as { parsed_output: z.infer<typeof PlanOut> | null }).parsed_output;
        if (!out) return fail(400, 'bad_request', 'The model returned invalid JSON.');
        const days = out.days.map((d) => ({ ...d, items: d.items.filter((it) => !ids.size || ids.has(it.exerciseId)) })).filter((d) => d.items.length);
        return json(200, { ok: true, data: { days } });
      }

      case 'parselog': {
        const known = (p.known as { id: string; name: string }[] | undefined) ?? [];
        const r = await client.messages.parse({
          model: FAST,
          max_tokens: 2000,
          system: 'You convert informal training notes into structured JSON. Reply with only the requested structure.',
          messages: [
            {
              role: 'user',
              content:
                `Convert this training note into JSON. Known exercise ids: ${known.map((k) => `${k.id}=${k.name}`).join(', ')}.\n` +
                `Note: """${String(p.text ?? '').slice(0, 4000)}"""\n` +
                `Rules: w is weight in ${String(p.unit ?? 'kg')}, null if unknown. r is reps, null if not stated or "to failure". One object per set. ` +
                `A set where the weight dropped mid-way becomes two set objects. Default date ${String(p.today ?? '')} (YYYY-MM-DD). Prefer an existing id when it matches; otherwise use the plain name.`,
            },
          ],
          output_config: { format: zodOutputFormat(ParseLogOut) },
        });
        if (!r.parsed_output) return fail(400, 'bad_request', 'The model returned invalid JSON.');
        return json(200, { ok: true, data: r.parsed_output });
      }
    }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return fail(429, 'rate_limited', 'The coach is busy. Try again shortly.');
    if (err instanceof Anthropic.BadRequestError) return fail(400, 'bad_request', err.message);
    if (err instanceof Anthropic.AuthenticationError) return fail(500, 'bad_request', 'Server API key rejected.');
    if (err instanceof Anthropic.APIError) return fail(502, 'bad_request', `Upstream error ${err.status ?? ''}`.trim());
    return fail(500, 'bad_request', err instanceof Error ? err.message : 'Unknown error');
  }
  return fail(400, 'bad_request', 'Unknown task.');
}

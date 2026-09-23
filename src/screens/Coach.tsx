import { useMemo, useRef, useState } from 'react';
import type { Exercise, Session } from '@/domain/types';
import { findByName } from '@/domain/exercises';
import { createSession } from '@/domain/session';
import { localDateStr, parseLocalDate } from '@/domain/time';
import { newId } from '@/domain/ids';
import { useStore } from '@/app/store';
import { useBodyScore, useDueDay } from '@/app/hooks';
import { navigate } from '@/app/router';
import { toast } from '@/app/ui';
import { CoachError, coach, type ChatTurn, type ParsedLog } from '@/ai/client';
import { buildContext, knownExercisesForParser, looksLikeLog } from '@/ai/prompts';
import { Chip } from '@/ui/Controls';
import { Sheet } from '@/ui/Sheet';
import { CustomExerciseForm } from '@/ui/CustomExerciseForm';
import { IconSend } from '@/ui/Icons';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  error?: boolean;
}

const PROMPTS = [
  { key: 'brief', label: 'What should I train?' },
  { key: 'weak', label: 'Fix my weak points' },
  { key: 'tips', label: 'Tips for today' },
  { key: 'log', label: 'Log what I did' },
] as const;

export function Coach() {
  const enabled = useStore((s) => s.state.settings.aiEnabled);
  const gym = useStore((s) => s.gym);
  const exercises = useStore((s) => s.exercises);
  const sessions = useStore((s) => s.sessions);
  const debt = useStore((s) => s.state.debt);
  const coachCache = useStore((s) => s.state.coachCache);
  const setCoachCache = useStore((s) => s.setCoachCache);
  const settings = useStore((s) => s.state.settings);
  const saveManual = useStore((s) => s.saveManualSession);
  const due = useDueDay();
  const body = useBodyScore(7);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedLog | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ctx = useMemo(() => buildContext({ gym, exercises, body, due, debt, sessions }), [gym, exercises, body, due, debt, sessions]);

  const push = (m: Omit<Msg, 'id'>) => {
    const id = newId('msg');
    setMsgs((x) => [...x, { ...m, id }]);
    return id;
  };
  const patch = (id: string, p: Partial<Msg>) => setMsgs((x) => x.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const runStream = async (userText: string, fn: (onChunk: (t: string) => void, signal: AbortSignal) => Promise<string>) => {
    push({ role: 'user', text: userText });
    const id = push({ role: 'assistant', text: '', streaming: true });
    setBusy(true);
    abort.current = new AbortController();
    try {
      await fn((t) => patch(id, { text: t }), abort.current.signal);
      patch(id, { streaming: false });
    } catch (e) {
      patch(id, { streaming: false, error: true, text: e instanceof CoachError ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const tipsForToday = async () => {
    const items = due?.items.slice(0, 8) ?? [];
    if (!items.length) return toast('Nothing planned for today to give tips on.');
    push({ role: 'user', text: 'Tips for today' });
    const id = push({ role: 'assistant', text: 'Fetching cues…', streaming: true });
    setBusy(true);
    try {
      const lines: string[] = [];
      for (const it of items) {
        const ex = exercises[it.exerciseId];
        if (!ex) continue;
        let cues = coachCache[ex.id]?.cues;
        if (!cues?.length) {
          cues = await coach.cues(ex.name, ex.muscles);
          setCoachCache(ex.id, { cues });
        }
        lines.push(`${ex.name}: ${cues.join(' · ')}`);
        patch(id, { text: lines.join('\n') });
      }
      patch(id, { streaming: false, text: lines.join('\n') || 'No cues available.' });
    } catch (e) {
      patch(id, { streaming: false, error: true, text: e instanceof Error ? e.message : 'Could not fetch cues.' });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    if (looksLikeLog(text)) {
      push({ role: 'user', text });
      setBusy(true);
      try {
        const r = await coach.parselog(text, knownExercisesForParser(exercises), localDateStr(Date.now()), gym.unit);
        setParsed(r);
      } catch (e) {
        push({ role: 'assistant', text: e instanceof Error ? e.message : 'Could not parse that.', error: true });
      } finally {
        setBusy(false);
      }
      return;
    }
    const turns: ChatTurn[] = [...msgs.filter((m) => !m.error && !m.streaming).map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: text }];
    await runStream(text, (onChunk, signal) => coach.chat(turns, ctx, onChunk, signal));
  };

  const onPrompt = (key: (typeof PROMPTS)[number]['key']) => {
    if (busy) return;
    if (key === 'brief') void runStream('What should I train?', (c, s) => coach.brief(ctx, c, s));
    else if (key === 'weak') void runStream('Fix my weak points', (c, s) => coach.weakpoints(ctx, c, s));
    else if (key === 'tips') void tipsForToday();
    else {
      setInput('Did inclined chest press 60kg 2 sets, lat pulldown 55 x 10, skipped calves');
      inputRef.current?.focus();
    }
  };

  const resolve = (name: string): Exercise | undefined => exercises[name] ?? findByName(Object.values(exercises), name);

  const saveParsed = () => {
    if (!parsed) return;
    const entries = parsed.entries.filter((e) => e.sets.length || e.skipped);
    const ids: string[] = [];
    for (const e of entries) {
      const ex = resolve(e.ex);
      if (!ex) return toast(`"${e.ex}" is not an exercise yet. Add it first.`);
      if (!ids.includes(ex.id)) ids.push(ex.id);
    }
    if (!ids.length) return toast('Nothing to save.');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : localDateStr(Date.now());
    const startedAt = Math.min(Date.now() - 3_600_000, parseLocalDate(date) + 18 * 3_600_000);
    const base = createSession({ queue: ids, day: null, exercises, settings, now: startedAt });
    const logs = { ...base.logs };
    for (const e of entries) {
      const ex = resolve(e.ex)!;
      const sets = e.sets.map((s) => ({ id: newId('set'), type: 'work' as const, done: true, at: startedAt, segments: [{ weight: s.w, reps: s.r }] }));
      logs[ex.id] = { ...logs[ex.id], sets: sets.length ? sets : logs[ex.id].sets.map((s) => ({ ...s, done: false })), skipped: e.skipped && !sets.length };
    }
    const session: Session = { ...base, logs, date, label: 'Logged by hand', endedAt: startedAt + 3_600_000 };
    saveManual(session);
    setParsed(null);
    push({ role: 'assistant', text: `Saved ${ids.length} exercises to ${date}.` });
  };

  if (!enabled) {
    return (
      <div className="screen">
        <h1 className="text-[30px] font-bold leading-none mb-3">Coach</h1>
        <section className="card">
          <div className="font-semibold mb-1">The coach is switched off</div>
          <p className="text-dim text-[13.5px] leading-relaxed mb-3">
            When it is on and you have signal, it can brief you before a workout, point at weak spots, suggest alternatives and cues for your exercises, build a plan from a description, and turn a
            sentence like &ldquo;did chest press 60 kg 2 sets, skipped calves&rdquo; into a logged session. Everything else in Iron works without it, offline.
          </p>
          <button className="btn btn-primary" onClick={() => navigate({ name: 'settings' })}>
            Turn on in Settings
          </button>
        </section>
        <section className="card">
          <div className="eyebrow mb-2">Works without the coach</div>
          <ul className="text-[13.5px] text-dim leading-relaxed list-disc pl-5">
            <li>Swap suggestions ranked by muscle similarity</li>
            <li>Warm-ups, skip debt, scoring and the body map</li>
            <li>Plans, templates, and the session builder</li>
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="screen flex flex-col">
      <h1 className="text-[30px] font-bold leading-none mb-3">Coach</h1>
      <div className="flex flex-wrap gap-2 mb-3">
        {PROMPTS.map((p) => (
          <Chip key={p.key} onClick={() => onPrompt(p.key)} disabled={busy}>
            {p.label}
          </Chip>
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-2 mb-3">
        {msgs.length === 0 && <div className="text-dim text-[13.5px]">Ask anything about your training, or type what you did and it becomes a session after you confirm it.</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[92%] rounded-[16px] px-3.5 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'self-end bg-text text-bg' : `self-start bg-surf border border-line ${m.error ? 'text-danger' : ''}`}`}>
            {m.text || (m.streaming ? '…' : '')}
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 sticky bottom-0 pb-1 bg-bg">
        <textarea
          ref={inputRef}
          className="input flex-1 !min-h-[44px] !py-2.5 max-h-32"
          rows={1}
          placeholder="Ask, or type what you did…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn btn-accent !min-h-[44px] !px-3" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send">
          <IconSend size={20} />
        </button>
      </div>

      <Sheet open={!!parsed} onClose={() => setParsed(null)} title="Confirm what to log" full>
        {parsed && (
          <div className="pb-2">
            <div className="field mb-3">
              <label htmlFor="parsed-date">Date</label>
              <input id="parsed-date" type="date" className="input" value={parsed.date} onChange={(e) => setParsed({ ...parsed, date: e.target.value })} />
            </div>
            {parsed.entries.map((e, i) => {
              const ex = resolve(e.ex);
              return (
                <div key={i} className="card !p-3 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold flex-1">{ex ? ex.name : e.ex}</span>
                    {!ex && (
                      <button className="btn btn-sm" onClick={() => setNewName(e.ex)}>
                        Add as new exercise
                      </button>
                    )}
                    {e.skipped && <span className="pill warn">skipped</span>}
                    <button
                      className="btn-icon !w-9 !h-9 !min-h-0"
                      onClick={() => setParsed({ ...parsed, entries: parsed.entries.filter((_, k) => k !== i) })}
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                  {e.sets.map((s, k) => (
                    <div key={k} className="flex items-center gap-2 mt-1 text-[13.5px]">
                      <span className="text-dim w-10 num">Set {k + 1}</span>
                      <input
                        type="number"
                        className="input !min-h-[36px] w-24 num"
                        value={s.w ?? ''}
                        placeholder={gym.unit}
                        onChange={(ev) => {
                          const v = ev.target.value === '' ? null : Number(ev.target.value);
                          const sets = e.sets.map((x, j) => (j === k ? { ...x, w: v } : x));
                          setParsed({ ...parsed, entries: parsed.entries.map((x, j) => (j === i ? { ...x, sets } : x)) });
                        }}
                        aria-label="Weight"
                      />
                      <span className="text-dim">×</span>
                      <input
                        type="number"
                        className="input !min-h-[36px] w-20 num"
                        value={s.r ?? ''}
                        placeholder="reps"
                        onChange={(ev) => {
                          const v = ev.target.value === '' ? null : Number(ev.target.value);
                          const sets = e.sets.map((x, j) => (j === k ? { ...x, r: v } : x));
                          setParsed({ ...parsed, entries: parsed.entries.map((x, j) => (j === i ? { ...x, sets } : x)) });
                        }}
                        aria-label="Reps"
                      />
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="flex gap-2 mt-3">
              <button className="btn flex-1" onClick={() => setParsed(null)}>
                Discard
              </button>
              <button className="btn btn-primary flex-1 !min-h-[48px]" onClick={saveParsed}>
                Save session
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <CustomExerciseForm
        open={!!newName}
        initialName={newName ?? ''}
        onClose={() => setNewName(null)}
        onSaved={(ex) => {
          if (parsed && newName) setParsed({ ...parsed, entries: parsed.entries.map((e) => (e.ex === newName ? { ...e, ex: ex.id } : e)) });
        }}
      />
    </div>
  );
}

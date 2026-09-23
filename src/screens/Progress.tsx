import { useMemo, useState } from 'react';
import type { MuscleId, Session } from '@/domain/types';
import { MUSCLE_IDS, muscleName } from '@/domain/muscles';
import { tier } from '@/domain/scoring';
import { doneSetCount, liftHistory } from '@/domain/session';
import { formatWeight } from '@/domain/weights';
import { shortDate, plural } from '@/domain/format';
import { startOfWeek, localDateStr, parseLocalDate, DAY_MS } from '@/domain/time';
import { useStore } from '@/app/store';
import { useBodyScore, useNow } from '@/app/hooks';
import { MuscleDetailSheet } from '@/ui/BodyMap';
import { BodyMapSlider } from '@/ui/BodyMapSlider';
import { Chip, Eyebrow, TierDot, TierLegend } from '@/ui/Controls';
import { Bar, MiniColumns, Sparkline } from '@/ui/Sparkline';
import { SessionDetailSheet } from '@/ui/SessionDetail';
import { navigate } from '@/app/router';

const RANGES = [7, 30, 90] as const;

export function Progress() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const body = useBodyScore(range);
  const sessions = useStore((s) => s.sessions);
  const exercises = useStore((s) => s.exercises);
  const perf = useStore((s) => s.state.lastPerformance);
  const unit = useStore((s) => s.gym.unit);
  const now = useNow(60_000);
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [detail, setDetail] = useState<Session | null>(null);
  const [showAllLifts, setShowAllLifts] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const weakest = useMemo(() => [...MUSCLE_IDS].sort((a, b) => body.muscles[a].score - body.muscles[b].score || body.muscles[a].effectiveSets - body.muscles[b].effectiveSets), [body]);

  const lifts = useMemo(() => {
    const ids = Object.keys(perf).filter((id) => exercises[id]);
    return ids
      .map((id) => {
        const hist = liftHistory(sessions, id, 10);
        const p = perf[id];
        const first = hist[0]?.weight ?? null;
        return { id, hist, now: p.weight, best: p.best, delta: p.weight != null && first != null && hist.length > 1 ? p.weight - first : null, at: p.at };
      })
      .sort((a, b) => b.at - a.at);
  }, [perf, sessions, exercises]);

  const history = useMemo(() => [...sessions].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)), [sessions]);

  const weeks = useMemo(() => {
    const thisWeek = startOfWeek(now);
    const counts: number[] = [];
    const labels: string[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = thisWeek - w * 7 * DAY_MS;
      const end = start + 7 * DAY_MS;
      counts.push(sessions.filter((s) => s.endedAt && parseLocalDate(s.date) >= start && parseLocalDate(s.date) < end).length);
      labels.push(w === 0 ? 'now' : shortDate(localDateStr(start), now).split(' ')[0]);
    }
    return { counts, labels };
  }, [sessions, now]);

  return (
    <div className="screen">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-[30px] font-bold leading-none">Progress</h1>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Range">
          {RANGES.map((r) => (
            <Chip key={r} on={range === r} onClick={() => setRange(r)}>
              {r}d
            </Chip>
          ))}
        </div>
      </div>

      {/* Body score and map sit on the page background; front and back are two slides. */}
      <section className="mb-5">
        <Eyebrow>Body score · last {range} days</Eyebrow>
        <div className="flex items-baseline gap-1">
          <span className="black num score-big tier-text" data-tier={tier(body.overall)}>
            {body.overall}
          </span>
          <span className="text-dim num font-semibold">/ 100</span>
        </div>
        <BodyMapSlider score={body} onSelect={setMuscle} />
        <div className="mt-3">
          <TierLegend />
        </div>
      </section>

      <section className="card">
        <Eyebrow>Weakest first</Eyebrow>
        <div className="flex flex-col gap-1">
          {weakest.map((m) => {
            const s = body.muscles[m];
            return (
              <button key={m} className="hbar text-left" onClick={() => setMuscle(m)} aria-label={`${muscleName(m)}, score ${s.score}`}>
                <span className="truncate flex items-center gap-2">
                  <TierDot tier={s.tier} />
                  {muscleName(m)}
                </span>
                <Bar value={s.score} tier={s.tier} />
                <span className="num text-right text-dim">{s.score}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <Eyebrow right={<span className="text-dim text-[12px]">top set, last 10 sessions</span>}>Lifts</Eyebrow>
        {lifts.length === 0 && <div className="text-dim text-[13.5px]">Log a weight and the trend shows up here.</div>}
        {(showAllLifts ? lifts : lifts.slice(0, 6)).map((l) => {
          const ex = exercises[l.id];
          return (
            <button key={l.id} className="list-btn !py-2" onClick={() => navigate({ name: 'exercise', id: l.id })}>
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{ex.name}</span>
                <span className="ghost num block">
                  now {formatWeight(l.now, ex, unit)} · best {formatWeight(l.best, ex, unit)}
                  {l.delta != null && (
                    <span className={l.delta > 0 ? ' text-t1' : l.delta < 0 ? ' text-danger' : ''}>
                      {' '}· {l.delta > 0 ? '+' : ''}
                      {l.delta}
                    </span>
                  )}
                </span>
              </span>
              <span className="w-[96px] flex-none">
                <Sparkline values={l.hist.map((p) => p.weight ?? 0)} />
              </span>
            </button>
          );
        })}
        {lifts.length > 6 && (
          <button className="link mt-2" onClick={() => setShowAllLifts((v) => !v)}>
            {showAllLifts ? 'Show fewer' : `Show all ${lifts.length}`}
          </button>
        )}
      </section>

      <section className="card">
        <Eyebrow right={<span className="text-dim text-[12px]">sessions per week</span>}>Consistency</Eyebrow>
        <MiniColumns values={weeks.counts} labels={weeks.labels} />
      </section>

      <section className="card">
        <Eyebrow right={<span className="text-dim text-[12px] num">{plural(sessions.length, 'session')}</span>}>History</Eyebrow>
        {history.length === 0 && <div className="text-dim text-[13.5px]">No sessions yet.</div>}
        {(showAllHistory ? history : history.slice(0, 8)).map((s) => (
          <button key={s.id} className="list-btn" onClick={() => setDetail(s)}>
            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium">{s.label}</span>
              <span className="text-dim"> · {shortDate(s.date, now)}</span>
            </span>
            <span className="text-dim text-[13px] num flex-none">
              {doneSetCount(s)} sets · {s.queue.length} ex
            </span>
          </button>
        ))}
        {history.length > 8 && (
          <button className="link mt-2" onClick={() => setShowAllHistory((v) => !v)}>
            {showAllHistory ? 'Show fewer' : `Show all ${history.length}`}
          </button>
        )}
      </section>

      <MuscleDetailSheet muscle={muscle} score={body} onClose={() => setMuscle(null)} />
      <SessionDetailSheet session={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

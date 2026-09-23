import { useMemo, useState } from 'react';
import type { MuscleId, Session } from '@/domain/types';
import { longDate, elapsedLabel, joinNames, plural, shortDate } from '@/domain/format';
import { owedIds } from '@/domain/debt';
import { schemeOf, schemeShort, warmupFlags } from '@/domain/warmups';
import { doneSetCount } from '@/domain/session';
import { tier } from '@/domain/scoring';
import { useStore } from '@/app/store';
import { useBodyScore, useDueDay, useNow } from '@/app/hooks';
import { navigate } from '@/app/router';
import { BodyMap, MuscleDetailSheet } from '@/ui/BodyMap';
import { Eyebrow, TierLegend } from '@/ui/Controls';
import { IconSettings, IconWarn } from '@/ui/Icons';
import { SessionDetailSheet } from '@/ui/SessionDetail';

export function Today() {
  const now = useNow(30_000);
  const plan = useStore((s) => s.plan);
  const sessions = useStore((s) => s.sessions);
  const active = useStore((s) => s.active);
  const exercises = useStore((s) => s.exercises);
  const debt = useStore((s) => s.state.debt);
  const body = useBodyScore(7);
  const due = useDueDay();
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [detail, setDetail] = useState<Session | null>(null);

  const owed = useMemo(() => owedIds(debt), [debt]);
  const owedNames = owed.map((id) => exercises[id]?.name ?? id);
  const dueFlags = useMemo(() => (due ? warmupFlags(due.items.map((i) => i.exerciseId), exercises) : []), [due, exercises]);
  const recent = useMemo(() => [...sessions].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)).slice(0, 3), [sessions]);
  const otherDays = plan.days.filter((d) => d.id !== due?.id);
  const owedInDue = due ? owed.filter((id) => due.items.some((i) => i.exerciseId === id)) : [];

  return (
    <div className="screen">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="eyebrow">{longDate(now)}</div>
          <h1 className="text-[30px] font-bold leading-none mt-1">Today</h1>
        </div>
        <button className="btn-icon -mr-2" onClick={() => navigate({ name: 'settings' })} aria-label="Settings">
          <IconSettings />
        </button>
      </div>

      <section className="card">
        <Eyebrow
          right={
            <button className="link" onClick={() => navigate({ name: 'progress' })}>
              Details
            </button>
          }
        >
          This week
        </Eyebrow>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="black num score-big tier-text" data-tier={tier(body.overall)}>
            {body.overall}
          </span>
          <span className="text-dim num text-[15px] font-semibold">/ 100</span>
        </div>
        <BodyMap score={body} onSelect={setMuscle} style={{ maxHeight: 300 }} />
        <div className="mt-2">
          <TierLegend />
        </div>
      </section>

      <section className="card">
        <Eyebrow
          right={
            owed.length > 0 ? (
              <button className="pill warn" onClick={() => navigate({ name: 'owed' })}>
                <IconWarn size={12} /> {owed.length} owed
              </button>
            ) : undefined
          }
        >
          {active ? 'In progress' : 'Up next'}
        </Eyebrow>
        {active ? (
          <>
            <div className="text-[19px] font-bold">{active.label}</div>
            <div className="text-dim text-[13.5px] mb-3">
              Started {elapsedLabel(now - active.startedAt)} ago · {doneSetCount(active)} sets logged
            </div>
            <button className="btn btn-primary" onClick={() => navigate({ name: 'runner' })}>
              Resume workout
            </button>
          </>
        ) : due ? (
          <>
            <div className="text-[19px] font-bold mb-2">{due.label}</div>
            <ol className="mb-3">
              {due.items.map((it, i) => (
                <li key={`${it.exerciseId}-${i}`} className="flex items-center gap-3 min-h-[32px] text-[14px]">
                  <span className="num text-dim w-5 text-right">{i + 1}</span>
                  <span className="flex-1 truncate">{exercises[it.exerciseId]?.name ?? it.exerciseId}</span>
                  <span className="text-dim text-[12.5px] num">{schemeShort(schemeOf(it), dueFlags[i])}</span>
                </li>
              ))}
              {due.items.length === 0 && <li className="text-dim text-[13.5px]">This day has no exercises yet.</li>}
            </ol>
            <button className="btn btn-primary" onClick={() => navigate({ name: 'builder', dayId: due.id })}>
              Start
            </button>
            <div className="flex flex-wrap gap-2 mt-3">
              {otherDays.map((d) => (
                <button key={d.id} className="chip" onClick={() => navigate({ name: 'builder', dayId: d.id })}>
                  Do {d.label}
                </button>
              ))}
              <button className="chip" onClick={() => navigate({ name: 'builder', freestyle: true })}>
                Freestyle
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-dim text-[13.5px] mb-3">No plan yet. Build one, or just pick exercises and go.</div>
            <button className="btn btn-primary" onClick={() => navigate({ name: 'builder', freestyle: true })}>
              Start empty session
            </button>
            <button className="btn w-full mt-2" onClick={() => navigate({ name: 'plan' })}>
              Build a plan
            </button>
          </>
        )}
      </section>

      {owed.length > 0 && !active && (
        <section className="card">
          <Eyebrow>Carried over</Eyebrow>
          <p className="text-[14px] leading-relaxed">
            You skipped {joinNames(owedNames)} last time.{' '}
            {owedInDue.length === owed.length ? "It's already in tonight's queue." : 'It will be added to your next session automatically.'}
          </p>
        </section>
      )}

      <section className="card">
        <Eyebrow right={<span className="text-dim text-[12px] num">{plural(sessions.length, 'session')}</span>}>Recent</Eyebrow>
        {recent.length === 0 && <div className="text-dim text-[13.5px]">Nothing logged yet. Your first session shows up here.</div>}
        {recent.map((s) => (
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
      </section>

      <MuscleDetailSheet muscle={muscle} score={body} onClose={() => setMuscle(null)} />
      <SessionDetailSheet session={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

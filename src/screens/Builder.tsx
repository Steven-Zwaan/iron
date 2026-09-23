import { useEffect, useMemo, useState } from 'react';
import type { PlanDay } from '@/domain/types';
import { owedIds } from '@/domain/debt';
import { estimateDurationMin } from '@/domain/session';
import { schemeLabel, schemeOf, warmupFlags } from '@/domain/warmups';
import { durationLabel, plural } from '@/domain/format';
import { useStore } from '@/app/store';
import { useBodyScore } from '@/app/hooks';
import { back, navigate } from '@/app/router';
import { ExercisePicker } from '@/ui/ExercisePicker';
import { SessionQueue } from '@/ui/SessionQueue';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { ExerciseSheet } from '@/ui/ExerciseDetail';
import { CustomExerciseForm } from '@/ui/CustomExerciseForm';
import { IconBack, IconChevronDown, IconChevronUp } from '@/ui/Icons';

function initialQueue(day: PlanDay | null, owed: string[]): string[] {
  const q = day ? day.items.map((i) => i.exerciseId) : [];
  for (const id of owed) if (!q.includes(id)) q.push(id);
  return q;
}

/** Session builder (§4.4): pick and order today's exercises from muscle-group lists. */
export function Builder({ dayId, freestyle }: { dayId?: string; freestyle?: boolean }) {
  const plan = useStore((s) => s.plan);
  const exercises = useStore((s) => s.exercises);
  const gym = useStore((s) => s.gym);
  const debt = useStore((s) => s.state.debt);
  const lastPerformance = useStore((s) => s.state.lastPerformance);
  const settings = useStore((s) => s.state.settings);
  const active = useStore((s) => s.active);
  const startSession = useStore((s) => s.startSession);
  const discardSession = useStore((s) => s.discardSession);
  const body = useBodyScore(7);

  const owed = useMemo(() => owedIds(debt).filter((id) => exercises[id]), [debt, exercises]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(freestyle ? null : dayId ?? plan.days[0]?.id ?? null);
  const day = plan.days.find((d) => d.id === selectedDayId) ?? null;
  const [queue, setQueue] = useState<string[]>(() => initialQueue(day, owed));
  const [drawer, setDrawer] = useState<'min' | 'half' | 'full'>('half');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [activeSheet, setActiveSheet] = useState(false);

  // Switching day re-seeds the queue.
  useEffect(() => {
    setQueue(initialQueue(day, owed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId]);

  const planOrder = useMemo(() => initialQueue(day, owed), [day, owed]);
  const diverged = day ? planOrder.join('|') !== queue.join('|') : false;
  const selected = useMemo(() => new Set(queue), [queue]);
  const minutes = useMemo(() => estimateDurationMin(queue, exercises, day, settings), [queue, exercises, day, settings]);
  const flags = useMemo(() => warmupFlags(queue, exercises), [queue, exercises]);

  const toggle = (id: string) => {
    if (selected.has(id)) {
      if ((debt[id] ?? 0) > 0) return setConfirmRemove(id);
      setQueue((q) => q.filter((x) => x !== id));
    } else setQueue((q) => [...q, id]);
  };
  const remove = (id: string) => {
    if ((debt[id] ?? 0) > 0) return setConfirmRemove(id);
    setQueue((q) => q.filter((x) => x !== id));
  };
  const start = () => {
    if (!queue.length) return;
    if (active) return setActiveSheet(true);
    startSession(queue, day);
    navigate({ name: 'runner' }, { replace: true });
  };

  const drawerHeight = drawer === 'min' ? 56 : drawer === 'half' ? 240 : 'calc(100% - 120px)';

  return (
    <div className="app-modal h-full flex flex-col" style={{ paddingTop: 'var(--sat)' }}>
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 flex-none">
        <button className="btn-icon" onClick={() => back()} aria-label="Back">
          <IconBack />
        </button>
        <div className="text-[19px] font-bold flex-1">Build session</div>
        <select className="input select !w-auto !min-h-[40px] !py-0 text-[14px] font-semibold" value={selectedDayId ?? ''} onChange={(e) => setSelectedDayId(e.target.value || null)} aria-label="Plan day">
          {plan.days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
          <option value="">Freestyle</option>
        </select>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
        {diverged && (
          <div className="flex items-center justify-between text-[13px] text-dim mb-1">
            <span>Queue differs from the plan.</span>
            <button className="link" onClick={() => setQueue(planOrder)}>
              Reset to plan order
            </button>
          </div>
        )}
        <ExercisePicker
          selected={selected}
          onToggle={toggle}
          body={body}
          debt={debt}
          dayItems={day?.items.map((i) => i.exerciseId) ?? []}
          lastPerformance={lastPerformance}
          onCreateCustom={() => setCustom(true)}
          onInfo={setInfo}
          initiallyOpen={[]}
        />
      </div>

      <div className="queue-drawer" style={{ height: drawerHeight }}>
        <button
          className="flex items-center gap-2 px-4 min-h-[56px] w-full text-left flex-none"
          onClick={() => setDrawer((d) => (d === 'min' ? 'half' : d === 'half' ? 'full' : 'min'))}
          aria-expanded={drawer !== 'min'}
        >
          <span className="eyebrow !text-text">Queue</span>
          <span className="text-dim text-[13px] num">
            · {plural(queue.length, 'exercise')} · ~{durationLabel(minutes)}
          </span>
          <span className="ml-auto text-dim">{drawer === 'full' ? <IconChevronDown /> : <IconChevronUp />}</span>
        </button>
        {drawer !== 'min' && (
          <div className="queue-list">
            {queue.length === 0 && <div className="text-dim text-[13.5px] px-3 py-2">Tap exercises above to add them. You can also start empty and add as you go.</div>}
            <SessionQueue
              ids={queue}
              onReorder={setQueue}
              onRemove={remove}
              nameOf={(id) => exercises[id]?.name ?? id}
              meta={(id) => {
                const i = queue.indexOf(id);
                const item = day?.items.find((it) => it.exerciseId === id);
                return schemeLabel(schemeOf(item), flags[i] ?? false);
              }}
              debt={debt}
            />
          </div>
        )}
      </div>

      <div className="px-4 pt-2 flex-none bg-surf" style={{ paddingBottom: 'calc(12px + var(--sab))' }}>
        <button className="btn btn-primary" onClick={start} disabled={!queue.length}>
          Start workout
        </button>
      </div>

      <ConfirmSheet
        open={!!confirmRemove}
        title="You already skipped this last time"
        body={`${confirmRemove ? exercises[confirmRemove]?.name : ''} is owed. Removing it from the queue keeps the debt until you do it.`}
        confirmLabel="Remove anyway"
        cancelLabel="Keep it"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) setQueue((q) => q.filter((x) => x !== confirmRemove));
          setConfirmRemove(null);
        }}
      />
      <Sheet open={activeSheet} onClose={() => setActiveSheet(false)} title="A workout is already in progress">
        <div className="text-dim text-[13.5px] mb-4">Resume it, or discard it and start this one instead.</div>
        <div className="flex flex-col gap-2">
          <button className="btn btn-primary" onClick={() => navigate({ name: 'runner' }, { replace: true })}>
            Resume workout
          </button>
          <button
            className="btn btn-danger w-full"
            onClick={() => {
              discardSession();
              setActiveSheet(false);
              startSession(queue, day);
              navigate({ name: 'runner' }, { replace: true });
            }}
          >
            Discard it and start this one
          </button>
        </div>
      </Sheet>
      <ExerciseSheet id={info} onClose={() => setInfo(null)} />
      <CustomExerciseForm open={custom} onClose={() => setCustom(false)} onSaved={(ex) => setQueue((q) => (q.includes(ex.id) ? q : [...q, ex.id]))} />
      <span className="sr-only">{gym.name}</span>
    </div>
  );
}

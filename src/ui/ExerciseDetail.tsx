import { useMemo, useState } from 'react';
import type { Exercise, MeasureMode, MuscleId } from '@/domain/types';
import { muscleName } from '@/domain/muscles';
import { EQUIPMENT_NAME, MEASURE_NAME, musclesSorted } from '@/domain/exercises';
import { rankAlternatives } from '@/domain/alternatives';
import { liftHistory } from '@/domain/session';
import { formatWeight } from '@/domain/weights';
import { useStore } from '@/app/store';
import { toast } from '@/app/ui';
import { aiEnabled, coach } from '@/ai/client';
import { Sheet, ConfirmSheet } from './Sheet';
import { Segmented, Stepper, Switch } from './Controls';
import { Bar, Sparkline } from './Sparkline';
import { CustomExerciseForm } from './CustomExerciseForm';

export function ExerciseDetail({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const ex = useStore((s) => s.exercises[id]);
  const exercises = useStore((s) => s.exercises);
  const gym = useStore((s) => s.gym);
  const sessions = useStore((s) => s.sessions);
  const perf = useStore((s) => s.state.lastPerformance[id]);
  const cache = useStore((s) => s.state.coachCache[id]);
  const setAvailable = useStore((s) => s.setAvailable);
  const upsert = useStore((s) => s.upsertExercise);
  const del = useStore((s) => s.deleteExercise);
  const setCoachCache = useStore((s) => s.setCoachCache);
  const [edit, setEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState<'cues' | 'alts' | null>(null);

  const inGym = gym.available.includes(id);
  const history = useMemo(() => liftHistory(sessions, id, 10), [sessions, id]);
  const similar = useMemo(() => (ex ? rankAlternatives(ex, gym, exercises).slice(0, 4) : []), [ex, gym, exercises]);

  if (!ex) return <div className="text-dim">This exercise no longer exists.</div>;

  const patch = (p: Partial<Exercise>) => upsert({ ...ex, ...p });
  const fetchCues = async () => {
    setBusy('cues');
    try {
      const cues = await coach.cues(ex.name, ex.muscles);
      setCoachCache(id, { cues });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not fetch cues.');
    } finally {
      setBusy(null);
    }
  };
  const fetchAlts = async () => {
    setBusy('alts');
    try {
      const names = gym.available.map((x) => exercises[x]?.name).filter(Boolean) as string[];
      const alternatives = await coach.alternatives(ex.name, ex.muscles, names);
      const withIds = alternatives.map((a) => ({ ...a, exerciseId: Object.values(exercises).find((e) => e.name.toLowerCase() === a.name.toLowerCase())?.id }));
      setCoachCache(id, { alternatives: withIds });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not fetch alternatives.');
    } finally {
      setBusy(null);
    }
  };

  const delta = perf?.weight != null && history.length > 1 && history[0].weight != null ? perf.weight - history[0].weight : null;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div>
        <div className="text-dim text-[13.5px]">
          {EQUIPMENT_NAME[ex.equipment]} · {MEASURE_NAME[ex.measure]}
          {ex.unilateral ? ' · one side at a time' : ''}
          {ex.custom ? ' · custom' : ''}
        </div>
        <div className="row mt-1">
          <div className="flex-1">
            <div className="font-medium">In your gym</div>
            <div className="text-dim text-[13px]">Only exercises in your gym appear in pickers.</div>
          </div>
          <Switch checked={inGym} onChange={(v) => setAvailable([id], v)} label="In your gym" />
        </div>
      </div>

      <section>
        <div className="eyebrow mb-2">Muscles</div>
        {musclesSorted(ex).map(([m, v]) => (
          <div key={m} className="hbar">
            <span className="truncate">{muscleName(m as MuscleId)}</span>
            <Bar value={v * 100} />
            <span className="num text-dim text-right text-[13px]">{Math.round(v * 100)}%</span>
          </div>
        ))}
      </section>

      {(history.length > 0 || perf) && (
        <section>
          <div className="eyebrow mb-2">Lift</div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Sparkline values={history.map((p) => p.weight ?? 0)} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="eyebrow">now</div>
                <div className="num font-semibold">{formatWeight(perf?.weight, ex, gym.unit)}</div>
              </div>
              <div>
                <div className="eyebrow">best</div>
                <div className="num font-semibold">{formatWeight(perf?.best, ex, gym.unit)}</div>
              </div>
              <div>
                <div className="eyebrow">delta</div>
                <div className={`num font-semibold ${delta == null ? '' : delta > 0 ? 'text-t1' : delta < 0 ? 'text-danger' : ''}`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="eyebrow">Settings for this exercise</div>
        <div>
          <div className="label mb-1.5">Measured as</div>
          <Segmented<MeasureMode>
            value={ex.measure}
            onChange={(measure) => patch({ measure })}
            options={[
              { value: 'weight', label: 'Weight' },
              { value: 'stack_level', label: 'Stack level' },
              { value: 'bodyweight', label: 'Bodyweight' },
              { value: 'assisted', label: 'Assisted' },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="label">Drop step</span>
          <Stepper value={ex.dropStepPct ?? 20} min={5} max={50} step={5} onChange={(v) => patch({ dropStepPct: v })} format={(v) => `${v}%`} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="label">Default rest</span>
          <Stepper value={ex.defaultRestSec} min={15} max={300} step={5} onChange={(v) => patch({ defaultRestSec: v })} format={(v) => `${v} s`} />
        </div>
      </section>

      <section>
        <div className="eyebrow mb-2">Cues</div>
        {cache?.cues?.length ? (
          <ul className="list-disc pl-5 text-[14px] leading-relaxed">
            {cache.cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        ) : aiEnabled() ? (
          <button type="button" className="btn btn-sm" onClick={fetchCues} disabled={busy === 'cues'}>
            {busy === 'cues' ? 'Fetching…' : 'Get cues from the coach'}
          </button>
        ) : (
          <div className="text-dim text-[13.5px]">Turn on the coach in Settings to fetch technique cues once and keep them offline.</div>
        )}
      </section>

      <section>
        <div className="eyebrow mb-2">Alternatives in your gym</div>
        {cache?.alternatives?.length ? (
          <div className="mb-2">
            {cache.alternatives.map((a, i) => (
              <div key={i} className="row !min-h-[40px] !py-1.5">
                <span className="flex-1">{a.name}</span>
                <span className="text-dim text-[13px]">{a.why}</span>
              </div>
            ))}
          </div>
        ) : null}
        {similar.map((a) => (
          <div key={a.exercise.id} className="row !min-h-[40px] !py-1.5">
            <span className="flex-1">{a.exercise.name}</span>
            <span className="text-dim text-[13px] num">{Math.round(a.similarity * 100)}% match</span>
          </div>
        ))}
        {aiEnabled() && !cache?.alternatives?.length && (
          <button type="button" className="btn btn-sm mt-2" onClick={fetchAlts} disabled={busy === 'alts'}>
            {busy === 'alts' ? 'Fetching…' : 'Ask the coach for alternatives'}
          </button>
        )}
      </section>

      {ex.custom && (
        <section className="flex gap-2">
          <button type="button" className="btn flex-1" onClick={() => setEdit(true)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger flex-1" onClick={() => setConfirmDel(true)}>
            Delete
          </button>
        </section>
      )}

      <CustomExerciseForm open={edit} onClose={() => setEdit(false)} initial={ex} />
      <ConfirmSheet
        open={confirmDel}
        title={`Delete ${ex.name}?`}
        body="It is removed from your gym and plan. Logged sessions keep their history."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => {
          setConfirmDel(false);
          del(id);
          onDeleted?.();
        }}
      />
    </div>
  );
}

export function ExerciseSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const name = useStore((s) => (id ? s.exercises[id]?.name : ''));
  return (
    <Sheet open={!!id} onClose={onClose} title={name} full>
      {id && <ExerciseDetail id={id} onDeleted={onClose} />}
    </Sheet>
  );
}

import type { Exercise, ExerciseLog, LastPerformance, Segment, SetLog, Unit } from '@/domain/types';
import { fmtNum, formatSegment, formatWeight } from '@/domain/weights';
import { IconPlus } from './Icons';

export interface SetStackProps {
  log: ExerciseLog;
  activeIndex: number;
  exercise: Exercise;
  unit: Unit;
  pending: Segment[];
  scratchWeight: number | null;
  last?: LastPerformance;
  onEditSet: (set: SetLog) => void;
  onAddSet: () => void;
}

export function setTitle(sets: SetLog[], i: number): string {
  const set = sets[i];
  if (set.type === 'warmup') return 'Warm-up';
  let n = 0;
  for (let k = 0; k <= i; k++) if (sets[k].type !== 'warmup') n++;
  return `Set ${n}`;
}

export function SegmentChain({ segments, exercise, unit, current }: { segments: Segment[]; exercise: Exercise; unit: Unit; current?: number | null | undefined }) {
  return (
    <span className="chain num">
      {segments.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="arrow">{'→'}</span>}
          <span>{formatSegment(seg.weight, seg.reps, exercise, unit)}</span>
        </span>
      ))}
      {current !== undefined && (
        <span className="inline-flex items-center gap-1.5">
          {segments.length > 0 && <span className="arrow">{'→'}</span>}
          <span className="cur">{current == null ? '—' : exercise.measure === 'bodyweight' ? formatWeight(current, exercise, unit) : fmtNum(current)}</span>
        </span>
      )}
    </span>
  );
}

/** The set list for the current exercise (§6.1): done rows compact, active row highlighted. */
export function SetStack({ log, activeIndex, exercise, unit, pending, scratchWeight, last, onEditSet, onAddSet }: SetStackProps) {
  const sets = log.sets;
  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="Sets">
      {sets.map((set, i) => {
        const title = setTitle(sets, i);
        if (set.done) {
          return (
            <button key={set.id} type="button" className="set-row done" onClick={() => onEditSet(set)} role="listitem" aria-label={`${title}, logged. Tap to edit.`}>
              <span className="mark">{'●'}</span>
              <span className="w-[76px] flex-none">{title}</span>
              <SegmentChain segments={set.segments} exercise={exercise} unit={unit} />
              {set.type === 'drop' && <span className="pill ml-auto">drop</span>}
            </button>
          );
        }
        const active = i === activeIndex;
        if (active) {
          const chain = pending.length > 0 || set.type === 'drop';
          return (
            <div key={set.id} className="set-row active flex-col !items-stretch gap-1" role="listitem" aria-current="step">
              <div className="flex items-center gap-3">
                <span className="mark">{'▸'}</span>
                <span className="w-[76px] flex-none">{title}</span>
                {chain ? (
                  <SegmentChain segments={pending} exercise={exercise} unit={unit} current={scratchWeight} />
                ) : (
                  <span className="num text-dim font-medium">{scratchWeight == null ? '—' : formatWeight(scratchWeight, exercise, unit)}</span>
                )}
                {set.type === 'drop' && <span className="pill ml-auto">dropset</span>}
                {set.type === 'warmup' && <span className="pill ml-auto">light</span>}
              </div>
              {last && last.weight != null && (
                <div className="ghost pl-[30px] num">
                  last time: {formatWeight(last.weight, exercise, unit)} {'×'} {last.reps ?? '—'}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={set.id} className="set-row text-dim" role="listitem">
            <span className="mark">{'○'}</span>
            <span className="w-[76px] flex-none">{title}</span>
            {set.type === 'drop' && <span className="pill ml-auto">dropset</span>}
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost btn-sm self-start mt-1 !pl-2" onClick={onAddSet}>
        <IconPlus size={16} /> Add a set
      </button>
    </div>
  );
}

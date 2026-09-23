import { useEffect, useState } from 'react';
import type { Exercise, Segment, SetLog, Unit } from '@/domain/types';
import { fmtNum, formatWeight, snap } from '@/domain/weights';
import { Sheet } from './Sheet';
import { KeypadSheet } from './Keypad';
import { IconClose, IconPlus } from './Icons';

export interface SetEditorProps {
  set: SetLog | null;
  title: string;
  exercise: Exercise;
  unit: Unit;
  ticks: number[];
  onSave: (segments: Segment[]) => void;
  onUnlog: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Inline editor for a logged set (§6.7): weight and reps per segment, add segment, delete, un-log. */
export function SetEditorSheet({ set, title, exercise, unit, ticks, onSave, onUnlog, onDelete, onClose }: SetEditorProps) {
  const [segs, setSegs] = useState<Segment[]>([]);
  const [pad, setPad] = useState<{ i: number; field: 'weight' | 'reps' } | null>(null);
  useEffect(() => {
    if (set) setSegs(set.segments.length ? set.segments.map((s) => ({ ...s })) : [{ weight: null, reps: null }]);
  }, [set]);

  const update = (i: number, patch: Partial<Segment>) => setSegs((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <Sheet open={!!set} onClose={onClose} title={title}>
      <div className="flex flex-col gap-2">
        {segs.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-dim text-[12px] w-6 num">{i + 1}.</span>
            <button type="button" className="btn flex-1 num" onClick={() => setPad({ i, field: 'weight' })} aria-label={`Weight for segment ${i + 1}`}>
              {formatWeight(seg.weight, exercise, unit, { withUnit: exercise.measure === 'weight' })}
            </button>
            <span className="text-dim">{'×'}</span>
            <button type="button" className="btn flex-1 num" onClick={() => setPad({ i, field: 'reps' })} aria-label={`Reps for segment ${i + 1}`}>
              {seg.reps == null ? 'to failure' : `${seg.reps} reps`}
            </button>
            {segs.length > 1 && (
              <button type="button" className="btn-icon !w-10 !h-10 !min-h-0" onClick={() => setSegs((s) => s.filter((_, k) => k !== i))} aria-label="Remove segment">
                <IconClose size={18} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm self-start !pl-2"
          onClick={() => setSegs((s) => [...s, { weight: s[s.length - 1]?.weight ?? null, reps: null }])}
        >
          <IconPlus size={16} /> Add segment (dropset)
        </button>
      </div>
      <div className="flex flex-col gap-2 mt-4">
        <button type="button" className="btn btn-primary !min-h-[48px]" onClick={() => onSave(segs)}>
          Save
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn flex-1" onClick={onUnlog}>
            Un-log
          </button>
          <button type="button" className="btn btn-danger flex-1" onClick={onDelete}>
            Delete set
          </button>
        </div>
      </div>
      <KeypadSheet
        open={!!pad}
        title={pad?.field === 'weight' ? 'Weight' : 'Reps'}
        initial={pad ? (pad.field === 'weight' ? segs[pad.i]?.weight ?? null : segs[pad.i]?.reps ?? null) : null}
        unit={pad?.field === 'weight' ? unit : 'reps'}
        decimals={pad?.field === 'weight'}
        allowUnknown
        unknownLabel={pad?.field === 'weight' ? 'Unknown' : 'To failure'}
        onSubmit={(v) => {
          if (!pad) return;
          if (pad.field === 'weight') update(pad.i, { weight: v == null ? null : snap(ticks, v) });
          else update(pad.i, { reps: v == null ? null : Math.round(v) });
        }}
        onClose={() => setPad(null)}
      />
      <span className="sr-only">{segs.map((s) => fmtNum(s.weight ?? 0)).join(', ')}</span>
    </Sheet>
  );
}

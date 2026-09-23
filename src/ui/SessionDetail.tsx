import { useState } from 'react';
import type { Session } from '@/domain/types';
import { doneSetCount, sessionDurationMin } from '@/domain/session';
import { durationLabel, shortDate } from '@/domain/format';
import { useStore } from '@/app/store';
import { Sheet, ConfirmSheet } from './Sheet';
import { SegmentChain, setTitle } from './SetStack';

/** Read-only session detail (§4.7 History). */
export function SessionDetailSheet({ session, onClose, allowDelete = true }: { session: Session | null; onClose: () => void; allowDelete?: boolean }) {
  const exercises = useStore((s) => s.exercises);
  const unit = useStore((s) => s.gym.unit);
  const deleteSession = useStore((s) => s.deleteSession);
  const [confirm, setConfirm] = useState(false);
  const s = session;
  return (
    <Sheet open={!!s} onClose={onClose} title={s ? `${s.label} · ${shortDate(s.date)}` : ''} full>
      {s && (
        <div className="pb-2">
          <div className="text-dim text-[13.5px] mb-3">
            {doneSetCount(s)} sets · {durationLabel(sessionDurationMin(s))} · {s.queue.length} exercises
          </div>
          {s.queue.map((id) => {
            const log = s.logs[id];
            const ex = exercises[id];
            if (!log) return null;
            const done = log.sets.filter((x) => x.done);
            return (
              <div key={id} className="py-2 border-t border-line first:border-t-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium flex-1">{ex?.name ?? id}</span>
                  {log.skipped || !done.length ? <span className="pill warn">skipped</span> : <span className="text-dim text-[13px] num">{done.length} sets</span>}
                </div>
                {done.map((set, i) => (
                  <div key={set.id} className="flex items-center gap-3 text-[13.5px] text-dim mt-1 pl-1">
                    <span className="w-[68px] flex-none">{setTitle(log.sets, log.sets.indexOf(set))}</span>
                    {ex && <SegmentChain segments={set.segments} exercise={ex} unit={unit} />}
                    {i === 0 && set.type === 'warmup' && <span className="pill">light</span>}
                  </div>
                ))}
              </div>
            );
          })}
          {allowDelete && (
            <button type="button" className="btn btn-danger w-full mt-4" onClick={() => setConfirm(true)}>
              Delete this session
            </button>
          )}
          <ConfirmSheet
            open={confirm}
            title="Delete this session?"
            body="Scores and lift trends will be recalculated without it."
            confirmLabel="Delete"
            danger
            onCancel={() => setConfirm(false)}
            onConfirm={() => {
              setConfirm(false);
              deleteSession(s.id);
              onClose();
            }}
          />
        </div>
      )}
    </Sheet>
  );
}

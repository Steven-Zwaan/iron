import { useEffect, useRef, useState } from 'react';
import { mmss } from '@/domain/format';
import { chime, vibrate } from '@/app/platform';

export interface RestTimerProps {
  endsAt: number;
  totalSec: number;
  label: string; // "Set 2 · 60 kg"
  repChips: number[] | null;
  repsChosen: number | null;
  onReps: (r: number) => void;
  onOtherReps: () => void;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
  onExpired: () => void; // called a few seconds after zero so the sheet can close itself
  sound: boolean;
  haptics: boolean;
}

/**
 * Rest timer sheet (§6.6). The countdown is computed from the absolute `endsAt`
 * on every tick and on visibilitychange, so it is correct after backgrounding (N6).
 */
export function RestTimer({ endsAt, totalSec, label, repChips, repsChosen, onReps, onOtherReps, onAdjust, onSkip, onExpired, sound, haptics }: RestTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const firedFor = useRef<number | null>(null);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [endsAt]);

  const remainingMs = endsAt - now;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const finished = remainingMs <= 0;

  // Chime + vibrate exactly once per endsAt, then auto-dismiss after a short grace period.
  useEffect(() => {
    if (!finished || firedFor.current === endsAt) return;
    firedFor.current = endsAt;
    if (sound) chime();
    if (haptics) vibrate([120, 70, 120]);
    setAnnounce('Rest over');
    const t = window.setTimeout(onExpired, 5000);
    return () => window.clearTimeout(t);
  }, [finished, endsAt, sound, haptics, onExpired]);

  useEffect(() => {
    if (remaining === 10) setAnnounce('Ten seconds');
  }, [remaining]);

  const r = 30;
  const c = 2 * Math.PI * r;
  const frac = totalSec > 0 ? Math.min(1, Math.max(0, remainingMs / (totalSec * 1000))) : 0;

  return (
    <div className="rest-sheet" role="region" aria-label="Rest timer">
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      <div className="flex items-center gap-4">
        <svg className={`ring${finished ? ' finished' : ''}`} viewBox="0 0 72 72" aria-hidden="true">
          <circle className="bg" cx="36" cy="36" r={r} />
          <circle className="fg" cx="36" cy="36" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        </svg>
        <div className="flex-1 min-w-0">
          <div className={`black num countdown${finished ? ' text-t1' : ''}`}>{finished ? '0:00' : mmss(remaining)}</div>
          <div className="text-dim text-[13.5px] truncate">{label}</div>
        </div>
        <button type="button" className="btn btn-sm" onClick={onSkip}>
          Skip rest
        </button>
      </div>

      {repChips && (
        <div className="mt-3 transition-opacity duration-500" style={{ opacity: finished ? 0.35 : 1 }}>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <span className="text-dim text-[13.5px] flex-none">How many?</span>
            {repChips.map((n) => (
              <button key={n} type="button" className={`chip chip-lg num${repsChosen === n ? ' on' : ''}`} onClick={() => onReps(n)} aria-label={`${n} reps`}>
                {n}
              </button>
            ))}
            <button type="button" className={`chip chip-lg${repsChosen != null && !repChips.includes(repsChosen) ? ' on' : ''}`} onClick={onOtherReps}>
              {repsChosen != null && !repChips.includes(repsChosen) ? repsChosen : 'other'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button type="button" className="btn flex-1 num" onClick={() => onAdjust(-15)} disabled={finished}>
          {'−'}15
        </button>
        <button type="button" className="btn flex-1 num" onClick={() => onAdjust(30)}>
          +30
        </button>
      </div>
    </div>
  );
}

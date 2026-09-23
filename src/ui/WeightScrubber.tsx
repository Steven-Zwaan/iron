import { useCallback, useEffect, useRef, useState } from 'react';
import type { Exercise, Unit } from '@/domain/types';
import { fmtNum, formatWeight, snap, stepTick, tickIndex, weightUnitLabel } from '@/domain/weights';
import { vibrate } from '@/app/platform';
import { KeypadSheet } from './Keypad';

const TICK_PX = 16; // one notch per 16 px of travel (§6.2)

export interface WeightScrubberProps {
  value: number | null;
  ticks: number[];
  onChange: (v: number | null) => void;
  exercise: Exercise;
  unit: Unit;
  last?: number | null;
  best?: number | null;
  haptics?: boolean;
}

/**
 * Horizontal ruler that snaps to the weights that actually exist (§6.2).
 * Drag = scrub, no momentum. ⊖/⊕ move one tick. Tap the number for the keypad.
 */
export function WeightScrubber({ value, ticks, onChange, exercise, unit, last, best, haptics = true }: WeightScrubberProps) {
  const [dragPx, setDragPx] = useState(0);
  const [keypad, setKeypad] = useState(false);
  const drag = useRef<{ startX: number; startIndex: number; lastIndex: number; pointerId: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const fallback = last ?? ticks[Math.min(ticks.length - 1, Math.floor(ticks.length / 4))] ?? 0;
  const index = value == null ? -1 : tickIndex(ticks, value);
  const baseIndex = index < 0 ? tickIndex(ticks, fallback) : index;
  const lastIndex = last == null ? -1 : tickIndex(ticks, last);
  const bestIndex = best == null ? -1 : tickIndex(ticks, best);

  const commitIndex = useCallback(
    (i: number) => {
      const j = Math.max(0, Math.min(ticks.length - 1, i));
      if (ticks[j] !== value) onChange(ticks[j]);
    },
    [ticks, value, onChange],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag.current = { startX: e.clientX, startIndex: baseIndex, lastIndex: baseIndex, pointerId: e.pointerId };
    trackRef.current?.setPointerCapture(e.pointerId);
    if (value == null) onChange(ticks[baseIndex] ?? null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const raw = d.startIndex - dx / TICK_PX; // drag right = lower ticks scroll under the needle = ... invert: drag left to go up
    const target = Math.max(0, Math.min(ticks.length - 1, Math.round(raw)));
    const residual = (raw - target) * TICK_PX;
    setDragPx(Math.max(-TICK_PX / 2, Math.min(TICK_PX / 2, residual)));
    if (target !== d.lastIndex) {
      if (haptics) {
        // Passing the "last" marker gives a double tick — the progression cue.
        const crossed = lastIndex >= 0 && ((d.lastIndex < lastIndex && target >= lastIndex) || (d.lastIndex > lastIndex && target <= lastIndex));
        vibrate(crossed ? [8, 40, 8] : 8);
      }
      d.lastIndex = target;
      commitIndex(target);
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragPx(0);
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const step = (dir: 1 | -1) => {
    const v = stepTick(ticks, value, dir, fallback);
    if (haptics) vibrate(8);
    onChange(v);
  };

  useEffect(() => {
    if (value != null && ticks.length && index < 0) onChange(snap(ticks, value));
  }, [value, ticks, index, onChange]);

  // Only render ticks near the needle (±14) — enough to fill the track at 16 px/tick.
  const from = Math.max(0, baseIndex - 16);
  const to = Math.min(ticks.length - 1, baseIndex + 16);
  const labelEvery = ticks.length > 40 ? 4 : 2;
  const offset = -(baseIndex * TICK_PX) - dragPx;

  return (
    <div className="scrubber" aria-label="Weight">
      <button type="button" className="scrubber-value w-full" onClick={() => setKeypad(true)} aria-label={`Weight ${formatWeight(value, exercise, unit, { withUnit: true })}. Tap to type.`}>
        <span className="black num big">{value == null ? '—' : exercise.measure === 'bodyweight' ? formatWeight(value, exercise, unit) : exercise.measure === 'stack_level' ? fmtNum(value) : fmtNum(value)}</span>
        <span className="unit">{weightUnitLabel(exercise, unit)}</span>
      </button>
      <div
        ref={trackRef}
        className="scrubber-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="slider"
        aria-valuemin={ticks[0]}
        aria-valuemax={ticks[ticks.length - 1]}
        aria-valuenow={value ?? undefined}
        aria-valuetext={formatWeight(value, exercise, unit, { withUnit: true })}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
      >
        <div className="scrubber-ticks" style={{ transform: `translateX(${offset}px)`, transition: drag.current ? 'none' : 'transform 120ms ease-out' }}>
          {ticks.slice(from, to + 1).map((t, k) => {
            const i = from + k;
            const x = i * TICK_PX;
            const major = i % labelEvery === 0;
            return (
              <span key={i} style={{ position: 'absolute', left: x, bottom: 0, height: '100%' }}>
                <i className={`tick${major ? ' major' : ''}`} style={{ left: 0 }} />
                {major && <span className="tick-label num">{exercise.measure === 'bodyweight' ? (t === 0 ? 'BW' : `+${fmtNum(t)}`) : fmtNum(t)}</span>}
                {i === lastIndex && (
                  <span className="tick-marker last" title="Last session" aria-hidden="true">
                    {'▲'}
                  </span>
                )}
                {i === bestIndex && i !== lastIndex && (
                  <span className="tick-marker best" title="All-time best" aria-hidden="true">
                    {'★'}
                  </span>
                )}
                {i === bestIndex && i === lastIndex && (
                  <span className="tick-marker best" style={{ bottom: 56 }} aria-hidden="true">
                    {'★'}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <div className="scrubber-needle" />
      </div>
      <button type="button" className="scrubber-btn minus" onClick={() => step(-1)} aria-label="One step lighter">
        {'−'}
      </button>
      <button type="button" className="scrubber-btn plus" onClick={() => step(1)} aria-label="One step heavier">
        +
      </button>
      <KeypadSheet
        open={keypad}
        title="Weight"
        initial={value}
        unit={weightUnitLabel(exercise, unit)}
        decimals={exercise.measure !== 'stack_level'}
        allowUnknown
        unknownLabel="Unknown"
        onSubmit={(v) => onChange(v == null ? null : snap(ticks, v))}
        onClose={() => setKeypad(false)}
      />
    </div>
  );
}

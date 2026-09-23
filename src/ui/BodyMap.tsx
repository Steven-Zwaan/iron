import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import bodymap from '@shared/data/bodymap.json';
import type { BodyScore, MuscleId } from '@/domain/types';
import { MUSCLE_IDS, TIER_NAME, TIER_VAR, muscleName } from '@/domain/muscles';
import { useStore } from '@/app/store';
import { Sheet } from './Sheet';
import { TierDot } from './Controls';
import { Bar } from './Sparkline';

interface Shape {
  cls: 'base' | 'mf';
  m?: string;
  d: string;
}

const DATA = bodymap as unknown as {
  frame: { width: number; height: number };
  gap: number;
  front: Shape[];
  back: Shape[];
};

export type BodyView = 'both' | 'front' | 'back';

export interface BodyMapProps {
  score: BodyScore;
  /** When given, the map first paints these colours and then transitions to `score` (§8.3). */
  animateFrom?: BodyScore;
  labels?: boolean;
  /** Both views side by side (default), or a single view for the Progress slider. */
  view?: BodyView;
  onSelect?: (m: MuscleId) => void;
  className?: string;
  style?: CSSProperties;
}

const MUSCLE_INDEX = Object.fromEntries(MUSCLE_IDS.map((m, i) => [m, i])) as Record<MuscleId, number>;
const LABEL_H = 16;

/**
 * The body map. Geometry is traced from the reference figure (shared/data/bodymap.json):
 * front and back views side by side, every muscle region a real <path> carrying data-m,
 * so each one is a tap target and is coloured by its own score tier. Silhouette parts
 * (head, hands, feet, tendons) are `base`; untrained muscles resolve to the same colour.
 */
export function BodyMap({ score, animateFrom, labels = true, view = 'both', onSelect, className, style }: BodyMapProps) {
  const [shown, setShown] = useState<BodyScore>(animateFrom ?? score);
  useEffect(() => {
    if (!animateFrom) {
      setShown(score);
      return;
    }
    setShown(animateFrom);
    const t = window.setTimeout(() => setShown(score), 60);
    return () => window.clearTimeout(t);
  }, [score, animateFrom]);

  const interactive = !!onSelect;
  const { width, height } = DATA.frame;
  const totalW = view === 'both' ? width * 2 + DATA.gap : width;
  const totalH = height + (labels ? LABEL_H : 0);

  const renderView = (shapes: Shape[], dx: number, label: string) => {
    const focusable = new Set<string>();
    return (
      <g transform={`translate(${dx},0)`}>
        {shapes.map((sh, i) => {
          if (!sh.m) return <path key={i} className="base" d={sh.d} />;
          const m = sh.m as MuscleId;
          const s = shown.muscles[m];
          const tier = s?.tier ?? 0;
          const first = !focusable.has(m);
          focusable.add(m);
          return (
            <path
              key={i}
              className={`mf${tier === 3 ? ' glow3' : tier === 4 ? ' glow4' : ''}`}
              data-m={m}
              d={sh.d}
              style={{ color: TIER_VAR[tier], transitionDelay: `${MUSCLE_INDEX[m] * 12}ms` }}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive && first ? 0 : undefined}
              aria-label={`${muscleName(m)}, ${TIER_NAME[tier]}, ${(s?.effectiveSets ?? 0).toFixed(1)} of ${s?.target ?? 0} sets`}
              onClick={interactive ? () => onSelect?.(m) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(m);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
        {labels && (
          <text className="view-label" x={width / 2} y={height + LABEL_H - 4} textAnchor="middle">
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg
      className={`bodymap${className ? ` ${className}` : ''}`}
      style={style}
      viewBox={`0 0 ${totalW} ${totalH}`}
      role="img"
      aria-label={`Body map${view === 'both' ? '' : `, ${view} view`}, overall score ${shown.overall} of 100`}
    >
      {view !== 'back' && renderView(DATA.front, 0, 'FRONT')}
      {view !== 'front' && renderView(DATA.back, view === 'both' ? width + DATA.gap : 0, 'BACK')}
    </svg>
  );
}

/** Tap readout: name, effective sets vs target, tier, top three contributors (§4.6). */
export function MuscleDetailSheet({ muscle, score, onClose }: { muscle: MuscleId | null; score: BodyScore; onClose: () => void }) {
  const exercises = useStore((s) => s.exercises);
  const s = muscle ? score.muscles[muscle] : null;
  const weeks = Math.max(1, score.rangeDays / 7);
  const top = useMemo(() => s?.topContributors ?? [], [s]);
  return (
    <Sheet open={!!muscle} onClose={onClose} title={muscle ? muscleName(muscle) : ''}>
      {s && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <TierDot tier={s.tier} label />
            <span className="text-dim text-[13.5px]">
              <span className="num font-semibold text-text">{s.effectiveSets.toFixed(1)}</span> of {s.target * weeks} effective sets
              {weeks > 1 ? ` in ${score.rangeDays} days` : ' this week'}
            </span>
            <span className="ml-auto black num text-[23px] tier-text" data-tier={s.tier}>
              {s.score}
            </span>
          </div>
          <Bar value={s.score} tier={s.tier} />
          <div className="eyebrow mt-4 mb-2">Top contributors</div>
          {top.length === 0 && <div className="text-dim text-[13.5px]">Nothing yet. Pick an exercise for this muscle in the session builder.</div>}
          {top.map((c) => (
            <div key={c.exerciseId} className="row !min-h-[40px] !py-1.5">
              <span className="flex-1 truncate">{exercises[c.exerciseId]?.name ?? c.exerciseId}</span>
              <span className="num text-dim text-[13.5px]">{c.effectiveSets.toFixed(1)} sets</span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

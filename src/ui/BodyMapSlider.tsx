import { useCallback, useEffect, useRef, useState } from 'react';
import type { BodyScore, MuscleId } from '@/domain/types';
import { BodyMap, type BodyView } from './BodyMap';

const VIEWS: { id: Exclude<BodyView, 'both'>; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
];

/**
 * Front and back as two full-width slides (scroll-snap, one visible at a time) with a
 * Front/Back switch that follows the swipe and can also drive it.
 */
export function BodyMapSlider({ score, onSelect }: { score: BodyScore; onSelect?: (m: MuscleId) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const raf = useRef(0);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (!el || !el.clientWidth) return;
      setIndex(Math.max(0, Math.min(VIEWS.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
    });
  }, []);
  useEffect(() => {
    // Always open on the front view, whatever scroll state the browser restored.
    if (track.current) track.current.scrollLeft = 0;
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    setIndex(i);
  };

  return (
    <div className="bm-slider">
      <div className="bm-track" ref={track} onScroll={onScroll} aria-roledescription="carousel" aria-label="Body map views">
        {VIEWS.map((v, i) => (
          <div key={v.id} className="bm-slide" role="group" aria-roledescription="slide" aria-label={`${v.label} view`} aria-hidden={i !== index}>
            <BodyMap score={score} view={v.id} labels={false} onSelect={onSelect} />
          </div>
        ))}
      </div>
      <div className="bm-pager" role="tablist" aria-label="Choose body view">
        {VIEWS.map((v, i) => (
          <button key={v.id} type="button" role="tab" aria-selected={i === index} className={`bm-tab${i === index ? ' on' : ''}`} onClick={() => goTo(i)}>
            <i aria-hidden="true" />
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

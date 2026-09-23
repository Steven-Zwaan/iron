import { useEffect, useMemo, useState } from 'react';
import type { BodyScore, PlanDay } from '@/domain/types';
import { computeBodyScore } from '@/domain/scoring';
import { dueDay } from '@/domain/plan';
import { localDateStr } from '@/domain/time';
import { useStore } from './store';

/** A ticking timestamp. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);
  return now;
}

/** Body score for a rolling range, recomputed when sessions/exercises/targets change or the day rolls over. */
export function useBodyScore(rangeDays: number): BodyScore {
  const sessions = useStore((s) => s.sessions);
  const exercises = useStore((s) => s.exercises);
  const targets = useStore((s) => s.state.settings.weeklyTargets);
  const today = localDateStr(useNow(60_000));
  return useMemo(() => computeBodyScore(sessions, exercises, rangeDays, targets), [sessions, exercises, rangeDays, targets, today]);
}

export function useDueDay(): PlanDay | null {
  const plan = useStore((s) => s.plan);
  const sessions = useStore((s) => s.sessions);
  const now = useNow(60_000);
  return useMemo(() => dueDay(plan, sessions, now), [plan, sessions, now]);
}

/** Applies the theme setting to <html data-theme>; 'auto' follows the OS. */
export function useTheme(): void {
  const theme = useStore((s) => s.state.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved = theme === 'auto' ? (mq.matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', resolved === 'light' ? '#F2F4F8' : '#0F1116');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function useExerciseName(): (id: string) => string {
  const exercises = useStore((s) => s.exercises);
  return (id) => exercises[id]?.name ?? id;
}

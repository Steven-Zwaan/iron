import { create } from 'zustand';
import type { BodyScore, Session } from '@/domain/types';

/** Data for the post-session summary sheet (§6.8). Lives here so it can outlive the Runner. */
export interface SummaryData {
  session: Session;
  pre: BodyScore;
  post: BodyScore;
  carried: string[];
  cleared: string[];
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
  sticky?: boolean;
}

interface UIStore {
  toasts: Toast[];
  summary: SummaryData | null;
  push(t: Omit<Toast, 'id'>): number;
  dismiss(id: number): void;
  setSummary(d: SummaryData | null): void;
}

let seq = 1;

export const useUI = create<UIStore>()((set, get) => ({
  toasts: [],
  summary: null,
  setSummary(d) {
    set({ summary: d });
  },
  push(t) {
    const id = seq++;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    if (!t.sticky) setTimeout(() => get().dismiss(id), 3500);
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
}));

export function toast(text: string, action?: Toast['action'], sticky = false): number {
  return useUI.getState().push({ text, action, sticky });
}

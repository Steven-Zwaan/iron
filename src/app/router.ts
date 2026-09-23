/**
 * Tiny hash router. Tabs are `#/today|plan|progress|coach`; everything else is a
 * full-screen modal over the tabs. Using the hash keeps the back gesture working
 * on Android and needs no server-side rewrite rules.
 */
import { useSyncExternalStore } from 'react';

export type Tab = 'today' | 'plan' | 'progress' | 'coach';

export type Route =
  | { name: 'today' }
  | { name: 'plan' }
  | { name: 'progress' }
  | { name: 'coach' }
  | { name: 'builder'; dayId?: string; freestyle?: boolean }
  | { name: 'runner' }
  | { name: 'settings' }
  | { name: 'onboarding' }
  | { name: 'gym' }
  | { name: 'targets' }
  | { name: 'owed' }
  | { name: 'day'; id: string }
  | { name: 'exercise'; id: string }
  | { name: 'library' };

export const TABS: Tab[] = ['today', 'plan', 'progress', 'coach'];

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query);
  switch (parts[0]) {
    case undefined:
    case '':
    case 'today':
      return { name: 'today' };
    case 'plan':
      return { name: 'plan' };
    case 'progress':
      return { name: 'progress' };
    case 'coach':
      return { name: 'coach' };
    case 'builder':
      return { name: 'builder', dayId: q.get('day') ?? undefined, freestyle: q.get('free') === '1' };
    case 'runner':
      return { name: 'runner' };
    case 'settings':
      return { name: 'settings' };
    case 'onboarding':
      return { name: 'onboarding' };
    case 'gym':
      return { name: 'gym' };
    case 'targets':
      return { name: 'targets' };
    case 'owed':
      return { name: 'owed' };
    case 'library':
      return { name: 'library' };
    case 'day':
      return parts[1] ? { name: 'day', id: decodeURIComponent(parts[1]) } : { name: 'plan' };
    case 'exercise':
      return parts[1] ? { name: 'exercise', id: decodeURIComponent(parts[1]) } : { name: 'today' };
    default:
      return { name: 'today' };
  }
}

export function toHash(r: Route): string {
  switch (r.name) {
    case 'builder': {
      const q = new URLSearchParams();
      if (r.dayId) q.set('day', r.dayId);
      if (r.freestyle) q.set('free', '1');
      const s = q.toString();
      return `#/builder${s ? `?${s}` : ''}`;
    }
    case 'day':
      return `#/day/${encodeURIComponent(r.id)}`;
    case 'exercise':
      return `#/exercise/${encodeURIComponent(r.id)}`;
    default:
      return `#/${r.name}`;
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
}

function snapshot(): string {
  return window.location.hash;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '');
  return parseHash(hash);
}

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const h = toHash(r);
  if (window.location.hash === h) return;
  // A sheet's history entry is on top: replace it instead of stacking a route on it,
  // otherwise the back gesture would resurface a closed sheet's URL.
  const st = window.history.state as { sheet?: boolean } | null;
  const replace = opts.replace || (!!st && st.sheet === true);
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${h}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = h;
  }
}

/** Close a modal route: go back if we can, otherwise land on a tab. */
export function back(fallback: Route = { name: 'today' }): void {
  if (window.history.length > 1 && window.history.state !== 'root') window.history.back();
  else navigate(fallback, { replace: true });
}

export function isTab(r: Route): r is { name: Tab } {
  return (TABS as string[]).includes(r.name);
}

/** Handle PWA shortcut URLs like /?action=start and /?tab=progress once at boot. */
export function consumeLaunchQuery(): Route | null {
  const q = new URLSearchParams(window.location.search);
  const action = q.get('action');
  const tab = q.get('tab');
  if (!action && !tab) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  if (action === 'start') return { name: 'builder' };
  if (tab && (TABS as string[]).includes(tab)) return { name: tab as Tab };
  return null;
}

/**
 * Platform APIs (§11.4) behind one small surface. Every call degrades silently.
 * `rest` is the seam for the native Live Activity plugin (§11.6): on the web it
 * schedules a notification; in the Swift shell it becomes an ActivityKit call.
 */

export function vibrate(pattern: number | number[]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* no haptics (iOS Safari) */
  }
}

// ---------------- wake lock ----------------
let wakeLock: WakeLockSentinel | null = null;
let wantLock = false;

export async function requestWakeLock(): Promise<void> {
  wantLock = true;
  try {
    if (!('wakeLock' in navigator) || wakeLock) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

export function releaseWakeLock(): void {
  wantLock = false;
  try {
    wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantLock && !wakeLock) void requestWakeLock();
});

// ---------------- audio ----------------
let ctx: AudioContext | null = null;

/** Must be called from a user gesture at least once so the context is allowed to play later. */
export function primeAudio(): void {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, at: number, dur: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Double chime: 784 Hz then 1046 Hz (§6.6). */
export function chime(): void {
  try {
    primeAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(784, t, 0.18);
    tone(1046, t + 0.22, 0.28);
  } catch {
    /* ignore */
  }
}

// ---------------- notifications via SW ----------------
export function notificationsSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

async function swPost(msg: unknown): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage(msg);
  } catch {
    /* ignore */
  }
}

export async function showNotificationNow(title: string, body: string): Promise<void> {
  try {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.showNotification(title, { body, tag: 'iron-rest', silent: false });
  } catch {
    /* ignore */
  }
}

// ---------------- rest timer seam ----------------
export interface RestPlatform {
  start(endsAt: number, exerciseName: string): void;
  stop(): void;
}

export const rest: RestPlatform = {
  start(endsAt, exerciseName) {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    void swPost({ type: 'REST_SCHEDULE', endsAt, title: 'Rest over', body: `Back to ${exerciseName}` });
  },
  stop() {
    void swPost({ type: 'REST_CANCEL' });
  },
};

// ---------------- files ----------------
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickTextFile(accept = 'application/json,.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = (): boolean => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

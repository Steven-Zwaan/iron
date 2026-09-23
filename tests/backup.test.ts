import { describe, expect, it } from 'vitest';
import { applyBackup, backupFilename, makeBackup, parseBackup, type Snapshot } from '@/domain/backup';
import { CATALOGUE, defaultGym } from '@/domain/exercises';
import { seedPlan } from '@/domain/plan';
import type { AppState } from '@/domain/types';
import { MONDAY, SETTINGS, completedSession } from './helpers';

const now = Date.parse('2026-09-21T18:00:00');

function snapshot(): Snapshot {
  const state: AppState = { id: 'app', onboarded: true, debt: { db_curl: 1 }, lastPerformance: {}, coachCache: {}, settings: SETTINGS, updatedAt: now };
  return { exercises: CATALOGUE, gym: defaultGym('kg', now), plan: seedPlan(now), sessions: [completedSession(MONDAY, now - 86_400_000)], state };
}

describe('backup export / import (N10)', () => {
  it('round-trips through JSON and reproduces the data', () => {
    const snap = snapshot();
    const text = JSON.stringify(makeBackup(snap, now));
    const parsed = parseBackup(text);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.sessions).toHaveLength(1);
    const fresh: Snapshot = { ...snapshot(), sessions: [], state: { ...snapshot().state, onboarded: false, debt: {} } };
    const restored = applyBackup(fresh, parsed, 'replace');
    expect(restored.sessions).toHaveLength(1);
    expect(restored.state.debt).toEqual({ db_curl: 1 });
    expect(restored.state.lastPerformance.pec_deck.weight).toBe(40);
    expect(restored.plan.days.map((d) => d.id)).toEqual(['mon', 'thu']);
  });

  it('merge unions sessions and keeps the newer plan', () => {
    const snap = snapshot();
    const other = completedSession(MONDAY, now - 3 * 86_400_000, 35);
    const backup = makeBackup({ ...snap, sessions: [other], plan: { ...snap.plan, updatedAt: now + 1, days: [snap.plan.days[0]] } }, now);
    const merged = applyBackup(snap, backup, 'merge');
    expect(merged.sessions).toHaveLength(2);
    expect(merged.plan.days).toHaveLength(1);
  });

  it('rejects files that are not Iron backups', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/not an Iron backup/);
    expect(() => parseBackup('{"app":"iron","schemaVersion":99}')).toThrow(/Unsupported/);
  });

  it('names the file by date', () => {
    expect(backupFilename(now)).toBe('iron-backup-2026-09-21.json');
  });
});

import { useState } from 'react';
import type { Equipment, Theme, Unit } from '@/domain/types';
import { EQUIPMENT_NAME } from '@/domain/exercises';
import { backupFilename, parseBackup } from '@/domain/backup';
import type { Backup } from '@/domain/types';
import { owedIds } from '@/domain/debt';
import gymDefaults from '@shared/data/gym-defaults.json';
import { useStore } from '@/app/store';
import { back, navigate } from '@/app/router';
import { toast } from '@/app/ui';
import { downloadText, ensureNotificationPermission, isIOS, isStandalone, notificationsSupported, pickTextFile } from '@/app/platform';
import { ModalHeader, Segmented, SettingRow, Stepper, Switch } from '@/ui/Controls';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { IconChevronRight } from '@/ui/Icons';

const REST_EQUIPMENT: Equipment[] = ['machine_stack', 'cable_stack', 'plate_loaded', 'barbell', 'dumbbell', 'bodyweight'];

export function Settings() {
  const gym = useStore((s) => s.gym);
  const settings = useStore((s) => s.state.settings);
  const debt = useStore((s) => s.state.debt);
  const sessionsCount = useStore((s) => s.sessions.length);
  const saveSettings = useStore((s) => s.saveSettings);
  const saveGym = useStore((s) => s.saveGym);
  const exportBackup = useStore((s) => s.exportBackup);
  const importBackup = useStore((s) => s.importBackup);
  const resetAll = useStore((s) => s.resetAll);
  const [restOpen, setRestOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<Backup | null>(null);
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [unitConfirm, setUnitConfirm] = useState<Unit | null>(null);

  const owedCount = owedIds(debt).length;

  const doExport = () => {
    const b = exportBackup();
    downloadText(backupFilename(), JSON.stringify(b, null, 2));
    toast('Backup downloaded');
  };
  const doImport = async () => {
    const text = await pickTextFile();
    if (!text) return;
    try {
      setPendingImport(parseBackup(text));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };
  const applyImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    try {
      await importBackup(pendingImport, mode);
      toast(mode === 'merge' ? 'Backup merged' : 'Backup restored');
    } catch {
      toast('Import failed.');
    }
    setPendingImport(null);
  };
  const changeUnit = (unit: Unit) => {
    if (unit === gym.unit) return;
    setUnitConfirm(unit);
  };
  const applyUnit = () => {
    if (!unitConfirm) return;
    const d = gymDefaults[unitConfirm];
    saveGym({ unit: unitConfirm, increments: { ...(d.increments as Record<Equipment, number>) }, dumbbells: [...d.dumbbells], barWeight: d.barWeight, plates: [...d.plates] });
    setUnitConfirm(null);
  };
  const askNotifications = async () => {
    const ok = await ensureNotificationPermission();
    toast(ok ? 'Rest notifications enabled' : 'Notifications were not allowed.');
  };

  return (
    <div className="screen modal">
      <ModalHeader title="Settings" onBack={() => back()} />

      <section className="card">
        <div className="eyebrow mb-2">Display</div>
        <SettingRow label="Units">
          <Segmented<Unit> value={gym.unit} onChange={changeUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        </SettingRow>
        <SettingRow label="Theme">
          <Segmented<Theme> value={settings.theme} onChange={(theme) => saveSettings({ theme })} options={[{ value: 'auto', label: 'Auto' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        </SettingRow>
      </section>

      <section className="card">
        <div className="eyebrow mb-2">Rest timer</div>
        <SettingRow label="Auto-start after every set">
          <Switch checked={settings.restAutoStart} onChange={(v) => saveSettings({ restAutoStart: v })} label="Auto-start rest timer" />
        </SettingRow>
        <SettingRow label="Sound" hint="Double chime at zero">
          <Switch checked={settings.restSound} onChange={(v) => saveSettings({ restSound: v })} label="Rest sound" />
        </SettingRow>
        <SettingRow label="Vibration" hint="Scrubber ticks and rest end. Not available on iOS.">
          <Switch checked={settings.restVibrate} onChange={(v) => saveSettings({ restVibrate: v })} label="Vibration" />
        </SettingRow>
        <SettingRow label="Rep chips during rest" hint="Ask how many reps you got while you rest">
          <Switch checked={settings.repChipsOnRest} onChange={(v) => saveSettings({ repChipsOnRest: v })} label="Rep chips" />
        </SettingRow>
        <SettingRow label="Ask reps before a drop" hint="A 3-chip picker after Drop weight">
          <Switch checked={settings.askRepsBeforeDrop} onChange={(v) => saveSettings({ askRepsBeforeDrop: v })} label="Ask reps before drop" />
        </SettingRow>
        <SettingRow label="Default rest per equipment" hint="Overrides the exercise default when set" onClick={() => setRestOpen((v) => !v)}>
          <IconChevronRight className="text-dim" />
        </SettingRow>
        {restOpen && (
          <div className="pl-2 pb-2">
            {REST_EQUIPMENT.map((eq) => (
              <div key={eq} className="flex items-center justify-between min-h-[48px]">
                <span className="text-[13.5px]">{EQUIPMENT_NAME[eq]}</span>
                <Stepper
                  value={settings.restDefaults?.[eq] ?? 0}
                  min={0}
                  max={300}
                  step={15}
                  format={(v) => (v ? `${v} s` : 'exercise default')}
                  onChange={(v) => saveSettings({ restDefaults: { ...settings.restDefaults, [eq]: v || undefined } })}
                />
              </div>
            ))}
          </div>
        )}
        {notificationsSupported() && (
          <SettingRow label="Background notification" hint={isIOS() && !isStandalone() ? 'On iPhone, add Iron to the Home Screen first.' : 'Notify when rest ends while the app is in the background'} onClick={askNotifications}>
            <span className="text-dim text-[13px]">{Notification.permission === 'granted' ? 'On' : 'Allow'}</span>
          </SettingRow>
        )}
      </section>

      <section className="card">
        <div className="eyebrow mb-2">Training</div>
        <SettingRow label="Gym profile" hint={`${gym.available.length} exercises available`} onClick={() => navigate({ name: 'gym' })}>
          <IconChevronRight className="text-dim" />
        </SettingRow>
        <SettingRow label="Exercise library" hint="Browse, edit, add custom exercises" onClick={() => navigate({ name: 'library' })}>
          <IconChevronRight className="text-dim" />
        </SettingRow>
        <SettingRow label="Weekly muscle targets" hint="Advanced" onClick={() => navigate({ name: 'targets' })}>
          <IconChevronRight className="text-dim" />
        </SettingRow>
        <SettingRow label="Owed exercises" hint={owedCount ? `${owedCount} carried over` : 'Nothing owed'} onClick={() => navigate({ name: 'owed' })}>
          <IconChevronRight className="text-dim" />
        </SettingRow>
        <SettingRow label="Run setup again" onClick={() => navigate({ name: 'onboarding' })}>
          <IconChevronRight className="text-dim" />
        </SettingRow>
      </section>

      <section className="card">
        <div className="eyebrow mb-2">Backup</div>
        <div className="text-dim text-[13px] mb-3">{sessionsCount} sessions on this device. Nothing leaves it unless you export or use the coach.</div>
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={doExport}>
            Export JSON
          </button>
          <button className="btn flex-1" onClick={() => void doImport()}>
            Import JSON
          </button>
        </div>
      </section>

      <section className="card">
        <div className="eyebrow mb-2">Coach (AI)</div>
        <SettingRow label="Enable the coach" hint="Needs network. Sends your training summary to your proxy.">
          <Switch checked={settings.aiEnabled} onChange={(v) => saveSettings({ aiEnabled: v })} label="Enable coach" />
        </SettingRow>
        {settings.aiEnabled && (
          <div className="field mt-2">
            <label htmlFor="ai-endpoint">Endpoint URL</label>
            <input id="ai-endpoint" className="input" value={settings.aiEndpoint} onChange={(e) => saveSettings({ aiEndpoint: e.target.value })} placeholder="/api/coach" autoCapitalize="off" autoCorrect="off" />
            <div className="text-dim text-[12px]">Default is the proxy deployed with this app. See api/coach.ts.</div>
            <label htmlFor="ai-token" className="mt-2">Access token (optional)</label>
            <input id="ai-token" type="password" className="input" value={settings.aiToken ?? ''} onChange={(e) => saveSettings({ aiToken: e.target.value })} placeholder="Only if your proxy sets COACH_SECRET" autoCapitalize="off" autoCorrect="off" />
          </div>
        )}
      </section>

      <section className="card">
        <div className="eyebrow mb-2">Danger zone</div>
        <button className="btn btn-danger w-full" onClick={() => setResetStep(1)}>
          Reset everything
        </button>
      </section>

      <div className="text-center text-dim2 text-[12px] mt-4">Iron v{__APP_VERSION__}</div>

      <Sheet open={!!pendingImport} onClose={() => setPendingImport(null)} title="Import backup">
        {pendingImport && (
          <>
            <div className="text-dim text-[13.5px] mb-4">
              {pendingImport.sessions.length} sessions, {pendingImport.plan.days.length} plan days, exported {new Date(pendingImport.exportedAt).toLocaleDateString()}.
            </div>
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary" onClick={() => void applyImport('merge')}>
                Merge into this device
              </button>
              <button className="btn btn-danger w-full" onClick={() => void applyImport('replace')}>
                Replace everything on this device
              </button>
            </div>
          </>
        )}
      </Sheet>
      <ConfirmSheet
        open={resetStep === 1}
        title="Reset everything?"
        body="Every session, plan and setting on this device is deleted. Export a backup first if you might want it back."
        confirmLabel="Continue"
        danger
        onCancel={() => setResetStep(0)}
        onConfirm={() => setResetStep(2)}
      />
      <ConfirmSheet
        open={resetStep === 2}
        title="Really delete all data?"
        body="This cannot be undone."
        confirmLabel="Delete all my data"
        danger
        onCancel={() => setResetStep(0)}
        onConfirm={async () => {
          setResetStep(0);
          await resetAll();
          navigate({ name: 'onboarding' }, { replace: true });
        }}
      />
      <ConfirmSheet
        open={!!unitConfirm}
        title={`Switch to ${unitConfirm}?`}
        body="Increments, the dumbbell rack, bar and plates reset to typical values for that unit. Logged weights are not converted."
        confirmLabel="Switch"
        onCancel={() => setUnitConfirm(null)}
        onConfirm={applyUnit}
      />
    </div>
  );
}

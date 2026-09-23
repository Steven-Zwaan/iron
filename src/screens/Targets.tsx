import { CATEGORIES, CATEGORY_NAME, MUSCLE_DEFS, musclesInCategory, targetFor } from '@/domain/muscles';
import { useStore } from '@/app/store';
import { back } from '@/app/router';
import { ModalHeader, Stepper } from '@/ui/Controls';

/** Settings → Weekly muscle targets (advanced). */
export function Targets() {
  const overrides = useStore((s) => s.state.settings.weeklyTargets);
  const saveSettings = useStore((s) => s.saveSettings);
  const set = (id: (typeof MUSCLE_DEFS)[number]['id'], v: number) => saveSettings({ weeklyTargets: { ...overrides, [id]: v } });
  return (
    <div className="screen modal">
      <ModalHeader
        title="Weekly targets"
        subtitle="Effective sets per muscle per week"
        onBack={() => back({ name: 'settings' })}
        right={
          <button className="link" onClick={() => saveSettings({ weeklyTargets: undefined })}>
            Reset
          </button>
        }
      />
      <p className="text-dim text-[13.5px] mb-3 leading-relaxed">A work set to failure counts 1.0, a warm-up 0.25, and each extra dropset segment 0.4, multiplied by how much the exercise loads the muscle. You reach 100 at 15 % above target.</p>
      {CATEGORIES.map((cat) => (
        <section key={cat} className="card">
          <div className="eyebrow mb-1">{CATEGORY_NAME[cat]}</div>
          {musclesInCategory(cat).map((m) => {
            const def = MUSCLE_DEFS.find((d) => d.id === m)!;
            const v = targetFor(m, overrides);
            return (
              <div key={m} className="row">
                <div className="flex-1">
                  <div>{def.name}</div>
                  {v !== def.weeklyTarget && <div className="text-dim text-[12px]">default {def.weeklyTarget}</div>}
                </div>
                <Stepper value={v} min={1} max={40} onChange={(n) => set(m, n)} />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

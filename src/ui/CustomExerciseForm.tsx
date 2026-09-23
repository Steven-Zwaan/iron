import { useEffect, useMemo, useState } from 'react';
import type { Equipment, Exercise, MeasureMode, MuscleId } from '@/domain/types';
import { CATEGORIES, CATEGORY_NAME, MUSCLE_DEFS, musclesInCategory } from '@/domain/muscles';
import { EQUIPMENT_NAME, EQUIPMENT_ORDER, MEASURE_NAME } from '@/domain/exercises';
import { slugify } from '@/domain/ids';
import { useStore } from '@/app/store';
import { toast } from '@/app/ui';
import { aiEnabled, coach } from '@/ai/client';
import { Sheet } from './Sheet';
import { Stepper } from './Controls';

export interface CustomExerciseFormProps {
  open: boolean;
  onClose: () => void;
  initial?: Exercise; // editing an existing custom exercise
  initialName?: string; // pre-filled from the log parser
  onSaved?: (ex: Exercise) => void;
}

function emptyMap(): Record<MuscleId, number> {
  return Object.fromEntries(MUSCLE_DEFS.map((m) => [m.id, 0])) as Record<MuscleId, number>;
}

/** Custom exercise form (§4.2): name, equipment, measure, rest, and a 0–100 % slider per muscle. */
export function CustomExerciseForm({ open, onClose, initial, initialName, onSaved }: CustomExerciseFormProps) {
  const exercises = useStore((s) => s.exercises);
  const upsert = useStore((s) => s.upsertExercise);
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('machine_stack');
  const [measure, setMeasure] = useState<MeasureMode>('weight');
  const [rest, setRest] = useState(75);
  const [dropPct, setDropPct] = useState(20);
  const [map, setMap] = useState<Record<MuscleId, number>>(emptyMap);
  const [copyFrom, setCopyFrom] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? initialName ?? '');
    setEquipment(initial?.equipment ?? 'machine_stack');
    setMeasure(initial?.measure ?? 'weight');
    setRest(initial?.defaultRestSec ?? 75);
    setDropPct(initial?.dropStepPct ?? 20);
    const m = emptyMap();
    for (const [k, v] of Object.entries(initial?.muscles ?? {})) m[k as MuscleId] = Math.round((v ?? 0) * 100);
    setMap(m);
    setCopyFrom('');
  }, [open, initial, initialName]);

  const sortedExercises = useMemo(() => Object.values(exercises).sort((a, b) => a.name.localeCompare(b.name)), [exercises]);
  const max = Math.max(...Object.values(map));
  const valid = name.trim().length > 0 && max > 0;

  const primaryOnly = (m: MuscleId) => {
    const next = emptyMap();
    next[m] = 100;
    setMap(next);
  };
  const copy = (id: string) => {
    setCopyFrom(id);
    const src = exercises[id];
    if (!src) return;
    const next = emptyMap();
    for (const [k, v] of Object.entries(src.muscles)) next[k as MuscleId] = Math.round((v ?? 0) * 100);
    setMap(next);
    if (!name.trim()) setName(`${src.name} (variation)`);
  };
  const fill = async () => {
    if (!name.trim()) return toast('Type a name first.');
    setBusy(true);
    try {
      const m = await coach.musclemap(name.trim());
      const next = emptyMap();
      for (const [k, v] of Object.entries(m)) if (k in next) next[k as MuscleId] = Math.round((v ?? 0) * 100);
      setMap(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not fill this in.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!valid) return;
    const muscles: Partial<Record<MuscleId, number>> = {};
    for (const [k, v] of Object.entries(map)) if (v > 0) muscles[k as MuscleId] = Math.round((v / max) * 100) / 100; // primary normalised to 1.0
    let id = initial?.id;
    if (!id) {
      const base = slugify(name);
      id = base;
      let n = 2;
      while (exercises[id]) id = `${base}_${n++}`;
    }
    const ex: Exercise = {
      ...(initial ?? {}),
      id,
      name: name.trim(),
      equipment,
      measure,
      defaultRestSec: rest,
      dropStepPct: dropPct,
      muscles,
      custom: true,
    };
    upsert(ex);
    onSaved?.(ex);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit exercise' : 'New exercise'} full>
      <div className="flex flex-col gap-4 pb-2">
        <div className="field">
          <label htmlFor="cx-name">Name</label>
          <input id="cx-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pendulum squat" autoComplete="off" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <label htmlFor="cx-eq">Equipment</label>
            <select id="cx-eq" className="input select" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
              {EQUIPMENT_ORDER.map((e) => (
                <option key={e} value={e}>
                  {EQUIPMENT_NAME[e]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cx-measure">Measured as</label>
            <select id="cx-measure" className="input select" value={measure} onChange={(e) => setMeasure(e.target.value as MeasureMode)}>
              {(Object.keys(MEASURE_NAME) as MeasureMode[]).map((m) => (
                <option key={m} value={m}>
                  {MEASURE_NAME[m]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="label">Default rest</span>
          <Stepper value={rest} min={15} max={300} step={5} onChange={setRest} format={(v) => `${v} s`} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="label">Drop step</span>
          <Stepper value={dropPct} min={5} max={50} step={5} onChange={setDropPct} format={(v) => `${v}%`} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="eyebrow">Muscles</span>
            <span className="text-dim text-[12px]">Highest becomes the primary (100 %)</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <select className="input select !min-h-[36px] !py-0 !w-auto text-[13.5px]" value="" onChange={(e) => e.target.value && primaryOnly(e.target.value as MuscleId)} aria-label="Primary only">
              <option value="">Primary only…</option>
              {MUSCLE_DEFS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select className="input select !min-h-[36px] !py-0 !w-auto text-[13.5px]" value={copyFrom} onChange={(e) => e.target.value && copy(e.target.value)} aria-label="Copy from">
              <option value="">Copy from…</option>
              {sortedExercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {aiEnabled() && (
              <button type="button" className="btn btn-sm" onClick={fill} disabled={busy}>
                {busy ? 'Thinking…' : 'Fill this in for me'}
              </button>
            )}
          </div>
          {CATEGORIES.map((cat) => (
            <div key={cat} className="mb-3">
              <div className="eyebrow mb-1">{CATEGORY_NAME[cat]}</div>
              {musclesInCategory(cat).map((m) => (
                <div key={m} className="grid grid-cols-[96px_1fr_44px] items-center gap-2 min-h-[36px]">
                  <label htmlFor={`cx-m-${m}`} className="text-[13.5px]">
                    {MUSCLE_DEFS.find((d) => d.id === m)?.name}
                  </label>
                  <input
                    id={`cx-m-${m}`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={map[m]}
                    onChange={(e) => setMap({ ...map, [m]: Number(e.target.value) })}
                    className="w-full accent-[var(--t2)]"
                  />
                  <span className="num text-right text-[13px] text-dim">{map[m]}%</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="pt-2">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!valid}>
          {initial ? 'Save changes' : 'Add exercise'}
        </button>
      </div>
    </Sheet>
  );
}

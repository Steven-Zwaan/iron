import { useMemo, useState } from 'react';
import type { PlanItem } from '@/domain/types';
import { WEEKDAY_SHORT } from '@/domain/plan';
import { daySetCount, schemeLabel, schemeOf, warmupFlags } from '@/domain/warmups';
import { useStore } from '@/app/store';
import { useBodyScore } from '@/app/hooks';
import { back, navigate } from '@/app/router';
import { ModalHeader, Stepper } from '@/ui/Controls';
import { SessionQueue } from '@/ui/SessionQueue';
import { ExercisePicker } from '@/ui/ExercisePicker';
import { ExerciseSheet } from '@/ui/ExerciseDetail';
import { CustomExerciseForm } from '@/ui/CustomExerciseForm';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { IconArrowDown, IconArrowUp, IconPlus } from '@/ui/Icons';

/** Plan day editor (§4.3): ordered items, set scheme per item, derived warm-ups. */
export function DayEditor({ dayId }: { dayId: string }) {
  const day = useStore((s) => s.plan.days.find((d) => d.id === dayId));
  const exercises = useStore((s) => s.exercises);
  const debt = useStore((s) => s.state.debt);
  const lastPerformance = useStore((s) => s.state.lastPerformance);
  const updateDay = useStore((s) => s.updateDay);
  const addItem = useStore((s) => s.addItem);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const moveItem = useStore((s) => s.moveItem);
  const deleteDay = useStore((s) => s.deleteDay);
  const savePlan = useStore((s) => s.savePlan);
  const plan = useStore((s) => s.plan);
  const body = useBodyScore(7);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [itemIndex, setItemIndex] = useState<number | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const ids = useMemo(() => day?.items.map((i) => i.exerciseId) ?? [], [day]);
  const flags = useMemo(() => warmupFlags(ids, exercises), [ids, exercises]);
  const selected = useMemo(() => new Set(ids), [ids]);

  if (!day) {
    return (
      <div className="screen modal">
        <ModalHeader title="Day not found" onBack={() => back({ name: 'plan' })} />
      </div>
    );
  }
  const item: PlanItem | undefined = itemIndex == null ? undefined : day.items[itemIndex];
  const itemEx = item ? exercises[item.exerciseId] : undefined;

  const reorder = (newIds: string[]) => {
    const items = newIds.map((id) => day.items.find((i) => i.exerciseId === id)!).filter(Boolean);
    savePlan({ ...plan, days: plan.days.map((d) => (d.id === day.id ? { ...d, items } : d)) });
  };

  return (
    <div className="screen modal">
      <ModalHeader
        title={
          <input
            className="bg-transparent outline-none w-full font-bold text-[19px] border-b border-transparent focus:border-line"
            value={day.label}
            onChange={(e) => updateDay(day.id, { label: e.target.value })}
            aria-label="Day label"
          />
        }
        subtitle={`${day.items.length} exercises · ${daySetCount(day.items, exercises)} sets incl. warm-ups`}
        onBack={() => back({ name: 'plan' })}
        right={
          <select className="input select !w-auto !min-h-[40px] !py-0 text-[13.5px]" value={day.weekday ?? ''} onChange={(e) => updateDay(day.id, { weekday: e.target.value === '' ? undefined : Number(e.target.value) })} aria-label="Weekday">
            <option value="">Any day</option>
            {WEEKDAY_SHORT.map((w, i) => (
              <option key={w} value={i}>
                {w}
              </option>
            ))}
          </select>
        }
      />

      {day.items.length === 0 && <div className="text-dim text-[13.5px] mb-3">No exercises yet. Add some below; the first exercise for each muscle group gets an automatic warm-up.</div>}
      <SessionQueue
        ids={ids}
        onReorder={reorder}
        onTap={(id) => setItemIndex(ids.indexOf(id))}
        nameOf={(id) => exercises[id]?.name ?? id}
        meta={(id) => {
          const i = ids.indexOf(id);
          return schemeLabel(schemeOf(day.items[i]), flags[i] ?? false);
        }}
        debt={debt}
      />

      <button className="btn w-full mt-3" onClick={() => setPickerOpen(true)}>
        <IconPlus size={18} /> Add exercise
      </button>
      <button className="btn btn-accent w-full mt-2" onClick={() => navigate({ name: 'builder', dayId: day.id })} disabled={!day.items.length}>
        Start this day
      </button>
      <button className="btn btn-danger w-full mt-6" onClick={() => setConfirmDel(true)}>
        Delete day
      </button>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add exercises" full>
        <ExercisePicker
          selected={selected}
          onToggle={(id) => {
            const i = ids.indexOf(id);
            if (i >= 0) removeItem(day.id, i);
            else addItem(day.id, id);
          }}
          body={body}
          debt={debt}
          dayItems={ids}
          lastPerformance={lastPerformance}
          onCreateCustom={() => setCustom(true)}
          onInfo={setInfo}
        />
      </Sheet>

      <Sheet open={item != null} onClose={() => setItemIndex(null)} title={itemEx?.name}>
        {item && itemIndex != null && (
          <div className="flex flex-col gap-3">
            <div className="text-dim text-[13.5px]">{schemeLabel(schemeOf(item), flags[itemIndex] ?? false)}</div>
            <div className="flex items-center justify-between gap-3">
              <span className="label">Sets to failure</span>
              <Stepper value={item.workSets} min={1} max={8} onChange={(v) => updateItem(day.id, itemIndex, { workSets: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="label">Dropsets before them</span>
              <Stepper value={item.dropSets} min={0} max={5} onChange={(v) => updateItem(day.id, itemIndex, { dropSets: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="label">Rest override</span>
              <Stepper
                value={item.restSecOverride ?? 0}
                min={0}
                max={300}
                step={15}
                onChange={(v) => updateItem(day.id, itemIndex, { restSecOverride: v || undefined })}
                format={(v) => (v ? `${v} s` : `default ${itemEx?.defaultRestSec ?? ''} s`)}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1" disabled={itemIndex === 0} onClick={() => { moveItem(day.id, itemIndex, itemIndex - 1); setItemIndex(itemIndex - 1); }}>
                <IconArrowUp size={18} /> Up
              </button>
              <button className="btn flex-1" disabled={itemIndex === day.items.length - 1} onClick={() => { moveItem(day.id, itemIndex, itemIndex + 1); setItemIndex(itemIndex + 1); }}>
                <IconArrowDown size={18} /> Down
              </button>
            </div>
            <button className="btn w-full" onClick={() => { setInfo(item.exerciseId); }}>
              Measure mode, alternatives, cues…
            </button>
            <button
              className="btn btn-danger w-full"
              onClick={() => {
                removeItem(day.id, itemIndex);
                setItemIndex(null);
              }}
            >
              Remove from this day
            </button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDel}
        title={`Delete ${day.label}?`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => {
          setConfirmDel(false);
          deleteDay(day.id);
          navigate({ name: 'plan' }, { replace: true });
        }}
      />
      <ExerciseSheet id={info} onClose={() => setInfo(null)} />
      <CustomExerciseForm open={custom} onClose={() => setCustom(false)} onSaved={(ex) => addItem(day.id, ex.id)} />
    </div>
  );
}

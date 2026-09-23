import { useMemo, useState } from 'react';
import type { PlanDay } from '@/domain/types';
import { PLAN_TEMPLATES, WEEKDAY_SHORT, planFromTemplate, seedPlan } from '@/domain/plan';
import { daySetCount } from '@/domain/warmups';
import { plural } from '@/domain/format';
import { newId } from '@/domain/ids';
import { useStore } from '@/app/store';
import { useBodyScore, useDueDay } from '@/app/hooks';
import { navigate } from '@/app/router';
import { toast } from '@/app/ui';
import { aiEnabled, coach } from '@/ai/client';
import { buildContext } from '@/ai/prompts';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { Empty } from '@/ui/Controls';
import { IconArrowDown, IconArrowUp, IconCoach, IconCopy, IconMore, IconPlus, IconTrash } from '@/ui/Icons';

export function Plan() {
  const plan = useStore((s) => s.plan);
  const exercises = useStore((s) => s.exercises);
  const gym = useStore((s) => s.gym);
  const sessions = useStore((s) => s.sessions);
  const debt = useStore((s) => s.state.debt);
  const savePlan = useStore((s) => s.savePlan);
  const addDay = useStore((s) => s.addDay);
  const deleteDay = useStore((s) => s.deleteDay);
  const duplicateDay = useStore((s) => s.duplicateDay);
  const moveDay = useStore((s) => s.moveDay);
  const due = useDueDay();
  const body = useBodyScore(7);
  const [menu, setMenu] = useState<PlanDay | null>(null);
  const [confirmDel, setConfirmDel] = useState<PlanDay | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newWeekday, setNewWeekday] = useState<string>('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRequest, setAiRequest] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDays, setAiDays] = useState<PlanDay[] | null>(null);

  const totalSets = useMemo(() => Object.fromEntries(plan.days.map((d) => [d.id, daySetCount(d.items, exercises)])), [plan.days, exercises]);

  const createDay = () => {
    const d = addDay(newLabel.trim() || `Day ${plan.days.length + 1}`, newWeekday === '' ? undefined : Number(newWeekday));
    setAddOpen(false);
    setNewLabel('');
    setNewWeekday('');
    navigate({ name: 'day', id: d.id });
  };

  const askAi = async () => {
    if (!aiRequest.trim()) return;
    setAiBusy(true);
    try {
      const ctx = buildContext({ gym, exercises, body, due, debt, sessions });
      const inventory = gym.available.map((id) => exercises[id]).filter(Boolean).map((e) => ({ id: e.id, name: e.name }));
      const r = await coach.plan(aiRequest.trim(), ctx, plan.days, inventory);
      setAiDays(r.days.map((d) => ({ id: newId('day'), label: d.label, weekday: d.weekday ?? undefined, items: d.items.map((it) => ({ exerciseId: it.exerciseId, workSets: it.workSets, dropSets: it.dropSets })) })));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The coach could not build a plan.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="flex items-start justify-between mb-3">
        <h1 className="text-[30px] font-bold leading-none">Plan</h1>
        <div className="flex gap-1 -mr-2">
          {aiEnabled() && (
            <button className="btn-icon" onClick={() => setAiOpen(true)} aria-label="Build with Claude">
              <IconCoach />
            </button>
          )}
          <button className="btn-icon" onClick={() => setAddOpen(true)} aria-label="Add day">
            <IconPlus />
          </button>
        </div>
      </div>

      {plan.days.length === 0 && (
        <section className="card">
          <Empty title="No training days yet" body="Start from a template, use the default Monday/Thursday split, or add a day and build it yourself." />
          <div className="flex flex-col gap-2">
            {PLAN_TEMPLATES.map((t) => (
              <button key={t.id} className="btn w-full justify-between" onClick={() => savePlan(planFromTemplate(t))}>
                <span>{t.name}</span>
                <span className="text-dim text-[13px]">{t.description}</span>
              </button>
            ))}
            <button className="btn w-full" onClick={() => savePlan(seedPlan())}>
              Monday / Thursday split
            </button>
            <button className="btn w-full" onClick={() => setAddOpen(true)}>
              <IconPlus size={18} /> Add an empty day
            </button>
          </div>
        </section>
      )}

      {plan.days.map((d) => (
        <section key={d.id} className="card">
          <div className="flex items-center gap-2 mb-2">
            <button className="flex-1 text-left min-w-0" onClick={() => navigate({ name: 'day', id: d.id })}>
              <div className="flex items-center gap-2">
                <span className="text-[19px] font-bold truncate">{d.label}</span>
                {d.weekday != null && <span className="pill">{WEEKDAY_SHORT[d.weekday]}</span>}
                {due?.id === d.id && <span className="pill ok">up next</span>}
              </div>
              <div className="text-dim text-[13px] num">
                {plural(d.items.length, 'exercise')} · {totalSets[d.id]} sets incl. warm-ups
              </div>
            </button>
            <button className="btn-icon" onClick={() => setMenu(d)} aria-label={`Options for ${d.label}`}>
              <IconMore />
            </button>
          </div>
          <ol className="mb-3">
            {d.items.slice(0, 8).map((it, i) => (
              <li key={`${it.exerciseId}-${i}`} className="text-[14px] text-dim truncate">
                <span className="num inline-block w-5">{i + 1}</span>
                {exercises[it.exerciseId]?.name ?? it.exerciseId}
              </li>
            ))}
            {d.items.length > 8 && <li className="text-dim text-[13px] pl-5">+{d.items.length - 8} more</li>}
            {d.items.length === 0 && <li className="text-dim text-[13.5px]">Empty. Tap to add exercises.</li>}
          </ol>
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={() => navigate({ name: 'day', id: d.id })}>
              Edit
            </button>
            <button className="btn btn-accent flex-1" onClick={() => navigate({ name: 'builder', dayId: d.id })} disabled={!d.items.length}>
              Start this day
            </button>
          </div>
        </section>
      ))}

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.label}>
        {menu && (
          <div className="flex flex-col gap-2">
            <button
              className="btn w-full justify-start"
              onClick={() => {
                duplicateDay(menu.id);
                setMenu(null);
              }}
            >
              <IconCopy size={18} /> Duplicate
            </button>
            <div className="flex gap-2">
              <button
                className="btn flex-1"
                disabled={plan.days.indexOf(menu) === 0}
                onClick={() => {
                  const i = plan.days.indexOf(menu);
                  moveDay(i, i - 1);
                  setMenu(null);
                }}
              >
                <IconArrowUp size={18} /> Move up
              </button>
              <button
                className="btn flex-1"
                disabled={plan.days.indexOf(menu) === plan.days.length - 1}
                onClick={() => {
                  const i = plan.days.indexOf(menu);
                  moveDay(i, i + 1);
                  setMenu(null);
                }}
              >
                <IconArrowDown size={18} /> Move down
              </button>
            </div>
            <button
              className="btn btn-danger w-full justify-start"
              onClick={() => {
                setConfirmDel(menu);
                setMenu(null);
              }}
            >
              <IconTrash size={18} /> Delete day
            </button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!confirmDel}
        title={`Delete ${confirmDel?.label ?? ''}?`}
        body="Past sessions keep their history."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => {
          if (confirmDel) deleteDay(confirmDel.id);
          setConfirmDel(null);
        }}
      />

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="New day">
        <div className="field mb-3">
          <label htmlFor="day-label">Label</label>
          <input id="day-label" className="input" placeholder="Push A, Heavy day, Monday…" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        </div>
        <div className="field mb-4">
          <label htmlFor="day-wd">Weekday (optional, only used to suggest what is due)</label>
          <select id="day-wd" className="input select" value={newWeekday} onChange={(e) => setNewWeekday(e.target.value)}>
            <option value="">No fixed weekday</option>
            {WEEKDAY_SHORT.map((w, i) => (
              <option key={w} value={i}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={createDay}>
          Create and add exercises
        </button>
      </Sheet>

      <Sheet open={aiOpen} onClose={() => setAiOpen(false)} title="Build with Claude" full>
        {!aiDays ? (
          <>
            <div className="text-dim text-[13.5px] mb-3">Describe what you want. The coach only uses exercises that are in your gym, and you review the result before it replaces anything.</div>
            <textarea className="input" placeholder="e.g. Three days a week, upper/lower/full, keep my Monday but add legs and abs. Two sets to failure." value={aiRequest} onChange={(e) => setAiRequest(e.target.value)} />
            <button className="btn btn-primary mt-3" onClick={askAi} disabled={aiBusy || !aiRequest.trim()}>
              {aiBusy ? 'Building…' : 'Build plan'}
            </button>
          </>
        ) : (
          <>
            {aiDays.map((d) => (
              <div key={d.id} className="mb-3">
                <div className="font-bold">
                  {d.label} {d.weekday != null && <span className="pill ml-1">{WEEKDAY_SHORT[d.weekday]}</span>}
                </div>
                <ol className="text-[14px] text-dim">
                  {d.items.map((it, i) => (
                    <li key={i}>
                      {exercises[it.exerciseId]?.name ?? it.exerciseId} · {it.dropSets ? `${it.dropSets} dropset + ` : ''}
                      {it.workSets} to failure
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <button className="btn flex-1" onClick={() => setAiDays(null)}>
                Try again
              </button>
              <button
                className="btn btn-primary flex-1 !min-h-[48px]"
                onClick={() => {
                  savePlan({ ...plan, days: aiDays });
                  setAiDays(null);
                  setAiOpen(false);
                  toast('Plan replaced');
                }}
              >
                Use this plan
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

import { useMemo, useState } from 'react';
import gymDefaults from '@shared/data/gym-defaults.json';
import type { Equipment, Exercise, MuscleCategory, Unit } from '@/domain/types';
import { CATEGORIES, CATEGORY_NAME } from '@/domain/muscles';
import { CATALOGUE, EQUIPMENT_NAME, EQUIPMENT_ORDER, matchesQuery, primaryCategory, primaryMuscle } from '@/domain/exercises';
import { muscleName } from '@/domain/muscles';
import { fmtNum } from '@/domain/weights';
import { useStore } from '@/app/store';
import { back } from '@/app/router';
import { ModalHeader, Segmented } from '@/ui/Controls';
import { CustomExerciseForm } from '@/ui/CustomExerciseForm';
import { IconChevronDown, IconChevronRight, IconPlus, IconSearch } from '@/ui/Icons';

const INCREMENT_EQUIPMENT: Equipment[] = ['machine_stack', 'cable_stack', 'plate_loaded', 'barbell', 'bodyweight'];

function parseList(text: string): number[] {
  return [...new Set(text.split(/[,\s;]+/).map((t) => Number(t.replace(',', '.'))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
}

/** Step 1 of setup (§4.1): units, increments, dumbbell rack, bar and plates. */
export function GymEquipment() {
  const gym = useStore((s) => s.gym);
  const saveGym = useStore((s) => s.saveGym);
  const [dbText, setDbText] = useState(() => gym.dumbbells.map(fmtNum).join(', '));
  const [platesText, setPlatesText] = useState(() => gym.plates.map(fmtNum).join(', '));

  const setUnit = (unit: Unit) => {
    if (unit === gym.unit) return;
    const d = gymDefaults[unit];
    saveGym({ unit, increments: { ...(d.increments as Record<Equipment, number>) }, dumbbells: [...d.dumbbells], barWeight: d.barWeight, plates: [...d.plates] });
    setDbText(d.dumbbells.map(fmtNum).join(', '));
    setPlatesText(d.plates.map(fmtNum).join(', '));
  };

  const grid = useMemo(() => {
    const base = gymDefaults[gym.unit].dumbbells as number[];
    const all = [...new Set([...base, ...gym.dumbbells])].sort((a, b) => a - b);
    return all;
  }, [gym.unit, gym.dumbbells]);

  const toggleDb = (w: number) => {
    const set = new Set(gym.dumbbells);
    set.has(w) ? set.delete(w) : set.add(w);
    const list = [...set].sort((a, b) => a - b);
    saveGym({ dumbbells: list });
    setDbText(list.map(fmtNum).join(', '));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label mb-1.5">Unit</div>
        <Segmented<Unit> value={gym.unit} onChange={setUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
      </div>
      <div>
        <div className="label mb-1.5">Equipment increments</div>
        <div className="grid grid-cols-2 gap-2">
          {INCREMENT_EQUIPMENT.map((eq) => (
            <label key={eq} className="flex items-center gap-2 text-[13.5px]">
              <span className="flex-1 text-dim">{EQUIPMENT_NAME[eq]}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                className="input !min-h-[40px] w-20 num text-right"
                value={gym.increments[eq]}
                onChange={(e) => saveGym({ increments: { ...gym.increments, [eq]: Number(e.target.value) || 0 } })}
                aria-label={`${EQUIPMENT_NAME[eq]} step`}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-[13.5px]">
            <span className="flex-1 text-dim">Bar weight</span>
            <input type="number" inputMode="decimal" step="0.5" min="0" className="input !min-h-[40px] w-20 num text-right" value={gym.barWeight} onChange={(e) => saveGym({ barWeight: Number(e.target.value) || 0 })} aria-label="Bar weight" />
          </label>
        </div>
        <div className="text-dim text-[12px] mt-1">Plate-loaded is per side; the scrubber shows the total.</div>
      </div>
      <div>
        <div className="label mb-1.5">Dumbbell rack ({gym.unit})</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {grid.map((w) => (
            <button key={w} type="button" className={`chip num !min-w-[48px]${gym.dumbbells.includes(w) ? ' on' : ''}`} onClick={() => toggleDb(w)} aria-pressed={gym.dumbbells.includes(w)}>
              {fmtNum(w)}
            </button>
          ))}
        </div>
        <input
          className="input num"
          value={dbText}
          onChange={(e) => setDbText(e.target.value)}
          onBlur={() => {
            const list = parseList(dbText);
            if (list.length) saveGym({ dumbbells: list });
            setDbText(list.map(fmtNum).join(', '));
          }}
          aria-label="Dumbbell list"
        />
        <div className="text-dim text-[12px] mt-1">Only these weights can be logged for dumbbell exercises.</div>
      </div>
      <div>
        <div className="label mb-1.5">Plates per side ({gym.unit})</div>
        <input
          className="input num"
          value={platesText}
          onChange={(e) => setPlatesText(e.target.value)}
          onBlur={() => {
            const list = parseList(platesText);
            if (list.length) saveGym({ plates: list });
            setPlatesText(list.map(fmtNum).join(', '));
          }}
          aria-label="Plate list"
        />
      </div>
    </div>
  );
}

/** Step 2 of setup (§4.1): the gym inventory checklist grouped by category then equipment. */
export function GymInventory() {
  const exercises = useStore((s) => s.exercises);
  const gym = useStore((s) => s.gym);
  const setAvailable = useStore((s) => s.setAvailable);
  const saveGym = useStore((s) => s.saveGym);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(['chest']));
  const [custom, setCustom] = useState(false);
  const available = useMemo(() => new Set(gym.available), [gym.available]);

  const groups = useMemo(() => {
    const out: { cat: MuscleCategory; groups: { eq: Equipment; list: Exercise[] }[]; total: number; on: number }[] = [];
    for (const cat of CATEGORIES) {
      const inCat = Object.values(exercises).filter((e) => primaryCategory(e) === cat && (!query || matchesQuery(e, query)));
      const byEq = EQUIPMENT_ORDER.map((eq) => ({ eq, list: inCat.filter((e) => e.equipment === eq).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.list.length);
      out.push({ cat, groups: byEq, total: inCat.length, on: inCat.filter((e) => available.has(e.id)).length });
    }
    return out;
  }, [exercises, query, available]);

  const totalOn = gym.available.filter((id) => exercises[id]).length;
  const catsOn = CATEGORIES.filter((c) => Object.values(exercises).some((e) => primaryCategory(e) === c && available.has(e.id))).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="input flex items-center gap-2 flex-1">
          <IconSearch size={18} className="text-dim" />
          <input className="flex-1 bg-transparent outline-none min-w-0" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
        </label>
        <button type="button" className="btn btn-sm" onClick={() => saveGym({ available: CATALOGUE.map((e) => e.id).concat(Object.values(exercises).filter((e) => e.custom).map((e) => e.id)) })}>
          Typical gym
        </button>
      </div>
      {groups.map((g) => {
        const isOpen = !!query || open.has(g.cat);
        return (
          <div key={g.cat} className="mb-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="cat-head flex-1"
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    n.has(g.cat) ? n.delete(g.cat) : n.add(g.cat);
                    return n;
                  })
                }
                aria-expanded={isOpen}
              >
                <span className="text-dim">{isOpen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}</span>
                <span className="eyebrow !text-text flex-1 text-left">{CATEGORY_NAME[g.cat]}</span>
                <span className="num text-dim text-[13px]">
                  {g.on} of {g.total}
                </span>
              </button>
              <button type="button" className="link" onClick={() => setAvailable(g.groups.flatMap((x) => x.list.map((e) => e.id)), true)}>
                All
              </button>
              <button type="button" className="link !text-dim" onClick={() => setAvailable(g.groups.flatMap((x) => x.list.map((e) => e.id)), false)}>
                None
              </button>
            </div>
            {isOpen &&
              g.groups.map((eqGroup) => (
                <div key={eqGroup.eq} className="pl-2">
                  <div className="eyebrow !text-dim2 mt-1 mb-0.5 pl-2">{EQUIPMENT_NAME[eqGroup.eq]}</div>
                  {eqGroup.list.map((e) => {
                    const on = available.has(e.id);
                    return (
                      <button key={e.id} type="button" className={`ex-row${on ? ' in' : ' off'}`} onClick={() => setAvailable([e.id], !on)} aria-pressed={on}>
                        <span className={`check${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block truncate">{e.name}</span>
                          <span className="ghost block">{muscleName(primaryMuscle(e))}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        );
      })}
      <button type="button" className="btn w-full mt-2" onClick={() => setCustom(true)}>
        <IconPlus size={18} /> Add exercise not in this list
      </button>
      <div className="text-dim text-[13px] text-center mt-3 num">
        {totalOn} exercises across {catsOn} categories
      </div>
      <CustomExerciseForm open={custom} onClose={() => setCustom(false)} />
    </div>
  );
}

/** Settings → Gym profile (re-enter setup). */
export function GymSetup() {
  const [tab, setTab] = useState<'equipment' | 'inventory'>('inventory');
  return (
    <div className="screen modal">
      <ModalHeader title="Your gym" subtitle="What exists, and how the weights step" onBack={() => back({ name: 'settings' })} />
      <div className="mb-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'inventory', label: 'Exercises' }, { value: 'equipment', label: 'Units & increments' }]} />
      </div>
      {tab === 'inventory' ? <GymInventory /> : <GymEquipment />}
    </div>
  );
}

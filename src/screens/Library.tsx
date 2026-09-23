import { useMemo, useState } from 'react';
import { EQUIPMENT_NAME, matchesQuery, primaryMuscle } from '@/domain/exercises';
import { muscleName } from '@/domain/muscles';
import { useStore } from '@/app/store';
import { back, navigate } from '@/app/router';
import { ModalHeader } from '@/ui/Controls';
import { CustomExerciseForm } from '@/ui/CustomExerciseForm';
import { IconChevronRight, IconPlus, IconSearch } from '@/ui/Icons';

/** Settings → Exercise library: browse everything, custom exercises first. */
export function Library() {
  const exercises = useStore((s) => s.exercises);
  const available = useStore((s) => s.gym.available);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState(false);
  const list = useMemo(() => {
    const avail = new Set(available);
    return Object.values(exercises)
      .filter((e) => matchesQuery(e, query))
      .sort((a, b) => Number(!!b.custom) - Number(!!a.custom) || Number(avail.has(b.id)) - Number(avail.has(a.id)) || a.name.localeCompare(b.name));
  }, [exercises, query, available]);
  const avail = new Set(available);
  return (
    <div className="screen modal">
      <ModalHeader
        title="Exercise library"
        subtitle={`${Object.keys(exercises).length} exercises`}
        onBack={() => back({ name: 'settings' })}
        right={
          <button className="btn-icon" onClick={() => setCustom(true)} aria-label="New exercise">
            <IconPlus />
          </button>
        }
      />
      <label className="input flex items-center gap-2 mb-2">
        <IconSearch size={18} className="text-dim" />
        <input className="flex-1 bg-transparent outline-none min-w-0" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
      </label>
      {list.map((e) => (
        <button key={e.id} className={`list-btn${avail.has(e.id) ? '' : ' opacity-60'}`} onClick={() => navigate({ name: 'exercise', id: e.id })}>
          <span className="flex-1 min-w-0">
            <span className="block truncate">
              {e.name} {e.custom && <span className="pill ml-1">custom</span>}
            </span>
            <span className="ghost block">
              {EQUIPMENT_NAME[e.equipment]} · {muscleName(primaryMuscle(e))}
              {avail.has(e.id) ? '' : ' · not in your gym'}
            </span>
          </span>
          <IconChevronRight className="text-dim2" />
        </button>
      ))}
      <CustomExerciseForm open={custom} onClose={() => setCustom(false)} />
    </div>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import type { BodyScore, Exercise, LastPerformance, MuscleCategory } from '@/domain/types';
import { CATEGORIES, CATEGORY_NAME, musclesInCategory } from '@/domain/muscles';
import { matchesQuery, primaryCategory } from '@/domain/exercises';
import { categorySummary } from '@/domain/scoring';
import { formatWeight } from '@/domain/weights';
import { useStore } from '@/app/store';
import { Chip, TierDot } from './Controls';
import { IconChevronDown, IconChevronRight, IconInfo, IconPlus, IconSearch, IconWarn } from './Icons';
import { ConfirmSheet } from './Sheet';

export interface ExercisePickerProps {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  body: BodyScore;
  debt?: Record<string, number>;
  dayItems?: string[];
  lastPerformance?: Record<string, LastPerformance>;
  excludeIds?: ReadonlySet<string>;
  onCreateCustom?: () => void;
  onInfo?: (id: string) => void;
  initiallyOpen?: MuscleCategory[];
  header?: ReactNode;
}

/**
 * Category-grouped exercise picker (§4.4), reused by the session builder, plan editor,
 * swap sheet and mid-session add. Shows gym-available exercises by default with a
 * `Show everything` toggle; picking a greyed one adds it to the gym in one tap.
 */
export function ExercisePicker({ selected, onToggle, body, debt = {}, dayItems = [], lastPerformance = {}, excludeIds, onCreateCustom, onInfo, initiallyOpen = [], header }: ExercisePickerProps) {
  const exercises = useStore((s) => s.exercises);
  const gym = useStore((s) => s.gym);
  const setAvailable = useStore((s) => s.setAvailable);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<MuscleCategory>>(() => new Set(initiallyOpen));
  const [showAll, setShowAll] = useState(false);
  const [askAdd, setAskAdd] = useState<Exercise | null>(null);

  const available = useMemo(() => new Set(gym.available), [gym.available]);
  const searching = query.trim().length > 0;
  const dayRank = useMemo(() => new Map(dayItems.map((id, i) => [id, i])), [dayItems]);

  const grouped = useMemo(() => {
    const byCat: Record<MuscleCategory, Exercise[]> = { chest: [], back: [], shoulders: [], arms: [], legs: [], core: [] };
    for (const ex of Object.values(exercises)) {
      if (excludeIds?.has(ex.id)) continue;
      if (!showAll && !available.has(ex.id) && !selected.has(ex.id)) continue;
      if (searching && !matchesQuery(ex, query)) continue;
      byCat[primaryCategory(ex)].push(ex);
    }
    for (const cat of CATEGORIES) {
      byCat[cat].sort((a, b) => {
        const oa = (debt[a.id] ?? 0) > 0 ? 0 : 1;
        const ob = (debt[b.id] ?? 0) > 0 ? 0 : 1;
        if (oa !== ob) return oa - ob;
        const da = dayRank.has(a.id) ? 0 : 1;
        const db = dayRank.has(b.id) ? 0 : 1;
        if (da !== db) return da - db;
        if (da === 0 && db === 0) return (dayRank.get(a.id) ?? 0) - (dayRank.get(b.id) ?? 0);
        const ra = lastPerformance[a.id]?.at ?? 0;
        const rb = lastPerformance[b.id]?.at ?? 0;
        if (ra !== rb) return rb - ra;
        return a.name.localeCompare(b.name);
      });
    }
    return byCat;
  }, [exercises, excludeIds, showAll, available, selected, searching, query, debt, dayRank, lastPerformance]);

  const toggleCat = (cat: MuscleCategory) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });

  const tap = (ex: Exercise) => {
    if (!available.has(ex.id) && !selected.has(ex.id)) {
      setAskAdd(ex);
      return;
    }
    onToggle(ex.id);
  };

  return (
    <div>
      {header}
      <label className="input flex items-center gap-2 mb-2">
        <IconSearch size={18} className="text-dim flex-none" />
        <input className="flex-1 bg-transparent outline-none min-w-0" placeholder="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
        {query && (
          <button type="button" className="text-dim text-[13px] font-semibold" onClick={() => setQuery('')}>
            Clear
          </button>
        )}
      </label>
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-dim text-[12px]">{showAll ? 'Showing everything. Greyed rows are not in your gym.' : 'Your gym only.'}</span>
        <Chip on={showAll} onClick={() => setShowAll((v) => !v)}>
          Show everything
        </Chip>
      </div>

      {CATEGORIES.map((cat) => {
        const list = grouped[cat];
        if (searching && !list.length) return null;
        const sum = categorySummary(body, musclesInCategory(cat));
        const isOpen = searching || open.has(cat);
        const owedInCat = list.filter((e) => (debt[e.id] ?? 0) > 0).length;
        const inQueue = list.filter((e) => selected.has(e.id)).length;
        return (
          <div key={cat}>
            <button type="button" className="cat-head" onClick={() => toggleCat(cat)} aria-expanded={isOpen}>
              <span className="text-dim">{isOpen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}</span>
              <span className="eyebrow !text-text flex-1 text-left">{CATEGORY_NAME[cat]}</span>
              {owedInCat > 0 && (
                <span className="pill warn">
                  <IconWarn size={12} /> {owedInCat} owed
                </span>
              )}
              {inQueue > 0 && <span className="pill">{inQueue} in</span>}
              <TierDot tier={sum.tier} />
              <span className="num text-[13px] text-dim w-[52px] text-right">
                {Math.round(sum.eff * 10) / 10}/{sum.target}
              </span>
            </button>
            {isOpen && (
              <div className="pb-1">
                {list.length === 0 && <div className="text-dim text-[13px] pl-[44px] py-2">No exercises here yet.</div>}
                {list.map((ex) => {
                  const on = selected.has(ex.id);
                  const off = !available.has(ex.id);
                  const lp = lastPerformance[ex.id];
                  const owed = (debt[ex.id] ?? 0) > 0;
                  return (
                    <div key={ex.id} className={`ex-row${on ? ' in' : ''}${off ? ' off' : ''}`}>
                      <button type="button" className="flex items-center gap-3 flex-1 min-w-0 min-h-[40px] text-left" onClick={() => tap(ex)} aria-pressed={on}>
                        <span className={`check${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{ex.name}</span>
                          {lp && lp.weight != null && (
                            <span className="ghost num block">
                              {'⟲'} last {formatWeight(lp.weight, ex, gym.unit, { withUnit: ex.measure === 'weight' })}
                              {lp.reps != null ? ` × ${lp.reps}` : ''}
                            </span>
                          )}
                        </span>
                        {owed && (
                          <span className="pill warn">
                            <IconWarn size={12} /> owed
                          </span>
                        )}
                      </button>
                      {onInfo && (
                        <button type="button" className="btn-icon !w-10" onClick={() => onInfo(ex.id)} aria-label={`About ${ex.name}`}>
                          <IconInfo size={18} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {onCreateCustom && (
        <button type="button" className="btn w-full mt-3" onClick={onCreateCustom}>
          <IconPlus size={18} /> Add exercise not in this list
        </button>
      )}

      <ConfirmSheet
        open={!!askAdd}
        title="Add to your gym?"
        body={askAdd ? `${askAdd.name} is not in your gym inventory yet. Adding it makes it show up everywhere.` : ''}
        confirmLabel="Add and select"
        onCancel={() => setAskAdd(null)}
        onConfirm={() => {
          if (askAdd) {
            setAvailable([askAdd.id], true);
            onToggle(askAdd.id);
          }
          setAskAdd(null);
        }}
      />
    </div>
  );
}

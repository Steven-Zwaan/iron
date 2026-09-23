import { owedIds } from '@/domain/debt';
import { useStore } from '@/app/store';
import { back } from '@/app/router';
import { Empty, ModalHeader } from '@/ui/Controls';
import { IconWarn } from '@/ui/Icons';

/** Settings → Owed exercises: the forgiveness valve (§4.5). */
export function Owed() {
  const debt = useStore((s) => s.state.debt);
  const exercises = useStore((s) => s.exercises);
  const clearDebt = useStore((s) => s.clearDebt);
  const owed = owedIds(debt);
  return (
    <div className="screen modal">
      <ModalHeader
        title="Owed exercises"
        subtitle="Skipped last time; added to your next session automatically"
        onBack={() => back({ name: 'settings' })}
        right={
          owed.length ? (
            <button className="link" onClick={() => clearDebt()}>
              Clear all
            </button>
          ) : undefined
        }
      />
      {owed.length === 0 && <Empty title="Nothing owed" body="Skip an exercise during a session and it shows up here until you do it." />}
      {owed.map((id) => (
        <div key={id} className="row">
          <IconWarn size={18} className="text-t4 flex-none" />
          <div className="flex-1">
            <div className="font-medium">{exercises[id]?.name ?? id}</div>
            <div className="text-dim text-[13px]">
              missed {debt[id]} {debt[id] === 1 ? 'session' : 'sessions'}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => clearDebt(id)}>
            Clear
          </button>
        </div>
      ))}
    </div>
  );
}

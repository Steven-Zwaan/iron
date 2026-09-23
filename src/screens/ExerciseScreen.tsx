import { useStore } from '@/app/store';
import { back } from '@/app/router';
import { ModalHeader } from '@/ui/Controls';
import { ExerciseDetail } from '@/ui/ExerciseDetail';

/** Full-screen exercise detail (route #/exercise/:id). */
export function ExerciseScreen({ id }: { id: string }) {
  const ex = useStore((s) => s.exercises[id]);
  return (
    <div className="screen modal">
      <ModalHeader title={ex?.name ?? 'Exercise'} onBack={() => back({ name: 'progress' })} />
      {ex ? <ExerciseDetail id={id} onDeleted={() => back({ name: 'library' })} /> : <div className="text-dim">This exercise no longer exists.</div>}
    </div>
  );
}

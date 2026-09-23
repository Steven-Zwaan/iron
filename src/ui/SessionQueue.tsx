import type { ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from './dndModifiers';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconClose, IconGrip, IconWarn } from './Icons';

export interface SessionQueueProps {
  ids: string[];
  onReorder: (ids: string[]) => void;
  onRemove?: (id: string) => void;
  onTap?: (id: string) => void;
  nameOf: (id: string) => string;
  meta?: (id: string) => ReactNode;
  debt?: Record<string, number>;
  activeId?: string;
  doneIds?: ReadonlySet<string>;
  numbered?: boolean;
}

function Row({ id, index, name, meta, owed, active, done, onRemove, onTap, numbered }: { id: string; index: number; name: string; meta?: ReactNode; owed: boolean; active: boolean; done: boolean; onRemove?: () => void; onTap?: () => void; numbered: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={`queue-row${isDragging ? ' dragging' : ''}${active ? ' bg-surf2' : ''}`}>
      {numbered && <span className={`num w-6 text-center text-[13px] font-semibold ${done ? 'text-t1' : 'text-dim'}`}>{done ? '✓' : index + 1}</span>}
      <button type="button" className={`flex-1 min-w-0 text-left min-h-[44px] flex items-center gap-2${done ? ' text-dim' : ''}`} onClick={onTap} disabled={!onTap}>
        <span className="flex-1 min-w-0">
          <span className={`block truncate${active ? ' font-semibold' : ''}`}>{name}</span>
          {meta && <span className="ghost block">{meta}</span>}
        </span>
        {owed && (
          <span className="pill warn">
            <IconWarn size={12} /> owed
          </span>
        )}
      </button>
      <button type="button" ref={setActivatorNodeRef} className="drag-handle" aria-label={`Reorder ${name}`} {...attributes} {...listeners}>
        <IconGrip />
      </button>
      {onRemove && (
        <button type="button" className="btn-icon !w-10 !h-10 !min-h-0" onClick={onRemove} aria-label={`Remove ${name}`}>
          <IconClose size={18} />
        </button>
      )}
    </div>
  );
}

/** Drag-to-reorder queue (§4.4 #6). Long-press lifts a row; keyboard reordering is supported. */
export function SessionQueue({ ids, onReorder, onRemove, onTap, nameOf, meta, debt = {}, activeId, doneIds, numbered = true }: SessionQueueProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-0.5" role="list">
          {ids.map((id, i) => (
            <Row
              key={id}
              id={id}
              index={i}
              name={nameOf(id)}
              meta={meta?.(id)}
              owed={(debt[id] ?? 0) > 0}
              active={id === activeId}
              done={!!doneIds?.has(id)}
              onRemove={onRemove ? () => onRemove(id) : undefined}
              onTap={onTap ? () => onTap(id) : undefined}
              numbered={numbered}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

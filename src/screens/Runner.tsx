import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BodyScore, Exercise, SetLog } from '@/domain/types';
import {
  activeSet,
  addExercise,
  addSet,
  allComplete,
  commitSegment,
  currentExerciseId,
  deleteSet,
  exerciseComplete,
  jumpTo,
  lastLoggedWeight,
  logSet,
  nextExercise,
  remainingSetCount,
  reorderQueue,
  setPendingReps,
  setScratchWeight,
  setSetReps,
  skipExercise,
  swapExercise,
  unlogSet,
  updateSetSegments,
} from '@/domain/session';
import { dropWeight, formatWeight, snap, ticksFor, warmupWeight } from '@/domain/weights';
import { rankAlternatives } from '@/domain/alternatives';
import { musclesSorted } from '@/domain/exercises';
import { muscleName } from '@/domain/muscles';
import { computeBodyScore } from '@/domain/scoring';
import { useStore } from '@/app/store';
import { useBodyScore } from '@/app/hooks';
import { navigate } from '@/app/router';
import { primeAudio, releaseWakeLock, requestWakeLock, rest as restPlatform, showNotificationNow, vibrate } from '@/app/platform';
import { toast, useUI } from '@/app/ui';
import { WeightScrubber } from '@/ui/WeightScrubber';
import { SetStack, setTitle } from '@/ui/SetStack';
import { RestTimer } from '@/ui/RestTimer';
import { SessionQueue } from '@/ui/SessionQueue';
import { ExercisePicker } from '@/ui/ExercisePicker';
import { ExerciseSheet } from '@/ui/ExerciseDetail';
import { SetEditorSheet } from '@/ui/SetEditor';
import { KeypadSheet } from '@/ui/Keypad';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { IconChevronDown, IconClose, IconDrop, IconMore, IconSkip, IconSwap, IconWarn } from '@/ui/Icons';

interface RestState {
  endsAt: number;
  totalSec: number;
  exId: string;
  setId: string;
  label: string;
  chips: number[] | null;
}

function chipRange(lastReps: number | null | undefined): number[] {
  const base = lastReps ?? 9;
  const lo = Math.max(1, base - 3);
  return Array.from({ length: 6 }, (_, i) => lo + i);
}

export function Runner() {
  const session = useStore((s) => s.active);
  const exercises = useStore((s) => s.exercises);
  const gym = useStore((s) => s.gym);
  const settings = useStore((s) => s.state.settings);
  const debt = useStore((s) => s.state.debt);
  const lastPerf = useStore((s) => s.state.lastPerformance);
  const coachCache = useStore((s) => s.state.coachCache);
  const updateActive = useStore((s) => s.updateActive);
  const finishSession = useStore((s) => s.finishSession);
  const preBody = useBodyScore(7);

  const [rest, setRest] = useState<RestState | null>(null);
  const [repsChosen, setRepsChosen] = useState<number | null>(null);
  const [otherReps, setOtherReps] = useState(false);
  const [pendingChipIndex, setPendingChipIndex] = useState<number | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<SetLog | null>(null);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);

  // Wake lock for the whole session (§6.6).
  useEffect(() => {
    void requestWakeLock();
    return () => releaseWakeLock();
  }, []);

  const exId = session ? currentExerciseId(session) : undefined;
  const ex: Exercise | undefined = exId ? exercises[exId] : undefined;
  const log = session && exId ? session.logs[exId] : undefined;
  const set = session ? activeSet(session) : undefined;
  const ticks = useMemo(() => (ex ? ticksFor(ex, gym) : []), [ex, gym]);
  const last = exId ? lastPerf[exId] : undefined;
  const pending = session?.scratch?.pendingSegments ?? [];
  const weight = session?.scratch?.weight ?? null;

  // Carry-over preset whenever the active set changes (§6.2).
  const presetKey = `${session?.id}|${exId}|${set?.id ?? 'none'}`;
  const presetFor = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !ex || !set || presetFor.current === presetKey) return;
    presetFor.current = presetKey;
    let working = lastLoggedWeight(log) ?? last?.weight ?? null;
    if (working == null && set.type !== 'warmup') {
      // First ever working set: the warm-up was half the working weight by our own rule, so double it back.
      const warm = lastLoggedWeight(log, { includeWarmup: true });
      if (warm != null && ticks.length) working = snap(ticks, warm * 2);
    }
    const w = set.type === 'warmup' ? warmupWeight(ticks, working) : working;
    if (w !== session.scratch?.weight || pending.length) updateActive((s) => setScratchWeight(s, w));
    setPendingChipIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);

  const setWeight = useCallback((w: number | null) => updateActive((s) => setScratchWeight(s, w)), [updateActive]);

  if (!session) return null;

  const complete = exerciseComplete(log);
  const everything = allComplete(session);
  const chain = !!set && (set.type === 'drop' || pending.length > 0);
  const exIndex = session.cursor.exIndex;
  const owed = exId ? (debt[exId] ?? 0) > 0 : false;

  const startRest = (forSet: SetLog, logRestSec: number, lastOfExercise: boolean) => {
    if (!ex || !exId) return;
    const total = Math.max(15, Math.round(lastOfExercise ? logRestSec * 0.8 : logRestSec));
    const endsAt = Date.now() + total * 1000;
    const title = log ? setTitle(log.sets, log.sets.findIndex((x) => x.id === forSet.id)) : 'Set';
    const finalSeg = forSet.segments[forSet.segments.length - 1];
    setRest({ endsAt, totalSec: total, exId, setId: forSet.id, label: `${title} · ${formatWeight(finalSeg?.weight, ex, gym.unit, { withUnit: ex.measure === 'weight' })}`, chips: settings.repChipsOnRest ? chipRange(last?.reps) : null });
    setRepsChosen(null);
    restPlatform.start(endsAt, ex.name);
  };

  const doLogSet = () => {
    if (!session || !log || !set) return;
    primeAudio();
    const next = logSet(session, weight);
    updateActive(() => next);
    const logged = next.logs[log.exerciseId].sets.find((x) => x.id === set.id);
    const lastOfExercise = next.logs[log.exerciseId].sets.every((x) => x.done);
    if (settings.restAutoStart && logged) startRest(logged, log.restSec, lastOfExercise);
    if (settings.restVibrate) vibrate(12);
  };

  const doDrop = () => {
    if (!session || !ex || !set) return;
    const idx = pending.length;
    updateActive((s) => setScratchWeight(commitSegment(s, weight), dropWeight(ticks, weight, ex.dropStepPct ?? 20)));
    if (settings.askRepsBeforeDrop) setPendingChipIndex(idx);
    if (settings.restVibrate) vibrate(8);
  };

  const doNext = () => {
    setRest(null);
    restPlatform.stop();
    updateActive((s) => nextExercise(s));
  };

  const doSkip = () => {
    if (!exId) return;
    if (owed) return setSkipConfirm(true);
    updateActive((s) => skipExercise(s, exId));
  };

  const doFinish = () => {
    if (!session) return;
    const remaining = remainingSetCount(session);
    if (remaining > 0 && !finishConfirm) return setFinishConfirm(true);
    setFinishConfirm(false);
    setRest(null);
    restPlatform.stop();
    const pre: BodyScore = preBody;
    const r = finishSession();
    if (!r) return;
    const st = useStore.getState();
    const post = computeBodyScore(st.sessions, st.exercises, 7, st.state.settings.weeklyTargets);
    // The Runner unmounts once the session is gone, so the summary lives in the app shell.
    useUI.getState().setSummary({ session: r.session, pre, post, carried: r.carried, cleared: r.cleared });
    navigate({ name: 'today' }, { replace: true });
  };

  const onReps = (n: number) => {
    if (!rest) return;
    setRepsChosen(n);
    updateActive((s) => setSetReps(s, rest.exId, rest.setId, n));
  };

  const primaryLabel = complete ? (everything ? 'Finish workout' : 'Next exercise') : chain ? `Log drop ${pending.length + 1}` : 'Log set';
  const onPrimary = complete ? (everything ? doFinish : doNext) : chain ? doDrop : doLogSet;

  const alternatives = useMemo(() => (ex ? rankAlternatives(ex, gym, exercises).filter((a) => !session.logs[a.exercise.id]) : []), [ex, gym, exercises, session.logs]);
  const aiAlts = exId ? coachCache[exId]?.alternatives ?? [] : [];
  const doneIds = useMemo(() => new Set(session.queue.filter((id) => exerciseComplete(session.logs[id]))), [session.queue, session.logs]);

  // Background notification fallback when the page is hidden at zero.
  useEffect(() => {
    if (!rest || !ex) return;
    const t = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') void showNotificationNow('Rest over', `Back to ${ex.name}`);
    }, Math.max(0, rest.endsAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [rest, ex]);

  return (
    <div className="runner">
      <div className="runner-head">
        <div className="flex items-center gap-1">
          <button className="btn-icon" onClick={() => navigate({ name: 'today' }, { replace: true })} aria-label="Pause and close">
            <IconClose />
          </button>
          <div className="flex-1 text-center text-dim text-[13.5px] num">
            {exIndex + 1} of {session.queue.length}
          </div>
          <button className="btn-icon" onClick={() => setMenuOpen(true)} aria-label="More">
            <IconMore />
          </button>
        </div>
        <button className="flex items-center gap-1 w-full text-left mt-1" onClick={() => setQueueOpen(true)} aria-label="Open the queue">
          <span className="text-[23px] font-bold leading-tight truncate">{ex?.name ?? '—'}</span>
          <IconChevronDown className="text-dim flex-none" />
        </button>
        <div className="text-dim text-[13px] truncate">
          {ex ? musclesSorted(ex).slice(0, 3).map(([m]) => muscleName(m)).join(' · ') : ''}
          {owed && (
            <span className="pill warn ml-2">
              <IconWarn size={12} /> owed from last time
            </span>
          )}
        </div>
        <div className="progress-dots" aria-hidden="true">
          {session.queue.map((id, i) => (
            <i key={id} className={doneIds.has(id) ? 'done' : i === exIndex ? 'cur' : ''} />
          ))}
        </div>
      </div>

      <div className="runner-stack">
        {log && ex ? (
          <>
            <SetStack
              log={log}
              activeIndex={session.cursor.setIndex}
              exercise={ex}
              unit={gym.unit}
              pending={pending}
              scratchWeight={weight}
              last={last}
              onEditSet={setEditing}
              onAddSet={() => updateActive((s) => addSet(s, ex.id))}
            />
            {pendingChipIndex != null && pending[pendingChipIndex] && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-dim text-[13px]">Reps at {formatWeight(pending[pendingChipIndex].weight, ex, gym.unit)}?</span>
                {chipRange(last?.reps).slice(1, 4).map((n) => (
                  <button
                    key={n}
                    className={`chip num${pending[pendingChipIndex]?.reps === n ? ' on' : ''}`}
                    onClick={() => updateActive((s) => setPendingReps(s, pendingChipIndex, n))}
                  >
                    {n}
                  </button>
                ))}
                <button className="chip" onClick={() => setOtherReps(true)}>
                  other
                </button>
                <button className="btn-icon !w-9 !h-9 !min-h-0" onClick={() => setPendingChipIndex(null)} aria-label="Dismiss">
                  <IconClose size={16} />
                </button>
              </div>
            )}
            {log.skipped && <div className="text-dim text-[13.5px] mt-3">Skipped. Log a set to un-skip it.</div>}
          </>
        ) : (
          <div className="text-dim">Nothing here. Add an exercise from the menu.</div>
        )}
      </div>

      <div className="runner-controls">
        <div className="controls-zone">
          {ex && !complete && (
            <WeightScrubber value={weight} ticks={ticks} onChange={setWeight} exercise={ex} unit={gym.unit} last={last?.weight ?? null} best={last?.best ?? null} haptics={settings.restVibrate} />
          )}
          {complete && ex && (
            <div className="text-center text-dim text-[13.5px] py-4">
              {log?.skipped ? 'Skipped.' : 'All sets done.'} {everything ? 'That was the last exercise.' : ''}
            </div>
          )}
          <div className="flex justify-between mt-1 mb-2">
            <button className="btn btn-ghost btn-sm" onClick={doDrop} disabled={!ex || complete || chain}>
              <IconDrop size={18} /> Drop weight
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSwapOpen(true)} disabled={!ex}>
              <IconSwap size={18} /> Swap
            </button>
            <button className="btn btn-ghost btn-sm" onClick={doSkip} disabled={!ex || complete}>
              <IconSkip size={18} /> Skip
            </button>
          </div>
          {rest && (
            <RestTimer
              endsAt={rest.endsAt}
              totalSec={rest.totalSec}
              label={rest.label}
              repChips={rest.chips}
              repsChosen={repsChosen}
              onReps={onReps}
              onOtherReps={() => setOtherReps(true)}
              onAdjust={(d) => setRest((r) => (r ? { ...r, endsAt: Math.max(Date.now() + 1000, r.endsAt + d * 1000), totalSec: Math.max(1, r.totalSec + d) } : r))}
              onSkip={() => {
                setRest(null);
                restPlatform.stop();
              }}
              onExpired={() => {
                setRest(null);
                restPlatform.stop();
              }}
              sound={settings.restSound}
              haptics={settings.restVibrate}
            />
          )}
        </div>
        <button className="btn btn-primary" onClick={onPrimary} disabled={!ex}>
          {primaryLabel}
        </button>
        {chain && !complete && (
          <button className="btn w-full mt-2" onClick={doLogSet}>
            {'✓'} Finish set
          </button>
        )}
      </div>

      {/* Queue sheet: reorder, jump, add (§6.7) */}
      <Sheet open={queueOpen} onClose={() => setQueueOpen(false)} title="Queue" full>
        <SessionQueue
          ids={session.queue}
          onReorder={(ids) => updateActive((s) => reorderQueue(s, ids))}
          onTap={(id) => {
            updateActive((s) => jumpTo(s, s.queue.indexOf(id)));
            setQueueOpen(false);
          }}
          nameOf={(id) => exercises[id]?.name ?? id}
          meta={(id) => {
            const l = session.logs[id];
            if (!l) return '';
            const d = l.sets.filter((x) => x.done).length;
            return l.skipped ? 'skipped' : `${d} of ${l.sets.length} sets`;
          }}
          debt={debt}
          activeId={exId}
          doneIds={doneIds}
        />
        <button className="btn w-full mt-3" onClick={() => setAddOpen(true)}>
          + Add exercise
        </button>
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add exercise" full>
        <ExercisePicker
          selected={new Set(session.queue)}
          onToggle={(id) => {
            const e = exercises[id];
            if (!e || session.logs[id]) return;
            updateActive((s) => addExercise(s, e, exercises, settings));
            toast(`${e.name} added to the queue`);
            setAddOpen(false);
          }}
          body={preBody}
          debt={debt}
          lastPerformance={lastPerf}
          onInfo={setInfo}
        />
      </Sheet>

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title={`Swap ${ex?.name ?? ''}`}>
        <div className="text-dim text-[13px] mb-2">Ranked by how closely the muscles match. Logged sets stay where they are.</div>
        {aiAlts.length > 0 && (
          <>
            <div className="eyebrow mb-1">Coach suggestions</div>
            {aiAlts.map((a, i) => {
              const target = a.exerciseId ? exercises[a.exerciseId] : undefined;
              return (
                <button
                  key={i}
                  className="list-btn"
                  disabled={!target}
                  onClick={() => {
                    if (target && exId) updateActive((s) => swapExercise(s, exId, target, exercises, settings));
                    setSwapOpen(false);
                  }}
                >
                  <span className="flex-1">{a.name}</span>
                  <span className="text-dim text-[13px]">{a.why}</span>
                </button>
              );
            })}
            <div className="eyebrow mt-3 mb-1">By muscle match</div>
          </>
        )}
        {alternatives.map((a) => (
          <button
            key={a.exercise.id}
            className="list-btn"
            onClick={() => {
              if (exId) updateActive((s) => swapExercise(s, exId, a.exercise, exercises, settings));
              setSwapOpen(false);
            }}
          >
            <span className="flex-1">{a.exercise.name}</span>
            <span className="text-dim text-[13px] num">{Math.round(a.similarity * 100)}%</span>
          </button>
        ))}
        {alternatives.length === 0 && <div className="text-dim text-[13.5px]">No alternatives in your gym for this one.</div>}
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={ex?.name ?? 'Session'}>
        <div className="flex flex-col gap-2">
          {ex && (
            <button
              className="btn w-full"
              onClick={() => {
                setMenuOpen(false);
                setInfo(ex.id);
              }}
            >
              About this exercise
            </button>
          )}
          <button
            className="btn w-full"
            onClick={() => {
              setMenuOpen(false);
              setAddOpen(true);
            }}
          >
            Add exercise
          </button>
          {log?.skipped && exId && (
            <button
              className="btn w-full"
              onClick={() => {
                setMenuOpen(false);
                updateActive((s) => ({ ...s, logs: { ...s.logs, [exId]: { ...s.logs[exId], skipped: false } } }));
              }}
            >
              Un-skip this exercise
            </button>
          )}
          <button
            className="btn w-full"
            onClick={() => {
              setMenuOpen(false);
              navigate({ name: 'today' }, { replace: true });
            }}
          >
            Pause and close
          </button>
          <button
            className="btn btn-accent w-full"
            onClick={() => {
              setMenuOpen(false);
              doFinish();
            }}
          >
            Finish workout
          </button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={skipConfirm}
        title="You skipped this last time too"
        body="Skipping again makes it two sessions missed. It stays owed until you do it."
        confirmLabel="Skip anyway"
        cancelLabel="I'll do it"
        onCancel={() => setSkipConfirm(false)}
        onConfirm={() => {
          setSkipConfirm(false);
          if (exId) updateActive((s) => skipExercise(s, exId));
        }}
      />
      <ConfirmSheet
        open={finishConfirm}
        title="Finish now?"
        body={`You still have ${remainingSetCount(session)} sets left. Exercises without a logged working set count as skipped.`}
        confirmLabel="Finish workout"
        cancelLabel="Keep going"
        onCancel={() => setFinishConfirm(false)}
        onConfirm={doFinish}
      />

      {ex && (
        <SetEditorSheet
          set={editing}
          title={editing && log ? `${setTitle(log.sets, log.sets.findIndex((x) => x.id === editing.id))} · ${ex.name}` : ''}
          exercise={ex}
          unit={gym.unit}
          ticks={ticks}
          onSave={(segments) => {
            if (editing && exId) updateActive((s) => updateSetSegments(s, exId, editing.id, segments));
            setEditing(null);
          }}
          onUnlog={() => {
            if (editing && exId) updateActive((s) => unlogSet(s, exId, editing.id));
            setEditing(null);
          }}
          onDelete={() => {
            if (editing && exId) updateActive((s) => deleteSet(s, exId, editing.id));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <KeypadSheet
        open={otherReps}
        title="Reps"
        initial={null}
        unit="reps"
        decimals={false}
        allowUnknown
        unknownLabel="To failure"
        onSubmit={(v) => {
          const n = v == null ? null : Math.round(v);
          if (pendingChipIndex != null && pending[pendingChipIndex]) updateActive((s) => setPendingReps(s, pendingChipIndex, n));
          else if (rest) {
            setRepsChosen(n);
            updateActive((s) => setSetReps(s, rest.exId, rest.setId, n));
          }
        }}
        onClose={() => setOtherReps(false)}
      />

      <ExerciseSheet id={info} onClose={() => setInfo(null)} />
    </div>
  );
}

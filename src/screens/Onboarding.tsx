import { useMemo, useState } from 'react';
import type { PlanDay } from '@/domain/types';
import { PLAN_TEMPLATES, SEED_PLAN_DAYS, emptyPlan, planFromTemplate } from '@/domain/plan';
import { schemeLabel, schemeOf, warmupFlags } from '@/domain/warmups';
import { useStore } from '@/app/store';
import { navigate } from '@/app/router';
import { Switch } from '@/ui/Controls';
import { GymEquipment, GymInventory } from './GymSetup';

type Step = 1 | 2 | 3;
type PlanChoice = 'split' | 'template' | 'skip';

/** First-launch setup (§4.1): units and increments, gym inventory, starting plan. Skippable. */
export function Onboarding() {
  const exercises = useStore((s) => s.exercises);
  const savePlan = useStore((s) => s.savePlan);
  const setOnboarded = useStore((s) => s.setOnboarded);
  const [step, setStep] = useState<Step>(1);
  const [choice, setChoice] = useState<PlanChoice>('split');
  const [template, setTemplate] = useState(PLAN_TEMPLATES[0].id);
  const [lateralIsSideDelts, setLateralIsSideDelts] = useState(true);
  const [dropThenWork, setDropThenWork] = useState(true);

  const splitDays = useMemo<PlanDay[]>(() => {
    return structuredClone(SEED_PLAN_DAYS).map((d) => ({
      ...d,
      items: d.items.map((it) => {
        if (it.exerciseId !== 'cable_lateral_raise') return it;
        const exerciseId = lateralIsSideDelts ? 'cable_lateral_raise' : 'straight_arm_pulldown';
        return dropThenWork ? { ...it, exerciseId, workSets: 3, dropSets: 2 } : { ...it, exerciseId, workSets: 1, dropSets: 2 };
      }),
    }));
  }, [lateralIsSideDelts, dropThenWork]);
  const flags = useMemo(() => warmupFlags(splitDays[0].items.map((i) => i.exerciseId), exercises), [splitDays, exercises]);

  const finish = (c: PlanChoice = choice) => {
    if (c === 'split') savePlan({ id: 'default', days: splitDays, updatedAt: Date.now() });
    else if (c === 'template') savePlan(planFromTemplate(PLAN_TEMPLATES.find((t) => t.id === template) ?? PLAN_TEMPLATES[0]));
    else savePlan(emptyPlan());
    setOnboarded(true);
    navigate({ name: 'today' }, { replace: true });
  };

  const skipAll = () => {
    // Defaults are already sensible: everything available, the Monday/Thursday split seeded.
    setOnboarded(true);
    navigate({ name: 'today' }, { replace: true });
  };

  return (
    <div className="screen modal">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="eyebrow">Step {step} of 3</div>
          <h1 className="text-[23px] font-bold leading-tight">{step === 1 ? 'Your units and weights' : step === 2 ? 'What your gym has' : 'Your starting plan'}</h1>
        </div>
        <button className="link" onClick={skipAll}>
          Skip setup
        </button>
      </div>

      {step === 1 && (
        <>
          <p className="text-dim text-[13.5px] mb-4 leading-relaxed">The weight scrubber only offers weights that exist at your gym, so you can never log a dumbbell that isn&rsquo;t on the rack. All of this can be changed later in Settings.</p>
          <GymEquipment />
        </>
      )}
      {step === 2 && (
        <>
          <p className="text-dim text-[13.5px] mb-3 leading-relaxed">A typical commercial gym is pre-selected. Untick what you don&rsquo;t have; everything else in the app only shows what is ticked.</p>
          <GymInventory />
        </>
      )}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div role="radio" tabIndex={0} aria-checked={choice === 'split'} className={`card text-left cursor-pointer ${choice === 'split' ? '!border-t2' : ''}`} onClick={() => setChoice('split')} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setChoice('split')}>
            <div className="font-semibold">Use my current split</div>
            <div className="text-dim text-[13px] mb-2">Monday and Thursday, eight exercises each, two sets to failure with automatic warm-ups.</div>
            {choice === 'split' && (
              <div onClick={(e) => e.stopPropagation()}>
                <ol className="text-[13.5px] mb-3">
                  {splitDays[0].items.map((it, i) => (
                    <li key={i} className="flex gap-2 min-h-[26px] items-center">
                      <span className="num text-dim w-4">{i + 1}</span>
                      <span className="flex-1 truncate">{exercises[it.exerciseId]?.name ?? it.exerciseId}</span>
                      <span className="text-dim text-[12px]">{schemeLabel(schemeOf(it), flags[i])}</span>
                    </li>
                  ))}
                </ol>
                <div className="eyebrow mb-1">Two things we guessed</div>
                <div className="row">
                  <div className="flex-1">
                    <div className="text-[14px]">&ldquo;Cable lat raises&rdquo; means cable <b>lateral</b> raises (side delts)</div>
                    <div className="text-dim text-[12.5px]">Off = a lat exercise (straight-arm pulldown) instead.</div>
                  </div>
                  <Switch checked={lateralIsSideDelts} onChange={setLateralIsSideDelts} label="Lateral raise interpretation" />
                </div>
                <div className="row">
                  <div className="flex-1">
                    <div className="text-[14px]">&ldquo;2× dropset → 3× till failure&rdquo; = 2 dropsets, then 3 straight sets</div>
                    <div className="text-dim text-[12.5px]">Off = 3 sets in total, two of them dropsets.</div>
                  </div>
                  <Switch checked={dropThenWork} onChange={setDropThenWork} label="Dropset interpretation" />
                </div>
              </div>
            )}
          </div>
          <div role="radio" tabIndex={0} aria-checked={choice === 'template'} className={`card text-left cursor-pointer ${choice === 'template' ? '!border-t2' : ''}`} onClick={() => setChoice('template')} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setChoice('template')}>
            <div className="font-semibold">Start from a template</div>
            <div className="text-dim text-[13px] mb-2">Upper/Lower, Push/Pull/Legs or Full body ×3.</div>
            {choice === 'template' && (
              <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {PLAN_TEMPLATES.map((t) => (
                  <button key={t.id} className={`chip${template === t.id ? ' on' : ''}`} onClick={() => setTemplate(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div role="radio" tabIndex={0} aria-checked={choice === 'skip'} className={`card text-left cursor-pointer ${choice === 'skip' ? '!border-t2' : ''}`} onClick={() => setChoice('skip')} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setChoice('skip')}>
            <div className="font-semibold">Skip — I&rsquo;ll build as I go</div>
            <div className="text-dim text-[13px]">Empty plan. The session builder becomes the way you start.</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-6">
        {step > 1 && (
          <button className="btn flex-1" onClick={() => setStep((s) => (s - 1) as Step)}>
            Back
          </button>
        )}
        {step < 3 ? (
          <button className="btn btn-primary flex-1 !min-h-[48px]" onClick={() => setStep((s) => (s + 1) as Step)}>
            Continue
          </button>
        ) : (
          <button className="btn btn-primary flex-1 !min-h-[48px]" onClick={() => finish()}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}

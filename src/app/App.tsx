import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useStore } from './store';
import { consumeLaunchQuery, isTab, navigate, useRoute, type Tab } from './router';
import { useTheme } from './hooks';
import { toast } from './ui';
import { Toasts } from '@/ui/Controls';
import { IconCoach, IconPlan, IconProgress, IconToday } from '@/ui/Icons';
import { Today } from '@/screens/Today';
import { Plan } from '@/screens/Plan';
import { Progress } from '@/screens/Progress';
import { Coach } from '@/screens/Coach';
import { Builder } from '@/screens/Builder';
import { Runner } from '@/screens/Runner';
import { Settings } from '@/screens/Settings';
import { Onboarding } from '@/screens/Onboarding';
import { GymSetup } from '@/screens/GymSetup';
import { Targets } from '@/screens/Targets';
import { Owed } from '@/screens/Owed';
import { DayEditor } from '@/screens/DayEditor';
import { ExerciseScreen } from '@/screens/ExerciseScreen';
import { Library } from '@/screens/Library';
import { SessionSummaryHost } from '@/screens/SessionSummary';

const TAB_META: { id: Tab; label: string; Icon: typeof IconToday }[] = [
  { id: 'today', label: 'Today', Icon: IconToday },
  { id: 'plan', label: 'Plan', Icon: IconPlan },
  { id: 'progress', label: 'Progress', Icon: IconProgress },
  { id: 'coach', label: 'Coach', Icon: IconCoach },
];

function TabBar({ current }: { current: Tab }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TAB_META.map(({ id, label, Icon }) => (
          <button key={id} className={`tab${current === id ? ' on' : ''}`} onClick={() => navigate({ name: id }, { replace: true })} aria-current={current === id ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Splash() {
  return (
    <div className="app items-center justify-center">
      <div className="black text-[30px] tracking-tight">Iron</div>
    </div>
  );
}

function UpdatePrompt() {
  const active = useStore((s) => s.active);
  const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });
  const shown = useRef(false);
  const [need] = needRefresh;
  useEffect(() => {
    // Never auto-reload mid-session (§11.3): only offer, and only outside a workout.
    if (!need || shown.current || active) return;
    shown.current = true;
    toast('New version available', { label: 'Reload', onClick: () => void updateServiceWorker(true) }, true);
  }, [need, active, updateServiceWorker]);
  return null;
}

export function App() {
  const ready = useStore((s) => s.ready);
  const boot = useStore((s) => s.boot);
  const onboarded = useStore((s) => s.state.onboarded);
  const active = useStore((s) => s.active);
  const route = useRoute();
  useTheme();

  useEffect(() => {
    void boot();
  }, [boot]);

  // Launch shortcuts (/?action=start) once we are ready.
  const launched = useRef(false);
  useEffect(() => {
    if (!ready || launched.current) return;
    launched.current = true;
    const r = consumeLaunchQuery();
    if (r && onboarded) navigate(r, { replace: true });
  }, [ready, onboarded]);

  // Route guards.
  useEffect(() => {
    if (!ready) return;
    if (!onboarded && route.name !== 'onboarding') navigate({ name: 'onboarding' }, { replace: true });
    else if (onboarded && route.name === 'onboarding') navigate({ name: 'today' }, { replace: true });
    else if (route.name === 'runner' && !active) navigate({ name: 'today' }, { replace: true });
  }, [ready, onboarded, route.name, active]);

  if (!ready) return <Splash />;

  let screen: React.ReactNode;
  switch (route.name) {
    case 'today':
      screen = <Today />;
      break;
    case 'plan':
      screen = <Plan />;
      break;
    case 'progress':
      screen = <Progress />;
      break;
    case 'coach':
      screen = <Coach />;
      break;
    case 'builder':
      screen = <Builder dayId={route.dayId} freestyle={route.freestyle} />;
      break;
    case 'runner':
      screen = active ? <Runner /> : null;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    case 'onboarding':
      screen = <Onboarding />;
      break;
    case 'gym':
      screen = <GymSetup />;
      break;
    case 'targets':
      screen = <Targets />;
      break;
    case 'owed':
      screen = <Owed />;
      break;
    case 'day':
      screen = <DayEditor dayId={route.id} />;
      break;
    case 'exercise':
      screen = <ExerciseScreen id={route.id} />;
      break;
    case 'library':
      screen = <Library />;
      break;
    default:
      screen = <Today />;
  }

  return (
    <div className="app">
      {screen}
      {isTab(route) && <TabBar current={route.name} />}
      <SessionSummaryHost />
      <Toasts />
      <UpdatePrompt />
    </div>
  );
}

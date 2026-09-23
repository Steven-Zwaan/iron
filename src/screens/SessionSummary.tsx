import { doneSetCount, sessionDurationMin } from '@/domain/session';
import { durationLabel } from '@/domain/format';
import { useStore } from '@/app/store';
import { useUI, type SummaryData } from '@/app/ui';
import { Sheet } from '@/ui/Sheet';
import { BodyMap } from '@/ui/BodyMap';
import { TierLegend } from '@/ui/Controls';
import { tier } from '@/domain/scoring';

export type { SummaryData };

/** Mounted once in the app shell so the sheet survives the Runner unmounting. */
export function SessionSummaryHost() {
  const data = useUI((s) => s.summary);
  const setSummary = useUI((s) => s.setSummary);
  return <SessionSummary data={data} onClose={() => setSummary(null)} />;
}

/** §6.8: sets, duration, the map animating from pre- to post-session colours, carried/cleared lists. */
export function SessionSummary({ data, onClose }: { data: SummaryData | null; onClose: () => void }) {
  const exercises = useStore((s) => s.exercises);
  const name = (id: string) => exercises[id]?.name ?? id;
  return (
    <Sheet open={!!data} onClose={onClose} title="Session complete" closeButton={false} history={false}>
      {data && (
        <div className="pb-2">
          <div className="flex items-center gap-4 mb-3">
            <div>
              <div className="eyebrow">Sets</div>
              <div className="black num text-[23px]">{doneSetCount(data.session)}</div>
            </div>
            <div>
              <div className="eyebrow">Duration</div>
              <div className="black num text-[23px]">{durationLabel(sessionDurationMin(data.session))}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="eyebrow">This week</div>
              <div className="black num text-[23px] tier-text" data-tier={tier(data.post.overall)}>
                {data.post.overall}
                <span className="text-dim text-[13px] black"> / 100</span>
              </div>
              {data.post.overall !== data.pre.overall && (
                <div className={`text-[12px] num font-semibold ${data.post.overall > data.pre.overall ? 'text-t1' : 'text-dim'}`}>
                  {data.post.overall > data.pre.overall ? '+' : ''}
                  {data.post.overall - data.pre.overall} since before
                </div>
              )}
            </div>
          </div>
          <BodyMap score={data.post} animateFrom={data.pre} labels={false} style={{ maxHeight: 260 }} />
          <div className="mt-2">
            <TierLegend />
          </div>
          {(data.cleared.length > 0 || data.carried.length > 0) && (
            <div className="mt-4 flex flex-col gap-2 text-[13.5px]">
              {data.cleared.length > 0 && (
                <div>
                  <span className="pill ok mr-2">cleared</span>
                  {data.cleared.map(name).join(', ')}
                </div>
              )}
              {data.carried.length > 0 && (
                <div>
                  <span className="pill warn mr-2">carried over</span>
                  {data.carried.map(name).join(', ')}
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn btn-primary mt-5" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </Sheet>
  );
}

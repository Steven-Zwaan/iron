import type { ReactNode } from 'react';
import { TIER_NAME } from '@/domain/muscles';
import type { Tier } from '@/domain/types';
import { useUI } from '@/app/ui';
import { IconBack, IconClose, IconMinus, IconPlus } from './Icons';

export function Chip({ on, warn, lg, children, onClick, ariaLabel, disabled }: { on?: boolean; warn?: boolean; lg?: boolean; children: ReactNode; onClick?: () => void; ariaLabel?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`chip${on ? ' on' : ''}${warn ? ' warn' : ''}${lg ? ' chip-lg' : ''}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function TierDot({ tier, label }: { tier: Tier; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="tier-dot" data-tier={tier} aria-hidden="true" />
      {label && (
        <span className="tier-text text-xs font-semibold" data-tier={tier}>
          {TIER_NAME[tier]}
        </span>
      )}
    </span>
  );
}

export function TierLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] font-semibold text-dim">
      {[1, 2, 3, 4].map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <i className="tier-dot" data-tier={t} aria-hidden="true" />
          {TIER_NAME[t]}
        </span>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, format }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>
        <IconMinus size={18} />
      </button>
      <span className="val num">{format ? format(value) : value}</span>
      <button type="button" aria-label="Increase" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>
        <IconPlus size={18} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`chip${value === o.value ? ' on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingRow({ label, hint, children, onClick }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        {hint && <div className="text-dim text-[13px] mt-0.5">{hint}</div>}
      </div>
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className="row w-full text-left" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="row">{inner}</div>
  );
}

/** Sticky header for full-screen modal routes. */
export function ModalHeader({ title, subtitle, onBack, close, right }: { title: ReactNode; subtitle?: ReactNode; onBack?: () => void; close?: boolean; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 -mx-1 mb-3 min-h-[44px]">
      {onBack && (
        <button className="btn-icon -ml-1" onClick={onBack} aria-label={close ? 'Close' : 'Back'}>
          {close ? <IconClose /> : <IconBack />}
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[19px] font-bold leading-tight truncate">{title}</div>
        {subtitle && <div className="text-dim text-[13px] truncate">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function Eyebrow({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="eyebrow">{children}</span>
      {right}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-8 px-4">
      <div className="font-semibold mb-1">{title}</div>
      {body && <div className="text-dim text-[13.5px] leading-relaxed">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <button
              className="link"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          {t.sticky && (
            <button className="btn-icon !w-8 !h-8 !min-h-0" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <IconClose size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

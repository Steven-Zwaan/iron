import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { IconBackspace } from './Icons';

export interface KeypadProps {
  open: boolean;
  title: string;
  initial: number | null;
  unit?: string;
  decimals?: boolean;
  allowUnknown?: boolean;
  unknownLabel?: string;
  onSubmit: (v: number | null) => void;
  onClose: () => void;
}

/** Numeric keypad in a sheet — direct entry for weights and reps (§6.2, §6.5). */
export function KeypadSheet({ open, title, initial, unit, decimals = true, allowUnknown, unknownLabel = 'Not counted', onSubmit, onClose }: KeypadProps) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(initial == null ? '' : String(initial));
  }, [open, initial]);

  const press = (k: string) => {
    setText((t) => {
      if (k === '.') {
        if (!decimals || t.includes('.')) return t;
        return t === '' ? '0.' : `${t}.`;
      }
      if (t === '0') return k;
      if (t.replace('.', '').length >= 5) return t;
      return t + k;
    });
  };
  const back = () => setText((t) => t.slice(0, -1));
  const submit = () => {
    const v = text === '' ? null : Number(text);
    if (v != null && Number.isNaN(v)) return;
    onSubmit(v);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex items-baseline justify-center gap-2 h-16 mb-2">
        <span className="black num text-[40px] leading-none">{text === '' ? '—' : text}</span>
        {unit && <span className="text-dim font-semibold">{unit}</span>}
      </div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button key={k} type="button" onClick={() => press(k)} className="num">
            {k}
          </button>
        ))}
        <button type="button" onClick={() => press('.')} disabled={!decimals} aria-label="Decimal point">
          .
        </button>
        <button type="button" onClick={() => press('0')} className="num">
          0
        </button>
        <button type="button" onClick={back} aria-label="Backspace">
          <IconBackspace />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        {allowUnknown && (
          <button
            type="button"
            className="btn flex-1"
            onClick={() => {
              onSubmit(null);
              onClose();
            }}
          >
            {unknownLabel}
          </button>
        )}
        <button type="button" className="btn btn-primary flex-1 !min-h-[48px]" onClick={submit}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

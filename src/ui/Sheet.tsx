import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './Icons';

/**
 * One shared history entry exists while at least one sheet is open, so the Android
 * back gesture closes the topmost sheet instead of leaving the screen. Closing the
 * last sheet programmatically pops that entry again (and ignores the resulting popstate).
 * A single stack avoids the race where closing one sheet while opening another would
 * have the first sheet's pop close the second.
 */
interface SheetEntry {
  close: () => void;
}
const sheetStack: SheetEntry[] = [];
let ignorePops = 0;
let listening = false;

function onPopState(): void {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  const top = sheetStack.pop();
  if (!top) return;
  top.close();
  // The browser consumed our entry; restore it if other sheets are still open.
  if (sheetStack.length) window.history.pushState({ sheet: true }, '');
}

function onSheetEntry(): boolean {
  const st = window.history.state as { sheet?: boolean } | null;
  return !!st && st.sheet === true;
}

function openSheet(entry: SheetEntry): void {
  if (!listening) {
    window.addEventListener('popstate', onPopState);
    listening = true;
  }
  if (!sheetStack.length && !onSheetEntry()) window.history.pushState({ sheet: true }, '');
  sheetStack.push(entry);
}

function closeSheet(entry: SheetEntry): void {
  const i = sheetStack.indexOf(entry);
  if (i < 0) return; // already closed by a pop
  sheetStack.splice(i, 1);
  // Only pop our own entry. If a route navigation already replaced it (see router.navigate),
  // there is nothing to undo.
  if (!sheetStack.length && onSheetEntry()) {
    ignorePops++;
    window.history.back();
  }
}

export function useSheetHistory(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const entry: SheetEntry = { close: () => closeRef.current() };
    openSheet(entry);
    return () => closeSheet(entry);
  }, [open]);
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  full?: boolean;
  footer?: ReactNode;
  closeButton?: boolean;
  history?: boolean;
  ariaLabel?: string;
}

export function Sheet({ open, onClose, title, children, full, footer, closeButton = true, history = true, ariaLabel }: SheetProps) {
  useSheetHistory(open && history, onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className={`sheet${full ? ' full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        {(title || closeButton) && (
          <div className="flex items-center gap-2 mb-2">
            <div className="sheet-title flex-1 !mb-0">{title}</div>
            {closeButton && (
              <button className="btn-icon" onClick={onClose} aria-label="Close">
                <IconClose />
              </button>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="pt-3 flex-none">{footer}</div>}
      </div>
    </div>
  );
}

export interface ConfirmSheetProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({ open, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onCancel} title={title} closeButton={false}>
      {body && <div className="text-dim mb-4 leading-relaxed">{body}</div>}
      <div className="flex flex-col gap-2">
        <button className={`btn btn-primary${danger ? ' !bg-danger !text-white' : ''}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="btn w-full" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Sheet>
  );
}

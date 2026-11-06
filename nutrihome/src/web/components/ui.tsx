import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Icon({ d, label }: { d: string; label?: string }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={d} />
    </svg>
  );
}
export const ICONS = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'm9 6 6 6-6 6', // RTL: back points right
  prev: 'm9 6 6 6-6 6',
  next: 'm15 6-6 6 6 6',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  today: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 8v4l2.5 2',
  foods: 'M3.5 11.5h17a8.5 8.5 0 0 1-17 0ZM8.5 7.5c0-1.4 1-1.9 1-3.3M12 7.5c0-1.4 1-1.9 1-3.3M15.5 7.5c0-1.4 1-1.9 1-3.3',
  user: 'M12 4.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5M4.75 20c.9-3.9 3.8-6 7.25-6s6.35 2.1 7.25 6',
};

export function Field({ label, error, children, className }: { label: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
      {error ? <em className="field-error" role="alert">{error}</em> : null}
    </label>
  );
}

export function NumberInput(props: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  placeholder?: string;
  big?: boolean;
  id?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  'aria-label'?: string;
}) {
  return (
    <input
      id={props.id}
      className={`input${props.big ? ' big' : ''}`}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      value={props.value}
      placeholder={props.placeholder}
      aria-invalid={props.invalid || undefined}
      aria-label={props['aria-label']}
      autoFocus={props.autoFocus}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && props.onEnter) {
          e.preventDefault();
          props.onEnter();
        }
      }}
    />
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, title, onClose, onBack, tall, children, split }: {
  open: boolean;
  title: string;
  onClose: () => void;
  onBack?: () => void;
  tall?: boolean;
  split?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`sheet${tall ? ' tall' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <>
          <div className="sheet-head">
            {onBack ? (
              <button type="button" className="icon-btn back" onClick={onBack} aria-label="رجوع">
                <Icon d={ICONS.back} />
              </button>
            ) : null}
            <h2>{title}</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="إغلاق">
              <Icon d={ICONS.close} />
            </button>
          </div>
          <div className={`sheet-body${split ? ' split' : ''}`}>{children}</div>
        </>
      ) : null}
    </dialog>
  );
}

// ---------- Toasts ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((text: string) => {
    setMsg({ text, id: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  // A modal dialog sits in the top layer, so render the toast inside it while one is open.
  const host = (typeof document !== 'undefined' && document.querySelector('dialog[open]')) || (typeof document !== 'undefined' ? document.body : null);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && host
        ? createPortal(
            <div key={msg.id} className="toast" role="status" aria-live="polite">
              {msg.text}
            </div>,
            host,
          )
        : null}
    </ToastCtx.Provider>
  );
}

export function Macros({ p, c, f }: { p: number; c: number; f: number }) {
  const g = (x: number) => (x > 0 && x < 10 ? Math.round(x * 10) / 10 : Math.round(x));
  return (
    <span className="mm">
      <i className="m-p" title="بروتين">ب {g(p)}</i>
      <i className="m-c" title="كارب">ك {g(c)}</i>
      <i className="m-f" title="دهون">د {g(f)}</i>
    </span>
  );
}

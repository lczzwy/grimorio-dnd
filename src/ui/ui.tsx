import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type React from 'react';
import { X } from 'lucide-react';
import { create } from 'zustand';

/* ---------------- hash router ---------------- */

export function useRoute(): string[] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}
export const go = (path: string) => {
  window.location.hash = '#/' + path.replace(/^\//, '');
  window.scrollTo({ top: 0 });
};

/* ---------------- modal ---------------- */

const modalStack: symbol[] = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, wide, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; icon?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const me = Symbol();
    modalStack.push(me);
    const before = document.activeElement as HTMLElement | null;
    // focus the first field (or the dialog itself) unless a child already took focus
    requestAnimationFrame(() => {
      const el = box.current;
      if (el && !el.contains(document.activeElement)) {
        const first = el.querySelector<HTMLElement>('.modal-body ' + FOCUSABLE) || el;
        first.focus();
      }
    });
    const k = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== me) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key === 'Tab' && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      modalStack.splice(modalStack.indexOf(me), 1);
      if (!modalStack.length) document.body.style.overflow = '';
      before?.focus?.();
    };
  }, []);
  const titleId = useId();
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          {icon}
          <h2 className="grow" id={titleId}>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- tiny markdown ---------------- */

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|_(.+?)_|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}><em>{m[1]}</em></strong>);
    else if (m[2]) out.push(<strong key={k++}>{m[2]}</strong>);
    else out.push(<em key={k++}>{m[3] || m[4]}</em>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Markdown({ text, className = 'prose' }: { text?: string; className?: string }) {
  if (!text) return null;
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l) { i++; continue; }
    if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={k++}>
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>,
      );
      continue;
    }
    if (/^[-*•] /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && (/^[-*•] /.test(lines[i]) || !lines[i])) {
        if (lines[i]) items.push(lines[i].replace(/^[-*•] /, ''));
        i++;
        if (lines[i] && !/^[-*•] /.test(lines[i])) break;
      }
      blocks.push(<ul key={k++}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>);
      continue;
    }
    if (/^#{1,6} /.test(l)) {
      blocks.push(<h4 key={k++}>{inline(l.replace(/^#+ /, ''))}</h4>);
      i++;
      continue;
    }
    blocks.push(<p key={k++}>{inline(l)}</p>);
    i++;
  }
  return <div className={className}>{blocks}</div>;
}

/* ---------------- inputs ---------------- */

export function NumInput({ value, onChange, min, max, className = 'input num', style, placeholder }: { value: number | undefined; onChange: (n: number) => void; min?: number; max?: number; className?: string; style?: React.CSSProperties; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={className}
      style={style}
      inputMode="numeric"
      placeholder={placeholder}
      value={draft ?? (value ?? '')}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) {
          let n = parseInt(draft, 10);
          if (isNaN(n)) n = 0;
          if (min != null) n = Math.max(min, n);
          if (max != null) n = Math.min(max, n);
          onChange(n);
        }
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function Stepper({ value, onChange, min = -99, max = 999 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <span className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="menos">−</button>
      <NumInput value={value} onChange={onChange} min={min} max={max} style={{ width: 52 }} />
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="mais">+</button>
    </span>
  );
}

/* ---------------- flash message ---------------- */

export const useFlash = create<{ msg?: string; key: number; show: (m: string) => void }>((set) => ({
  key: 0,
  show: (msg) => {
    set((s) => ({ msg, key: s.key + 1 }));
    const k = Date.now();
    (window as unknown as { __fk: number }).__fk = k;
    setTimeout(() => {
      if ((window as unknown as { __fk: number }).__fk === k) set({ msg: undefined });
    }, 2600);
  },
}));

export function FlashHost() {
  const { msg, key } = useFlash();
  if (!msg) return null;
  return <div className="toast-msg" key={key}>{msg}</div>;
}

export function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickFile(accept = '.json'): Promise<File | undefined> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => res(i.files?.[0]);
    i.click();
  });
}

export const D20Icon = ({ size = 24, className }: { size?: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
    <path d="M32 3 58 18v28L32 61 6 46V18Z" fill="currentColor" fillOpacity=".14" />
    <path d="M32 3 20 24h24L32 3ZM20 24 6 18M44 24l14-6M20 24l12 22 12-22M32 46v15M20 24 6 46M44 24l14 22M6 46l26 0 26 0" />
  </svg>
);

/* ---------------- keyboard ---------------- */

/**
 * Makes a non-button element (a card or row that contains its own buttons) act as a button:
 * focusable with Tab, triggered by Enter or Space. Keys pressed on inner controls are ignored.
 */
export function clickable(fn: () => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    },
  };
}

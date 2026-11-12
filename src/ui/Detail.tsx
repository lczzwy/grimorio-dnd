import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Modal } from './ui';

const WIDE = '(min-width: 1100px)';

function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Details of something on the sheet (an item, a spell, a feature): on a big screen they open in a
 * panel at the side, so the sheet stays in view while you read; on a phone, or inside the table
 * mode (where the right side is the chat), they open as the usual window.
 */
export function Detail({ title, onClose, children, footer, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; icon?: ReactNode }) {
  const wide = useWide();
  const table = document.documentElement.dataset.tablemode !== undefined;
  if (!wide || table) return <Modal title={title} onClose={onClose} footer={footer} icon={icon}>{children}</Modal>;
  return <SidePanel title={title} onClose={onClose} footer={footer} icon={icon}>{children}</SidePanel>;
}

function SidePanel({ title, onClose, children, footer, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; icon?: ReactNode }) {
  const box = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const k = (e: KeyboardEvent) => {
      // a window opened on top (a confirmation) handles its own Escape
      if (e.key === 'Escape' && !document.querySelector('.modal-back')) closeRef.current();
    };
    window.addEventListener('keydown', k);
    document.documentElement.classList.add('has-side');
    return () => {
      window.removeEventListener('keydown', k);
      document.documentElement.classList.remove('has-side');
      before?.focus?.();
    };
  }, []);
  return createPortal(
    <aside ref={box} className="side-panel" tabIndex={-1} role="complementary" aria-labelledby={titleId}>
      <header className="side-head">
        {icon}
        <h2 className="grow" id={titleId}>{title}</h2>
        <button className="btn icon ghost" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><X size={18} /></button>
      </header>
      <div className="side-body">{children}</div>
      {footer && <footer className="side-foot">{footer}</footer>}
    </aside>,
    document.body,
  );
}

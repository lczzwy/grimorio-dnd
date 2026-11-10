import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Minus, Square, X } from 'lucide-react';

interface Box { x: number; y: number; w: number; h: number; min: boolean }

const load = (id: string, fallback: Box): Box => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem('win-' + id) || '{}') }; } catch { return fallback; }
};
const save = (id: string, b: Box) => {
  try { localStorage.setItem('win-' + id, JSON.stringify(b)); } catch { /* private mode */ }
};

/**
 * A window floating over the table (the sheet, the party): drag it by the title, resize it from
 * the corner, shrink it to its title bar. Position and size are remembered on this device.
 */
export function FloatWindow({ id, title, icon, onClose, children, initial }: {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  initial?: Partial<Box>;
}) {
  const [box, setBox] = useState<Box>(() => load(id, { x: 70, y: 60, w: 560, h: Math.round(window.innerHeight * 0.7), min: false, ...initial }));
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // keep it on screen
  const fit = (b: Box): Box => ({
    ...b,
    x: Math.min(Math.max(0, b.x), Math.max(0, window.innerWidth - 120)),
    y: Math.min(Math.max(0, b.y), Math.max(0, window.innerHeight - 40)),
  });
  useEffect(() => { save(id, box); }, [id, box]);

  // remember the size after the user resizes from the corner
  useEffect(() => {
    const node = el.current;
    if (!node || box.min) return;
    const ro = new ResizeObserver(() => {
      const w = node.offsetWidth, h = node.offsetHeight;
      setBox((b) => (Math.abs(b.w - w) > 2 || Math.abs(b.h - h) > 2 ? { ...b, w, h } : b));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [box.min]);

  return (
    <div
      ref={el}
      className={'fwin' + (box.min ? ' min' : '')}
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      style={{ left: box.x, top: box.y, width: box.w, height: box.min ? undefined : box.h }}
    >
      <div
        className="fwin-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { dx: e.clientX - box.x, dy: e.clientY - box.y };
        }}
        onPointerMove={(e) => { const d = drag.current; if (d) setBox((b) => fit({ ...b, x: e.clientX - d.dx, y: e.clientY - d.dy })); }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={() => setBox((b) => ({ ...b, min: !b.min }))}
      >
        {icon}
        <b className="grow">{title}</b>
        <button className="btn icon sm ghost" aria-label={box.min ? 'Abrir' : 'Minimizar'} title={box.min ? 'Abrir' : 'Minimizar'} onClick={() => setBox((b) => ({ ...b, min: !b.min }))}>{box.min ? <Square size={12} /> : <Minus size={14} />}</button>
        <button className="btn icon sm ghost" aria-label="Fechar" title="Fechar" onClick={onClose}><X size={14} /></button>
      </div>
      {!box.min && <div className="fwin-body">{children}</div>}
    </div>
  );
}

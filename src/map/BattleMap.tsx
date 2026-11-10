import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { BattleMapRow } from '../cloud/maps';

interface View { x: number; y: number; z: number }
const MAX_ZOOM = 6; // times the fitted size

/**
 * The battle map under the dice: the GM's square crop, filling the square frame, with its grid on top.
 * Each person zooms in (wheel, pinch or the buttons) and pans around on their own screen, but the
 * picture never leaves the frame and never gets smaller than it: the crop stays where the GM set it.
 */
export function BattleMap({ map }: { map: BattleMapRow }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  /** smallest zoom: the picture covers the whole frame */
  const minZ = () => {
    const el = box.current;
    return el ? Math.max(el.clientWidth / map.width, el.clientHeight / map.height) : 1;
  };
  /** keeps the zoom in range and the frame always covered by the picture */
  const settle = useCallback((v: View): View => {
    const el = box.current;
    if (!el) return v;
    const W = el.clientWidth, H = el.clientHeight;
    const lo = Math.max(W / map.width, H / map.height);
    const z = Math.min(lo * MAX_ZOOM, Math.max(lo, v.z));
    const w = map.width * z, h = map.height * z;
    const x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, v.x));
    const y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, v.y));
    return { x, y, z };
  }, [map.width, map.height]);
  const fit = useCallback(() => setView(settle({ x: 0, y: 0, z: 0 })), [settle]);

  // a new picture (or a resized table) starts fitted to the frame
  useEffect(() => {
    fit();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView((v) => (v ? settle(v) : v)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, settle, map.image_url]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
    setView((v) => {
      if (!v) return v;
      const lo = minZ();
      const z = Math.min(lo * MAX_ZOOM, Math.max(lo, v.z * factor));
      const k = z / v.z;
      return settle({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    });
  };

  // wheel zoom needs a non-passive listener to stop the page from scrolling
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // re-bound each render so it always uses the current map size

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view?.z ?? 1 };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = box.current!.getBoundingClientRect();
      const target = pinch.current.z * (d / pinch.current.d);
      zoomAt(target / (view?.z ?? 1), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    setView((v) => (v ? settle({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }) : v));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = 60;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); const [dx, dy] = moves[e.key]; setView((v) => (v ? settle({ ...v, x: v.x + dx, y: v.y + dy }) : v)); }
    else if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-') zoomAt(0.8);
    else if (e.key === '0') fit();
  };

  const g = map.grid_size;
  const patId = 'grid-' + map.id;
  return (
    <div
      ref={box}
      className="bmap"
      tabIndex={0}
      role="img"
      aria-label={`Mapa ${map.name}. Arraste para mover, use a roda do mouse ou as setas e + e − para aproximar.`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      {view && (
        <div className="bmap-stage" style={{ width: map.width, height: map.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <img src={map.image_url} width={map.width} height={map.height} alt="" draggable={false} />
          {map.show_grid && (
            <svg className="bmap-grid" width={map.width} height={map.height} aria-hidden>
              <defs>
                <pattern id={patId} width={g} height={g} patternUnits="userSpaceOnUse" x={map.grid_x} y={map.grid_y}>
                  <path d={`M ${g} 0 L 0 0 0 ${g}`} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth={Math.max(1, 1.2 / view.z)} />
                  <path d={`M ${g} 0 L 0 0 0 ${g}`} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={Math.max(0.5, 0.6 / view.z)} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#${patId})`} />
            </svg>
          )}
        </div>
      )}
      <div className="bmap-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn icon sm" aria-label="Aproximar" title="Aproximar" onClick={() => zoomAt(1.25)}><Plus size={14} /></button>
        <button className="btn icon sm" aria-label="Afastar" title="Afastar" onClick={() => zoomAt(0.8)}><Minus size={14} /></button>
        <button className="btn icon sm" aria-label="Mostrar o mapa inteiro" title="Mostrar o mapa inteiro" onClick={fit}><Maximize size={14} /></button>
      </div>
    </div>
  );
}

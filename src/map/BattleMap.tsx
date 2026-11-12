import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { BattleMapRow } from '../cloud/maps';
import { snapToGrid, type MapToken } from '../cloud/tokens';
import { gridDistance, type Drawing, type PingFx, type RulerFx } from '../cloud/drawings';

export type MapTool = 'hand' | 'pen' | 'eraser' | 'ruler';
type Pt = { x: number; y: number };
const lifeColor = (f: number) => (f > 0.5 ? '#4fbf6a' : f > 0.25 ? '#e0b341' : '#e5484d');
const pathOf = (p: number[]) => p.reduce((d, v, i) => d + (i % 2 ? ' ' + v : (i ? ' L ' : 'M ') + v), '');

interface View { x: number; y: number; z: number }
const MAX_ZOOM = 6; // times the fitted size
const LONG_PRESS_MS = 550;

type Gesture =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'drag'; ids: string[]; start: { x: number; y: number }; from: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'select'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'pen'; pts: number[] }
  | { kind: 'erase'; ids: Set<string> }
  | { kind: 'ruler'; a: Pt };

/**
 * The battle map under the dice: the GM's square crop, filling the square frame, with its grid
 * and the tokens on top.
 * - Left drag on the map pans (once zoomed in); wheel, pinch or the buttons zoom. Each person's
 *   view is their own, and the picture never leaves the frame.
 * - Left drag on a token moves it (snapping to the grid); a group picked with a right-drag
 *   rectangle moves together once, then the selection clears.
 * - Right click (or a long press) on a token opens its menu.
 */
export function BattleMap({ map, tokens, setTokens, canMove, onMoved, onTokenMenu, snap = false, tool = 'hand', pen, drawings = [], canErase, onStroke, onErase, rulers = {}, onRuler, pings = [], onPing, turnId, life = {} }: {
  map: BattleMapRow;
  tokens: MapToken[];
  setTokens: (f: (t: MapToken[]) => MapToken[]) => void;
  canMove: (t: MapToken) => boolean;
  onMoved: (moves: { id: string; x: number; y: number }[]) => void;
  /** `group`: the selected tokens when this one is among them, else just this one */
  onTokenMenu?: (t: MapToken, clientX: number, clientY: number, group: MapToken[]) => void;
  /** fit dropped tokens to the grid squares */
  snap?: boolean;
  tool?: MapTool;
  pen?: { color: string; width: number };
  drawings?: Drawing[];
  canErase?: (d: Drawing) => boolean;
  onStroke?: (points: number[]) => void;
  onErase?: (ids: string[]) => void;
  /** other people's rulers, live */
  rulers?: Record<string, RulerFx>;
  onRuler?: (line: { a: Pt; b: Pt } | null) => void;
  pings?: PingFx[];
  onPing?: (x: number, y: number) => void;
  /** the token whose turn it is */
  turnId?: string;
  /** life left (0 to 1) of tokens linked to a creature in the fight */
  life?: Record<string, number>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const groupOf = (tok: MapToken) => (selected.has(tok.id) && selected.size > 1 ? tokens.filter((t) => selected.has(t.id)) : [tok]);
  const longPress = useRef<number | undefined>(undefined);
  // the tokens being dragged and how far (picture px); drawn on top of the list without touching it
  const [drag, setDrag] = useState<{ ids: Set<string>; dx: number; dy: number } | null>(null);
  // the stroke being drawn, strokes being rubbed out, and my own ruler (all local until released)
  const [draft, setDraft] = useState<number[] | null>(null);
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const [myRuler, setMyRuler] = useState<{ a: Pt; b: Pt } | null>(null);
  // pointer moves are applied once per frame, not once per event
  const frame = useRef<number | undefined>(undefined);
  const pending = useRef<(() => void) | null>(null);
  const perFrame = (f: () => void) => {
    pending.current = f;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = undefined; const run = pending.current; pending.current = null; run?.(); });
  };

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

  // Esc drops the selection
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(new Set()); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  /** screen point (relative to the frame) to picture pixels */
  const toMap = (sx: number, sy: number) => (view ? { x: (sx - view.x) / view.z, y: (sy - view.y) / view.z } : { x: 0, y: 0 });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** the eraser takes the strokes under the pointer (only the ones this person may erase) */
  const rubAt = (cx: number, cy: number, ids: Set<string>) => {
    const hit = document.elementsFromPoint(cx, cy).map((el) => (el as HTMLElement).dataset?.stroke).filter((x): x is string => !!x);
    let changed = false;
    for (const id of hit) {
      const d = drawings.find((x) => x.id === id);
      if (d && !ids.has(id) && (canErase?.(d) ?? false)) { ids.add(id); changed = true; }
    }
    if (changed) setErasing(new Set(ids));
  };
  // once the server drops them, forget the local "being erased" marks
  useEffect(() => {
    setErasing((s) => (s.size && ![...s].some((id) => drawings.some((d) => d.id === id)) ? new Set() : s));
  }, [drawings]);

  const onDown = (e: React.PointerEvent) => {
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button !== 0 && e.button !== 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    window.clearTimeout(longPress.current);
    if (pointers.current.size === 2) {
      gesture.current = null;
      setRect(null);
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view?.z ?? 1 };
      return;
    }
    const p = local(e);
    const tokenEl = (e.target as HTMLElement).closest<HTMLElement>('[data-token]');
    const tok = tokenEl ? tokens.find((t) => t.id === tokenEl.dataset.token) : undefined;

    // Alt+click anywhere: a ping everyone sees
    if (e.altKey && onPing && view) { const m = toMap(p.x, p.y); onPing(m.x, m.y); gesture.current = null; return; }
    if (tool !== 'hand' && !(mouse && e.button === 2)) {
      const m = toMap(p.x, p.y);
      if (tool === 'pen') gesture.current = { kind: 'pen', pts: [Math.round(m.x), Math.round(m.y)] };
      else if (tool === 'ruler') gesture.current = { kind: 'ruler', a: m };
      else { const g2: Gesture = { kind: 'erase', ids: new Set() }; gesture.current = g2; rubAt(e.clientX, e.clientY, g2.ids); }
      return;
    }
    if (mouse && e.button === 2) {
      // right button: on a token the menu opens (contextmenu event); on the map, a selection box
      if (!tok) gesture.current = { kind: 'select', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      return;
    }
    if (tok && canMove(tok)) {
      const ids = selected.has(tok.id) ? [...selected] : [tok.id];
      if (!selected.has(tok.id)) setSelected(new Set());
      const from = new Map(tokens.filter((t) => ids.includes(t.id)).map((t) => [t.id, { x: t.x, y: t.y }]));
      gesture.current = { kind: 'drag', ids, start: toMap(p.x, p.y), from, moved: false };
    } else {
      gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY };
    }
    // touch: holding a finger on a token opens its menu
    if (tok && !mouse && onTokenMenu) {
      const cx = e.clientX, cy = e.clientY;
      longPress.current = window.setTimeout(() => {
        const g = gesture.current;
        if (g?.kind === 'drag' && g.moved) return;
        gesture.current = null;
        onTokenMenu(tok, cx, cy, groupOf(tok));
      }, LONG_PRESS_MS);
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
    const g = gesture.current;
    if (!g) return;
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 3) window.clearTimeout(longPress.current);
    if (g.kind === 'pan') {
      const dx = cur.x - g.x, dy = cur.y - g.y;
      g.x = cur.x; g.y = cur.y;
      setView((v) => (v ? settle({ ...v, x: v.x + dx, y: v.y + dy }) : v));
    } else if (g.kind === 'drag') {
      const p = local(e);
      const m = toMap(p.x, p.y);
      const dx = m.x - g.start.x, dy = m.y - g.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
      const ids = new Set(g.ids);
      perFrame(() => setDrag({ ids, dx, dy }));
    } else if (g.kind === 'pen') {
      const p = local(e);
      const m = toMap(p.x, p.y);
      const lx = g.pts[g.pts.length - 2], ly = g.pts[g.pts.length - 1];
      // keep a point every couple of screen pixels: smooth enough, small to store
      if (Math.hypot(m.x - lx, m.y - ly) * (view?.z ?? 1) < 2.5 || g.pts.length >= 3990) return;
      g.pts.push(Math.round(m.x), Math.round(m.y));
      const pts = g.pts.slice();
      perFrame(() => setDraft(pts));
    } else if (g.kind === 'erase') {
      rubAt(e.clientX, e.clientY, g.ids);
    } else if (g.kind === 'ruler') {
      const p = local(e);
      const line = { a: g.a, b: toMap(p.x, p.y) };
      perFrame(() => setMyRuler(line));
      onRuler?.(line);
    } else {
      const p = local(e);
      g.x1 = p.x; g.y1 = p.y;
      setRect({ x: Math.min(g.x0, g.x1), y: Math.min(g.y0, g.y1), w: Math.abs(g.x1 - g.x0), h: Math.abs(g.y1 - g.y0) });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    window.clearTimeout(longPress.current);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'pen') {
      if (frame.current) { cancelAnimationFrame(frame.current); frame.current = undefined; pending.current = null; }
      setDraft(null);
      // a single click leaves a dot
      const pts = g.pts.length >= 4 ? g.pts : [...g.pts, g.pts[0] + 1, g.pts[1] + 1];
      onStroke?.(pts);
      return;
    }
    if (g.kind === 'erase') {
      if (g.ids.size) onErase?.([...g.ids]);
      return;
    }
    if (g.kind === 'ruler') {
      if (frame.current) { cancelAnimationFrame(frame.current); frame.current = undefined; pending.current = null; }
      setMyRuler(null);
      onRuler?.(null);
      return;
    }
    if (g.kind === 'drag') {
      if (frame.current) { cancelAnimationFrame(frame.current); frame.current = undefined; pending.current = null; }
      setDrag(null);
      if (!g.moved) return;
      const p = local(e);
      const m = toMap(p.x, p.y);
      const dx = m.x - g.start.x, dy = m.y - g.start.y;
      const sizes = new Map(tokens.map((t) => [t.id, t.size]));
      const moves = [...g.from].map(([id, f]) => {
        const free = { x: Math.round(f.x + dx), y: Math.round(f.y + dy) };
        return { id, ...(snap ? snapToGrid(free.x, free.y, sizes.get(id) ?? 1, map) : free) };
      });
      // show the new place at once; the server confirms a moment later
      const at = new Map(moves.map((mv) => [mv.id, mv]));
      setTokens((list) => list.map((t) => (at.has(t.id) ? { ...t, x: at.get(t.id)!.x, y: at.get(t.id)!.y } : t)));
      // a group moves once, then it's back to one token at a time
      setSelected(new Set());
      onMoved(moves);
    } else if (g.kind === 'select') {
      setRect(null);
      const a = toMap(Math.min(g.x0, g.x1), Math.min(g.y0, g.y1));
      const b = toMap(Math.max(g.x0, g.x1), Math.max(g.y0, g.y1));
      if (Math.abs(g.x1 - g.x0) < 4 && Math.abs(g.y1 - g.y0) < 4) { setSelected(new Set()); return; }
      setSelected(new Set(tokens.filter((t) => canMove(t) && t.x >= a.x && t.x <= b.x && t.y >= a.y && t.y <= b.y).map((t) => t.id)));
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
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
      className={'bmap tool-' + tool}
      tabIndex={0}
      role="application"
      aria-label={`Mapa ${map.name}. Arraste para mover o mapa ou um token; botão direito e arrastar seleciona vários tokens.`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      onDoubleClick={(e) => {
        if (tool !== 'hand' || !onPing || (e.target as HTMLElement).closest('[data-token], button')) return;
        const p = local(e);
        const m = toMap(p.x, p.y);
        onPing(m.x, m.y);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-token]');
        const tok = el && tokens.find((t) => t.id === el.dataset.token);
        if (tok && onTokenMenu) onTokenMenu(tok, e.clientX, e.clientY, groupOf(tok));
      }}
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
          <svg className="bmap-ink" width={map.width} height={map.height} aria-hidden>
            {drawings.map((d) => (
              <g key={d.id} className={erasing.has(d.id) ? 'rubbed' : undefined}>
                <path d={pathOf(d.points)} stroke={d.color} strokeWidth={d.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {/* wider invisible copy: easier to hit with the eraser */}
                <path data-stroke={d.id} className="ink-hit" d={pathOf(d.points)} strokeWidth={Math.max(d.width, 14 / view.z)} fill="none" strokeLinecap="round" />
              </g>
            ))}
            {draft && pen && <path d={pathOf(draft)} stroke={pen.color} strokeWidth={pen.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          {tokens.map((t) => {
            const d = t.size * g;
            const off = drag?.ids.has(t.id) ? drag : null;
            const tx = t.x + (off?.dx ?? 0), ty = t.y + (off?.dy ?? 0);
            // names keep a readable on-screen size whatever the zoom
            const label = 12 / view.z;
            return (
              <div
                key={t.id}
                data-token={t.id}
                className={'tok tok-' + t.color + (t.hidden ? ' hidden' : '') + (selected.has(t.id) ? ' sel' : '') + (canMove(t) ? ' movable' : '') + (off ? ' dragging' : '') + (t.id === turnId ? ' turn' : '')}
                style={{ left: tx - d / 2, top: ty - d / 2, width: d, height: d, ['--ring' as string]: `${Math.max(1.5, 2 / view.z)}px` }}
                title={t.name}
              >
                <div className="tok-face" style={t.image_url ? { backgroundImage: `url(${t.image_url})` } : undefined}>
                  {!t.image_url && <span style={{ fontSize: d * 0.42 }}>{(t.name || '?').trim().charAt(0).toUpperCase()}</span>}
                </div>
                {life[t.id] != null && (
                  <svg className="tok-life" viewBox="0 0 100 100" aria-hidden>
                    <circle cx="50" cy="50" r="46" className="tok-life-bg" />
                    <circle cx="50" cy="50" r="46" pathLength={100} strokeDasharray={`${Math.max(0, Math.min(1, life[t.id])) * 100} 100`} className="tok-life-fg" style={{ stroke: lifeColor(life[t.id]) }} />
                  </svg>
                )}
                {t.name && <span className="tok-name" style={{ fontSize: label }}>{t.name}</span>}
              </div>
            );
          })}
          <svg className="bmap-fx" width={map.width} height={map.height} aria-hidden>
            {[...Object.values(rulers), ...(myRuler ? [{ uid: 'me', name: '', color: pen?.color ?? '#e8c46a', ...myRuler }] : [])].map((r) => {
              const dist = gridDistance(r.a, r.b, g);
              const fs = 13 / view.z;
              const w = 2.5 / view.z;
              return (
                <g key={r.uid}>
                  <line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke="#000" strokeOpacity={0.6} strokeWidth={w * 2.2} strokeLinecap="round" />
                  <line x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} stroke={r.color} strokeWidth={w} strokeDasharray={`${8 / view.z} ${5 / view.z}`} strokeLinecap="round" />
                  <circle cx={r.a.x} cy={r.a.y} r={4 / view.z} fill={r.color} />
                  <circle cx={r.b.x} cy={r.b.y} r={4 / view.z} fill={r.color} />
                  <text x={r.b.x + 10 / view.z} y={r.b.y - 10 / view.z} fontSize={fs} className="fx-label" paintOrder="stroke" stroke="#000" strokeWidth={3 / view.z}>
                    {r.name ? `${r.name}: ` : ''}{dist.label}
                  </text>
                </g>
              );
            })}
            {pings.map((pg) => (
              <g key={pg.key} className="fx-ping" style={{ ['--c' as string]: pg.color }}>
                <circle cx={pg.x} cy={pg.y} r={g * 0.9} fill="none" stroke={pg.color} strokeWidth={3 / view.z} />
                <circle cx={pg.x} cy={pg.y} r={5 / view.z} fill={pg.color} />
                {pg.name && <text x={pg.x} y={pg.y - g * 1.1} fontSize={12 / view.z} textAnchor="middle" className="fx-label" paintOrder="stroke" stroke="#000" strokeWidth={3 / view.z}>{pg.name}</text>}
              </g>
            ))}
          </svg>
        </div>
      )}
      {rect && <div className="bmap-select" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
      {selected.size > 0 && <div className="bmap-hint">{selected.size} selecionado{selected.size > 1 ? 's' : ''}: arraste um deles para mover o grupo (Esc cancela)</div>}
      <div className="bmap-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn icon sm" aria-label="Aproximar" title="Aproximar" onClick={() => zoomAt(1.25)}><Plus size={14} /></button>
        <button className="btn icon sm" aria-label="Afastar" title="Afastar" onClick={() => zoomAt(0.8)}><Minus size={14} /></button>
        <button className="btn icon sm" aria-label="Mostrar o mapa inteiro" title="Mostrar o mapa inteiro" onClick={fit}><Maximize size={14} /></button>
      </div>
    </div>
  );
}

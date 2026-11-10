import { useEffect, useRef, useState } from 'react';
import { Crop, Minus, Plus } from 'lucide-react';
import { Modal } from '../ui/ui';

const OUT_MAX = 4096;

export interface CroppedMap { blob: Blob; size: number; name: string; putOnTable: boolean }

/**
 * Square crop before a map goes to the table, like choosing a profile picture:
 * drag to place, zoom to pick how much of the picture the table shows.
 * The result is a square image; on the table it fills the square frame exactly.
 */
export function MapCropper({ file, onCancel, onDone, busy }: { file: File; onCancel: () => void; onDone: (r: CroppedMap) => void; busy?: boolean }) {
  const [img, setImg] = useState<{ el: HTMLImageElement; w: number; h: number } | null>(null);
  const [name, setName] = useState(() => file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Mapa');
  const frame = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(480);
  // z: zoom over "cover" (1 = the short side of the picture fills the square); x/y: picture offset in frame px
  const [v, setV] = useState({ z: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg({ el, w: el.naturalWidth, h: el.naturalHeight });
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    setSide(el.clientWidth);
    const ro = new ResizeObserver(() => setSide(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cover = img ? side / Math.min(img.w, img.h) : 1;
  const scale = cover * v.z;
  const dispW = img ? img.w * scale : side;
  const dispH = img ? img.h * scale : side;
  /** keeps the square fully covered by the picture */
  const clamp = (x: number, y: number, w = dispW, h = dispH) => ({ x: Math.min(0, Math.max(side - w, x)), y: Math.min(0, Math.max(side - h, y)) });

  // centre the picture when it loads (and when the square changes size)
  useEffect(() => {
    if (img) setV({ z: 1, x: (side - img.w * cover) / 2, y: (side - img.h * cover) / 2 });
  }, [img, side]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomTo = (z: number, cx = side / 2, cy = side / 2) => {
    if (!img) return;
    z = Math.min(8, Math.max(1, z));
    const k = z / v.z;
    const w = img.w * cover * z;
    const h = img.h * cover * z;
    setV({ z, ...clamp(cx - (cx - v.x) * k, cy - (cy - v.y) * k, w, h) });
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(v.z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const finish = async (putOnTable: boolean) => {
    if (!img) return;
    // the square, in picture pixels
    const sx = -v.x / scale;
    const sy = -v.y / scale;
    const sSide = side / scale;
    const out = Math.round(Math.min(OUT_MAX, sSide));
    const c = document.createElement('canvas');
    c.width = c.height = out;
    c.getContext('2d')!.drawImage(img.el, sx, sy, sSide, sSide, 0, 0, out, out);
    let q = 0.88;
    let blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', q));
    while (blob && blob.size > 5 * 1024 * 1024 && q > 0.4) {
      q -= 0.12;
      blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', q));
    }
    if (blob) onDone({ blob, size: out, name: name.trim() || 'Mapa', putOnTable });
  };

  return (
    <Modal title="Recortar o mapa" icon={<Crop size={18} />} onClose={onCancel} footer={
      <>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn" onClick={() => void finish(false)} disabled={!img || busy}>Guardar</button>
        <button className="btn primary" onClick={() => void finish(true)} disabled={!img || busy}>{busy ? 'Enviando…' : 'Guardar e pôr na mesa'}</button>
      </>
    }>
      <label className="field" style={{ marginBottom: 10 }}>Nome<input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
      <div
        ref={frame}
        className="crop-frame"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          drag.current = { x: e.clientX, y: e.clientY };
          setV((s) => ({ ...s, ...clamp(s.x + e.clientX - d.x, s.y + e.clientY - d.y) }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {img
          ? <img src={img.el.src} alt="" draggable={false} style={{ width: dispW, height: dispH, transform: `translate(${v.x}px, ${v.y}px)` }} />
          : <div className="empty">Abrindo a imagem…</div>}
      </div>
      <div className="row g8" style={{ marginTop: 10 }}>
        <button className="btn icon sm" aria-label="Afastar" onClick={() => zoomTo(v.z / 1.2)}><Minus size={14} /></button>
        <input type="range" min={1} max={8} step={0.01} value={v.z} onChange={(e) => zoomTo(+e.target.value)} aria-label="Zoom do recorte" className="grow" />
        <button className="btn icon sm" aria-label="Aproximar" onClick={() => zoomTo(v.z * 1.2)}><Plus size={14} /></button>
      </div>
      <p className="small muted m0" style={{ marginTop: 8 }}>Arraste para escolher a parte do mapa e use o zoom para pegar mais ou menos área. O quadrado é exatamente o que aparece na mesa.</p>
    </Modal>
  );
}

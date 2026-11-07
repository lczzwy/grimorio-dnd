import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette } from 'lucide-react';

/** Colour palettes (see themes.css). Swatches: background, panel, detail, accent. */
export const THEMES = [
  { id: 'astral', name: 'Mar astral', desc: 'Azul-noite e latão', sw: ['#060914', '#141c33', '#c8a86a', '#8a3a2a'] },
  { id: 'obsidiana', name: 'Obsidiana', desc: 'Preto, branco e cinza', sw: ['#050505', '#191919', '#d6d6d6', '#4a4a4a'] },
  { id: 'sangue', name: 'Sangue', desc: 'Vermelho escuro e osso', sw: ['#0d0405', '#260e11', '#e2cfa8', '#8e1f24'] },
  { id: 'floresta', name: 'Floresta', desc: 'Verde musgo e bronze', sw: ['#050c08', '#132419', '#c99a5b', '#3f6b3a'] },
  { id: 'arcano', name: 'Arcano', desc: 'Roxo e prata lilás', sw: ['#08050f', '#1c142f', '#c9b6ee', '#5b3a9e'] },
  { id: 'brasa', name: 'Brasa', desc: 'Grafite e âmbar', sw: ['#0a0908', '#211d19', '#e39b3c', '#a2491f'] },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'theme';

export function applyTheme(id: string) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.sw[0]);
}

/** Called before the first render so the page never flashes the wrong colours. */
export function initTheme() {
  let id: string = THEMES[0].id;
  try { id = localStorage.getItem(KEY) || id; } catch { /* private mode */ }
  applyTheme(id);
}

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(() => document.documentElement.dataset.theme || THEMES[0].id);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = (id: string) => {
    applyTheme(id);
    setCur(id);
    try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
  };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button className={'btn ghost sm icon' + (open ? ' active' : '')} title="Tema de cores" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) }); setOpen(!open); }}><Palette size={16} /></button>
      {open && createPortal(
        <div ref={pop} className="theme-pop" role="menu" style={{ top: pos.top, right: pos.right }}>
          <div className="tiny muted" style={{ padding: '0 4px 2px' }}>Tema de cores</div>
          {THEMES.map((t) => (
            <button key={t.id} role="menuitemradio" aria-checked={cur === t.id} className={'theme-opt' + (cur === t.id ? ' on' : '')} onClick={() => pick(t.id)}>
              <span className="sw">{t.sw.map((c) => <i key={c} style={{ background: c }} />)}</span>
              <span><b style={{ display: 'block', fontWeight: 600 }}>{t.name}</b><span className="small muted">{t.desc}</span></span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

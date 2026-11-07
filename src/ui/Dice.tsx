import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useDice } from '../store';
import { D20Icon } from './ui';
import { parseDice } from '../engine/dice';
import { create } from 'zustand';

/** Pages where the dice table and chat already show results turn the roll pop-up off. */
export const useToastQuiet = create<{ quiet: boolean; setQuiet: (q: boolean) => void }>((set) => ({ quiet: false, setQuiet: (quiet) => set({ quiet }) }));

const DICE = [4, 6, 8, 10, 12, 20, 100];

export function AdvToggle() {
  const { mode, setMode, table, setHidden } = useDice();
  return (
    <span className="adv-toggle" title="Vale para a próxima rolagem de d20">
      {table && (
        <button className={table.hidden ? 'on dis' : ''} onClick={() => setHidden(!table.hidden)} title={table.hidden ? (table.isGm ? 'Rolagens escondidas da mesa' : 'Só você e o mestre veem') : 'A mesa vê suas rolagens'}>
          {table.hidden ? '🔒 Oculta' : '👁 Mesa'}
        </button>
      )}
      <button className={'adv' + (mode === 'adv' ? ' on' : '')} onClick={() => setMode(mode === 'adv' ? 'normal' : 'adv')}>VAN</button>
      <button className={'dis' + (mode === 'dis' ? ' on' : '')} onClick={() => setMode(mode === 'dis' ? 'normal' : 'dis')}>DES</button>
    </span>
  );
}

export function RollToast() {
  const { current, dismiss } = useDice();
  const quiet = useToastQuiet((s) => s.quiet);
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(dismiss, current.kind ? 5200 : 3800);
    return () => clearTimeout(t);
  }, [current, dismiss]);
  if (!current || quiet) return null;
  return (
    <div className={'roll-toast ' + (current.kind || '')} key={current.key} onClick={dismiss}>
      <D20Icon className="d20" />
      <div className="grow">
        <div style={{ fontWeight: 700 }}>{current.label}</div>
        <div className="small muted mono">
          {current.formula} → [{current.rolls.join(', ')}]
          {current.dropped && <span className="faint"> (descartado {current.dropped.join(', ')})</span>}
          {current.mode && current.mode !== 'normal' && <span className={current.mode === 'adv' ? 'tag good' : 'tag bad'} style={{ marginLeft: 6 }}>{current.mode === 'adv' ? 'vantagem' : 'desvantagem'}</span>}
        </div>
        {current.kind === 'crit' && <div className="tiny" style={{ color: 'var(--gold)', marginTop: 3 }}>⚡ 20 natural!</div>}
        {current.kind === 'fumble' && <div className="tiny" style={{ color: 'var(--bad)', marginTop: 3 }}>💀 1 natural…</div>}
      </div>
      <div className="total">{current.total}</div>
    </div>
  );
}

export function DiceTray() {
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<Record<number, number>>({});
  const [mod, setMod] = useState(0);
  const [custom, setCustom] = useState('');
  const { roll, log, clear } = useDice();

  const formula = () => {
    const parts = Object.entries(pool).filter(([, n]) => n > 0).map(([s, n]) => `${n}d${s}`);
    if (!parts.length) return '';
    return parts.join('+') + (mod ? (mod > 0 ? `+${mod}` : `${mod}`) : '');
  };

  return (
    <>
      {open && (
        <div className="dice-tray">
          <div className="modal-head" style={{ padding: '12px 14px' }}>
            <D20Icon size={20} />
            <h2 className="grow" style={{ fontSize: 16 }}>Bandeja de Dados</h2>
            <AdvToggle />
            <button className="btn icon sm ghost" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div style={{ padding: 14 }} className="col">
            <div className="dice-grid">
              {DICE.map((d) => (
                <button
                  key={d}
                  className="die-btn"
                  onClick={() => setPool((p) => ({ ...p, [d]: (p[d] || 0) + 1 }))}
                  onContextMenu={(e) => { e.preventDefault(); setPool((p) => ({ ...p, [d]: Math.max(0, (p[d] || 0) - 1) })); }}
                  title="Clique adiciona, botão direito remove"
                >
                  <span className="cnt">{pool[d] ? `×${pool[d]}` : ''}</span>
                  d{d}
                </button>
              ))}
              <button className="die-btn" onClick={() => setMod((m) => m + 1)} onContextMenu={(e) => { e.preventDefault(); setMod((m) => m - 1); }}>
                <span className="cnt">{mod ? (mod > 0 ? `+${mod}` : mod) : ''}</span>±
              </button>
            </div>
            <div className="row">
              <button className="btn primary grow" disabled={!formula()} onClick={() => { roll('Rolagem livre', formula()); setPool({}); setMod(0); }}>
                Rolar {formula() || '…'}
              </button>
              <button className="btn" onClick={() => { setPool({}); setMod(0); }}>Limpar</button>
            </div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (parseDice(custom)) roll(custom, custom); }}>
              <input className="input" placeholder="Fórmula: 4d6+2, 1d20-1…" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button className="btn" disabled={!parseDice(custom)}>Rolar</button>
            </form>
            <div className="row">
              <span className="tiny muted grow">Histórico</span>
              {log.length > 0 && <button className="btn sm ghost" onClick={clear}><Trash2 size={13} /> limpar</button>}
            </div>
          </div>
          <div className="log" style={{ padding: '0 14px 14px' }}>
            {log.length === 0 && <div className="empty small">Nenhuma rolagem ainda. Clique em qualquer número da ficha para rolar.</div>}
            {log.map((l) => (
              <div key={l.id} className={'log-item ' + (l.kind || '')}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.label}</div>
                <div className="tot">{l.total}</div>
                <div className="small muted mono">
                  {l.formula} [{l.rolls.join(', ')}]{l.dropped ? ` ~${l.dropped.join(',')}` : ''} · {new Date(l.at).toLocaleTimeString().slice(0, 5)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button className="dice-fab" onClick={() => setOpen((o) => !o)} aria-label="Dados">
        <D20Icon size={32} />
      </button>
    </>
  );
}

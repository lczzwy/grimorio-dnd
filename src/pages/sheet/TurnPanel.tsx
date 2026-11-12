import { useMemo, useState } from 'react';
import { Detail } from '../../ui/Detail';
import { ChevronDown, ChevronUp, Swords, Sparkles, Zap, RotateCcw } from 'lucide-react';
import { turnOptions, type TurnOption, type TurnSlot } from '../../engine/turn';
import { fmtMod } from '../../engine/dice';
import { Markdown, clickable } from '../../ui/ui';
import { SpellCard } from './SpellsTab';
import { fullAttack } from './attack';
import { PsiOptions } from './PsiOptions';
import type { SheetProps } from '../Sheet';

const COLS: { slot: TurnSlot; title: string; hint: string; icon: typeof Swords }[] = [
  { slot: 'action', title: 'Ação', hint: '1 por turno', icon: Swords },
  { slot: 'bonus', title: 'Ação Bônus', hint: 'só se algo der uma', icon: Zap },
  { slot: 'reaction', title: 'Reação', hint: '1 por rodada, até no turno dos outros', icon: RotateCcw },
];

export function TurnPanel({ c, srd, upd }: SheetProps) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('turn-open') !== '0'; } catch { return true; }
  });
  const [showBasic, setShowBasic] = useState(false);
  const [detail, setDetail] = useState<TurnOption | null>(null);
  const opts = useMemo(() => turnOptions(c, srd), [c, srd]);
  const who = c.name || 'Personagem';

  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem('turn-open', open ? '0' : '1'); } catch { /* private mode */ }
  };

  const chip = (o: TurnOption, i: number) => {
    const icon = o.kind === 'attack' ? <Swords size={13} /> : o.kind === 'spell' ? <Sparkles size={13} /> : null;
    const extra = o.kind === 'attack' ? ` ${fmtMod(o.attack.toHit)}` : '';
    return (
      <button key={o.kind + o.name + i} className={'cond' + (o.kind === 'basic' ? '' : ' on')} style={o.kind === 'basic' ? undefined : { color: 'var(--text)', borderColor: o.kind === 'attack' ? 'var(--accent)' : o.kind === 'spell' ? 'var(--accent-2)' : 'var(--line-2)', background: 'var(--panel-2)' }}
        title={o.kind === 'attack' ? 'Ataque completo (acerto + dano)' : 'Ver descrição'}
        onClick={() => (o.kind === 'attack' ? fullAttack(who, o.attack) : setDetail(o))}>
        {icon} {o.name}{extra}
      </button>
    );
  };

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-title" style={{ marginBottom: open ? 12 : 0, cursor: 'pointer' }} {...clickable(toggle)}>
        <h3>Meu turno</h3>
        <span className="spacer" />
        {open && <label className="row small muted g6" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={showBasic} onChange={(e) => setShowBasic(e.target.checked)} /> ações básicas</label>}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>
      {open && (
        <div className="grid turn-cols">
          {COLS.map(({ slot, title, hint, icon: Icon }) => {
            const list = opts[slot].filter((o) => showBasic || o.kind !== 'basic');
            return (
              <div key={slot} className="col g8">
                <div className="row g6" title={hint}><Icon size={15} /><b>{title}</b><span className="tiny faint">{hint}</span></div>
                <div className="cond-grid">
                  {list.map(chip)}
                  {!list.length && <span className="small faint">{showBasic ? 'Nada.' : 'Nada específico. Marque "ações básicas" para ver as opções gerais.'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {detail && (
        <Detail title={detail.name} onClose={() => setDetail(null)}>
          {detail.kind === 'spell' ? <SpellCard sp={detail.spell} srd={srd} c={c} /> : detail.kind === 'attack' ? null : (
            <div className="col">
              {detail.kind === 'feature' && <span className="tag accent self-start">{detail.source}</span>}
              <Markdown text={detail.desc} />
              {detail.kind === 'feature' && <PsiOptions c={c} upd={upd} name={detail.name} desc={detail.desc} />}
            </div>
          )}
        </Detail>
      )}
    </div>
  );
}

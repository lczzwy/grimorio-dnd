import { useState } from 'react';
import { Brain, Sparkle } from 'lucide-react';
import { hasPsychicFocus, parsePsiOptions, psiPool, type PsiOption } from '../../engine/psi';
import { useFlash } from '../../ui/ui';
import type { SheetProps } from '../Sheet';

/** Spend-psi buttons and psychic focus toggle for a discipline's text. Renders nothing without a psi pool. */
export function PsiOptions({ c, upd, name, desc }: Pick<SheetProps, 'c' | 'upd'> & { name: string; desc: string }) {
  const flash = useFlash((s) => s.show);
  const pool = psiPool(c);
  const options = parsePsiOptions(desc);
  const focusable = hasPsychicFocus(desc);
  const [amount, setAmount] = useState<Record<string, number>>({});
  if (!pool || (!options.length && !focusable)) return null;

  const spend = (o: PsiOption, cost: number) => {
    upd((d) => {
      const r = d.resources.find((x) => x.uid === pool.resource.uid);
      if (r) r.used = Math.min(r.max, r.used + cost);
      if (o.conc) d.concentration = `${name}: ${o.name}`;
    });
    flash(`${o.name}: −${cost} psi (restam ${pool.left - cost})${o.conc ? ' · concentrando' : ''}`);
  };

  const focused = c.psychicFocus === name;
  return (
    <div className="panel col" style={{ padding: 12, marginTop: 10, gap: 8, borderColor: 'var(--accent-2)' }}>
      <div className="row wrap small">
        <Brain size={15} color="var(--accent-2)" />
        <b className="grow">Psi: {pool.left}/{pool.max} <span className="muted" style={{ fontWeight: 400 }}>· limite por uso {pool.limit}</span></b>
        {focusable && (
          <button className={'btn sm' + (focused ? ' active' : '')} onClick={() => upd((d) => (d.psychicFocus = focused ? undefined : name))} title="Ação bônus: escolher esta disciplina como foco psíquico">
            <Sparkle size={13} /> {focused ? 'Foco ativo' : 'Usar como foco'}
          </button>
        )}
      </div>
      {options.map((o) => {
        const top = Math.min(o.max, pool.limit, pool.left);
        const cost = o.min === o.max ? o.min : Math.max(o.min, Math.min(amount[o.name] ?? o.min, top));
        const blocked = o.min > pool.limit ? `acima do limite (${pool.limit})` : o.min > pool.left ? 'psi insuficiente' : '';
        return (
          <div key={o.name} className="row wrap" style={{ gap: 8 }}>
            <span className="grow small"><b>{o.name}</b> <span className="muted">({o.min === o.max ? o.min : `${o.min}–${o.max}`} psi{o.note ? `; ${o.note}` : ''})</span></span>
            {o.min !== o.max && !blocked && (
              <select className="select" style={{ width: 'auto', padding: '4px 8px' }} value={cost} onChange={(e) => setAmount({ ...amount, [o.name]: +e.target.value })}>
                {Array.from({ length: top - o.min + 1 }, (_, i) => o.min + i).map((n) => <option key={n} value={n}>{n} psi</option>)}
              </select>
            )}
            <button className="btn sm" disabled={!!blocked} title={blocked || `Gastar ${cost} psi`} onClick={() => spend(o, cost)}>
              {blocked || `Gastar ${cost}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}

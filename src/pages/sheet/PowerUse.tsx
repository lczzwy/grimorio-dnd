import { useState } from 'react';
import { Brain, Clock, Crosshair, Hourglass, Sparkle } from 'lucide-react';
import type { PowerDef, PowerListDef, PowerOption } from '../../data/types';
import { powerPool } from '../../engine/classData';
import { Markdown, useFlash } from '../../ui/ui';
import type { SheetProps } from '../Sheet';

/** Time, range, duration and cost of a power, in one line of small tags. */
export function PowerMeta({ p, unit }: { p: PowerDef; unit?: string }) {
  const tags: [typeof Clock, string, string][] = [];
  if (p.time) tags.push([Clock, p.time, 'Tempo para usar']);
  if (p.range) tags.push([Crosshair, p.range, 'Alcance']);
  if (p.duration) tags.push([Hourglass, p.duration + (p.conc ? ' (concentração)' : ''), 'Duração']);
  if (p.cost) tags.push([Brain, p.cost, unit ? `Custo em ${unit}` : 'Custo']);
  if (!tags.length) return null;
  return (
    <div className="row wrap g6 power-meta">
      {tags.map(([Icon, text, hint]) => <span key={hint} className="tag" title={hint}><Icon size={12} /> {text}</span>)}
    </div>
  );
}

/**
 * A power opened from the sheet: what it does, its focus (if it has one) and each way to use it
 * with a button that spends the cost from the list's pool. Costs, pool and limit come from data.
 */
export function PowerUse({ c, srd, upd, power, list }: SheetProps & { power: PowerDef; list?: PowerListDef }) {
  const flash = useFlash((s) => s.show);
  const pool = list ? powerPool(c, srd, list) : null;
  const unit = pool?.unit || list?.unit || '';
  const [amount, setAmount] = useState<Record<string, number>>({});
  const focused = c.psychicFocus === power.name;

  const spend = (o: PowerOption, cost: number) => {
    if (!pool) return;
    upd((d) => {
      const r = d.resources.find((x) => x.uid === pool.resource.uid);
      if (r) r.used = Math.min(r.max, r.used + cost);
      if (o.conc) d.concentration = `${power.name}: ${o.name}`;
    });
    flash(`${o.name}: −${cost} ${unit} (restam ${pool.left - cost})${o.conc ? ' · concentrando' : ''}`);
  };

  return (
    <div className="col g10">
      <PowerMeta p={power} unit={unit} />
      <Markdown text={power.desc} />
      {(pool || power.focus) && (
        <div className="row wrap small g8">
          {pool && <b className="grow" title={`Quanto ${unit} você tem agora${pool.limit != null ? ', e o máximo que um único uso pode gastar' : ''}`}>{pool.resource.name}: {pool.left}/{pool.max}{pool.limit != null && <span className="muted" style={{ fontWeight: 400 }}> · até {pool.limit} por uso</span>}</b>}
          {power.focus && (
            <button className={'btn sm' + (focused ? ' active' : '')} onClick={() => upd((d) => (d.psychicFocus = focused ? undefined : power.name))} title={'Foco: ' + power.focus}>
              <Sparkle size={13} /> {focused ? 'Foco ativo' : 'Usar como foco'}
            </button>
          )}
        </div>
      )}
      {power.focus && <div className="power-focus small"><b>Foco:</b> {power.focus}</div>}
      {(power.options || []).map((o) => {
        const min = o.cost ?? 0;
        const max = o.costMax ?? min;
        const top = pool ? Math.min(max, pool.limit ?? max, pool.left) : max;
        const cost = min === max ? min : Math.max(min, Math.min(amount[o.name] ?? min, top));
        const blocked = !pool || !min ? '' : pool.limit != null && min > pool.limit ? `acima do limite (${pool.limit})` : min > pool.left ? `${unit} insuficiente` : '';
        return (
          <div key={o.name} className="power-opt">
            <div className="row wrap g8">
              <span className="grow small"><b>{o.name}</b> {(min > 0 || o.time) && <span className="muted">({[min > 0 ? (min === max ? `${min}` : `${min}–${max}`) + (unit ? ' ' + unit : '') : '', o.time, o.conc ? 'concentração' : ''].filter(Boolean).join('; ')})</span>}</span>
              {pool && min > 0 && min !== max && !blocked && (
                <select className="select" style={{ width: 'auto', padding: '4px 8px' }} value={cost} onChange={(e) => setAmount({ ...amount, [o.name]: +e.target.value })} aria-label={`Quanto ${unit} gastar em ${o.name}`}>
                  {Array.from({ length: top - min + 1 }, (_, i) => min + i).map((n) => <option key={n} value={n}>{n} {unit}</option>)}
                </select>
              )}
              {pool && min > 0 && (
                <button className="btn sm" disabled={!!blocked} title={blocked || `Gastar ${cost} ${unit}`} onClick={() => spend(o, cost)}>{blocked || `Gastar ${cost}`}</button>
              )}
            </div>
            {o.desc && <Markdown className="prose power-opt-text" text={o.desc} />}
          </div>
        );
      })}
    </div>
  );
}

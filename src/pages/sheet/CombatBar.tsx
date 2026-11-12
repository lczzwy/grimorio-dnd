import { useState } from 'react';
import { Heart, Minus, Plus, Sparkles, Swords, Wand2 } from 'lucide-react';
import type { PowerDef, PowerListDef, SpellDef } from '../../data/types';
import { knownPowers, powerLists } from '../../engine/classData';
import { maxHp, spellSlots, weaponAttacks } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { Detail } from '../../ui/Detail';
import { fullAttack } from './attack';
import { PowerUse } from './PowerUse';
import { SpellCard } from './SpellsTab';
import type { SheetProps } from '../Sheet';

/**
 * The strip that stays on top of the sheet while scrolling, with what a fight needs:
 * life (on phones, where the big numbers above are hidden), pools with spend/recover,
 * spell slots, and one-click shortcuts to attacks, powers and spells.
 */
export function CombatBar({ c, srd, upd, onHp }: SheetProps & { onHp: () => void }) {
  const [open, setOpen] = useState<{ power: PowerDef; list?: PowerListDef } | { spell: SpellDef } | null>(null);
  const who = c.name || 'Personagem';
  const max = maxHp(c, srd);
  const lists = powerLists(c, srd);
  const powers = knownPowers(c, srd);
  const attacks = weaponAttacks(c, srd);
  const spells = c.spells
    .map((k) => ({ k, sp: srd.spells.find((s) => s.id === k.id) }))
    .filter((x): x is { k: typeof x.k; sp: SpellDef } => !!x.sp && (x.sp.level === 0 || !!x.k.prepared || !!x.k.alwaysPrepared))
    .sort((a, b) => a.sp.level - b.sp.level || a.sp.name.localeCompare(b.sp.name));
  const { slots } = spellSlots(c, srd);
  const free = slots.map((n, i) => n - (c.slotsUsed[i] || 0));
  const pools = c.resources.filter((r) => r.max > 0);
  const bump = (uid: string, by: number) => upd((d) => { const r = d.resources.find((x) => x.uid === uid); if (r) r.used = Math.max(0, Math.min(r.max, r.used + by)); });

  if (!pools.length && !attacks.length && !powers.length && !spells.length) return null;
  return (
    <div className="combat-bar" aria-label="Barra de combate">
      <button className={'cb-hp' + (c.hp.current <= max / 3 ? ' low' : '')} onClick={onHp} title="Pontos de vida: abrir Combate para dano e cura">
        <Heart size={13} /> <b>{c.hp.current}</b>/{max}{c.hp.temp ? <i> +{c.hp.temp}</i> : null}
      </button>
      {pools.map((r) => (
        <span key={r.uid} className="cb-pool" title={`${r.name}: ${r.reset === 'long' ? 'volta no descanso longo' : r.reset === 'short' ? 'volta no descanso curto' : 'não volta sozinho'}`}>
          <span className="cb-pool-name">{r.name}</span>
          <button className="cb-step" disabled={r.used >= r.max} onClick={() => bump(r.uid, 1)} aria-label={'Gastar 1 de ' + r.name}><Minus size={12} /></button>
          <b>{r.max - r.used}</b><small>/{r.max}</small>
          <button className="cb-step" disabled={r.used <= 0} onClick={() => bump(r.uid, -1)} aria-label={'Recuperar 1 de ' + r.name}><Plus size={12} /></button>
        </span>
      ))}
      {slots.some((n) => n > 0) && (
        <span className="cb-pool" title="Espaços de magia livres por círculo">
          <Wand2 size={12} />
          {slots.map((n, i) => n > 0 && <span key={i} className={'cb-slot' + (free[i] ? '' : ' none')}>{i + 1}º <b>{free[i]}</b></span>)}
        </span>
      )}
      <span className="cb-sep" aria-hidden />
      {attacks.map((a) => (
        <button key={a.uid} className="cb-chip atk" onClick={() => fullAttack(who, a)} title={`Ataque completo: ${fmtMod(a.toHit)} para acertar, ${a.damage}`}>
          <Swords size={12} /> {a.name} <b>{fmtMod(a.toHit)}</b>
        </button>
      ))}
      {powers.map((p) => (
        <button key={p.id} className={'cb-chip pow' + (c.psychicFocus === p.name ? ' focus' : '')} onClick={() => setOpen({ power: p, list: lists.find((l) => l.id === p.list) })} title={[p.time, p.cost].filter(Boolean).join(' · ') || 'Abrir'}>
          <Sparkles size={12} /> {p.name.replace(/\s*\(.*\)$/, '')}
        </button>
      ))}
      {spells.map(({ sp }) => (
        <button key={sp.id} className="cb-chip spl" onClick={() => setOpen({ spell: sp })} title={[sp.level ? sp.level + 'º círculo' : 'Truque', sp.time, sp.range].filter(Boolean).join(' · ')}>
          <Wand2 size={12} /> {sp.name}
        </button>
      ))}

      {open && 'power' in open && (
        <Detail title={open.power.name} onClose={() => setOpen(null)}>
          <PowerUse c={c} srd={srd} upd={upd} power={open.power} list={open.list} />
        </Detail>
      )}
      {open && 'spell' in open && (
        <Detail title={open.spell.name} onClose={() => setOpen(null)}>
          <SpellCard sp={open.spell} srd={srd} c={c} />
          <p className="small muted">Para conjurar e gastar o espaço, use a aba {open.spell.level ? 'Magias' : 'Truques'}.</p>
        </Detail>
      )}
    </div>
  );
}

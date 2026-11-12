import { useState } from 'react';
import { Brain, Heart, Minus, Plus, Sparkle, Sparkles, Swords, Wand2, X, Dices } from 'lucide-react';
import type { PowerDef, PowerListDef, SpellDef } from '../../data/types';
import { knownPowers, powerLists } from '../../engine/classData';
import { CONDITION_PT, initiative, maxHp, spellSlots, weaponAttacks } from '../../engine/rules';
import { useDice } from '../../store';
import { rollMyInitiative, useEncounter } from '../../cloud/combat';
import { showError } from '../../ui/dialogs';
import { fmtMod } from '../../engine/dice';
import { Detail } from '../../ui/Detail';
import { fullAttack } from './attack';
import { PowerUse } from './PowerUse';
import { SpellCard } from './SpellsTab';
import type { SheetProps } from '../Sheet';

/**
 * The strip that stays on top of the sheet while scrolling, with what a fight needs:
 * life (on phones, where the big numbers above are hidden), pools with spend/recover,
 * spell slots, and one-click shortcuts to attacks, powers and spells. What is on right now
 * (concentration, a psychic focus, conditions) shows next to the life, each with an × to end it.
 */
export function CombatBar({ c, srd, upd, onHp, campaignId }: SheetProps & { onHp: () => void; campaignId?: string }) {
  const roll = useDice((s) => s.roll);
  const { encounter, list } = useEncounter(campaignId || '', false);
  const init = initiative(c, srd);
  // when the GM asked for initiative (or the fight is on) and this character has no number yet,
  // the roll goes into the order, like the button on the initiative bar
  const mine = list.find((x) => x.character_id === c.id);
  const joins = !!campaignId && !!encounter && (encounter.init_call || encounter.active) && mine?.initiative == null;
  const rollInit = async () => {
    const r = await roll(`${c.name || 'Personagem'}: Iniciativa`, `1d20${fmtMod(init)}`, { charName: c.name });
    if (r && joins && campaignId) rollMyInitiative(campaignId, r.id).catch(showError);
  };
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
  const { slots, pact } = spellSlots(c, srd);
  const free = slots.map((n, i) => n - (c.slotsUsed[i] || 0));
  const pools = c.resources.filter((r) => r.max > 0);
  const bump = (uid: string, by: number) => upd((d) => { const r = d.resources.find((x) => x.uid === uid); if (r) r.used = Math.max(0, Math.min(r.max, r.used + by)); });

  const concName = c.concentration ? srd.spells.find((x) => x.id === c.concentration)?.name ?? c.concentration : '';
  const states = !!c.concentration || !!c.psychicFocus || c.conditions.length > 0 || c.exhaustion > 0;
  if (!pools.length && !attacks.length && !powers.length && !spells.length && !states) return null;
  return (
    <div className="combat-bar" aria-label="Barra de combate">
      <button className={'cb-chip init' + (joins ? ' call' : '')} onClick={rollInit} title={joins ? 'O mestre pediu iniciativa: rolar e entrar na ordem do combate' : 'Rolar iniciativa'}>
        <Dices size={12} /> Iniciativa <b>{fmtMod(init)}</b>
      </button>
      <button className={'cb-hp' + (c.hp.current <= max / 3 ? ' low' : '')} onClick={onHp} title="Pontos de vida: abrir Combate para dano e cura">
        <Heart size={13} /> <b>{c.hp.current}</b>/{max}{c.hp.temp ? <i> +{c.hp.temp}</i> : null}
      </button>
      {c.concentration && (
        <span className="cb-state conc" title={`Concentrando em ${concName}. Dano pede um teste de Constituição.`}>
          <Brain size={12} /> <span className="cb-state-text">{concName.replace(/\s*\([^)]*\)/g, '')}</span>
          <button onClick={() => upd((d) => (d.concentration = undefined))} aria-label={`Encerrar concentração em ${concName}`} title="Encerrar a concentração"><X size={12} /></button>
        </span>
      )}
      {c.psychicFocus && (
        <span className="cb-state focus" title={`Foco ativo: ${c.psychicFocus}`}>
          <Sparkle size={12} /> <span className="cb-state-text">Foco: {c.psychicFocus.replace(/\s*\([^)]*\)/g, '')}</span>
          <button onClick={() => upd((d) => (d.psychicFocus = undefined))} aria-label="Encerrar o foco" title="Encerrar o foco"><X size={12} /></button>
        </span>
      )}
      {c.conditions.map((k) => (
        <span key={k} className="cb-state cond" title={(CONDITION_PT[k] || k) + ': clique no × para tirar'}>
          {CONDITION_PT[k] || k}
          <button onClick={() => upd((d) => (d.conditions = d.conditions.filter((x) => x !== k)))} aria-label={'Tirar ' + (CONDITION_PT[k] || k)} title="Tirar"><X size={12} /></button>
        </span>
      ))}
      {c.exhaustion > 0 && <span className="cb-state cond" title="Exaustão: ajuste na aba Combate">Exaustão {c.exhaustion}</span>}
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
      {pact && (
        <span className="cb-pool" title={`Magia de pacto: espaços de ${pact.level}º círculo, voltam no descanso curto`}>
          <span className="cb-pool-name">Pacto {pact.level}º</span>
          <button className="cb-step" disabled={c.pactUsed >= pact.count} onClick={() => upd((d) => (d.pactUsed = Math.min(pact.count, d.pactUsed + 1)))} aria-label="Gastar um espaço de pacto"><Minus size={12} /></button>
          <b>{pact.count - c.pactUsed}</b><small>/{pact.count}</small>
          <button className="cb-step" disabled={c.pactUsed <= 0} onClick={() => upd((d) => (d.pactUsed = Math.max(0, d.pactUsed - 1)))} aria-label="Recuperar um espaço de pacto"><Plus size={12} /></button>
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

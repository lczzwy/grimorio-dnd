import { create } from 'zustand';
import type { AttackLine } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { useDice } from '../../store';

/** Attack roll, then damage: natural 20 doubles the dice, natural 1 skips damage. */
export async function fullAttack(who: string, a: AttackLine, attackOnly = false) {
  const roll = useDice.getState().roll;
  const r = await roll(`${who}: ${a.name} (ataque)`, `1d20${fmtMod(a.toHit)}`);
  if (!r || attackOnly) return;
  const nat = r.rolls[0];
  if (nat === 1) return;
  const crit = nat === 20;
  setTimeout(() => roll(`${who}: ${a.name} — dano${crit ? ' CRÍTICO!' : ''} (acerto ${r.total})`, a.damage, { crit }), 1300);
}

/** A weapon with shapes or a two-handed grip waits for the player's choice (see AttackChooser). */
export const useAttackChoice = create<{ pending: { who: string; a: AttackLine } | null; set: (p: { who: string; a: AttackLine } | null) => void }>((set) => ({ pending: null, set: (pending) => set({ pending }) }));

export const needsChoice = (a: AttackLine) => !!a.forms?.length || !!a.altDamage;

/** What every attack button calls: rolls right away, or first asks the shape and the grip. */
export function attack(who: string, a: AttackLine, attackOnly = false) {
  if (attackOnly || !needsChoice(a)) return fullAttack(who, a, attackOnly);
  useAttackChoice.getState().set({ who, a });
}

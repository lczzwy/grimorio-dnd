import type { AttackLine } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { useDice } from '../../store';

/** Attack roll, then damage: natural 20 doubles the dice, natural 1 skips damage. */
export function fullAttack(who: string, a: AttackLine, attackOnly = false) {
  const roll = useDice.getState().roll;
  const r = roll(`${who}: ${a.name} (ataque)`, `1d20${fmtMod(a.toHit)}`);
  if (attackOnly) return;
  const nat = r.rolls[0];
  if (nat === 1) return;
  const crit = nat === 20;
  setTimeout(() => roll(`${who}: ${a.name} — dano${crit ? ' CRÍTICO!' : ''} (acerto ${r.total})`, a.damage, { crit }), 1300);
}

import type { Character } from '../data/types';

/**
 * Damage, healing and death saves on a character being edited (the draft of an update).
 * Used by the full sheet and by the table's combat summary, so both follow the same rules.
 */

/** Temporary HP soak first; damage at 0 HP is a failed death save. Concentration ends at 0. */
export function applyDamage(d: Character, n: number) {
  let left = n;
  const t = Math.min(d.hp.temp, left);
  d.hp.temp -= t;
  left -= t;
  if (d.hp.current <= 0 && left > 0) { d.deathSaves.fail = Math.min(3, d.deathSaves.fail + 1); return; }
  d.hp.current = Math.max(0, d.hp.current - left);
  if (d.hp.current <= 0) d.concentration = undefined;
}

/** Whether this much damage takes a standing character to 0 HP (temporary HP counted). */
export function dropsToZero(c: Character, n: number) {
  return c.hp.current > 0 && c.hp.current - (n - Math.min(c.hp.temp, n)) <= 0;
}

export function applyHeal(d: Character, n: number, max: number) {
  if (d.hp.current <= 0) d.deathSaves = { success: 0, fail: 0 };
  d.hp.current = Math.min(max, d.hp.current + n);
}

/** A death save from the natural d20: 20 wakes up with 1 HP, 1 counts as two failures. */
export function applyDeathSave(d: Character, nat: number) {
  if (nat === 20) { d.hp.current = 1; d.deathSaves = { success: 0, fail: 0 }; return; }
  if (nat === 1) d.deathSaves.fail = Math.min(3, d.deathSaves.fail + 2);
  else if (nat >= 10) d.deathSaves.success = Math.min(3, d.deathSaves.success + 1);
  else d.deathSaves.fail = Math.min(3, d.deathSaves.fail + 1);
}

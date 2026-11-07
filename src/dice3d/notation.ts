import { parseDice } from '../engine/dice';

/** Dice the 3D table can draw. */
const DRAWABLE = new Set([4, 6, 8, 10, 12, 20, 100]);
const MAX_DICE = 20;

export interface Die { sides: number; value: number }

/**
 * Rebuilds the physical dice of a stored roll, in formula order.
 * Advantage/disadvantage keep one d20 and drop the other: both are drawn.
 * Critical hits double every term's dice count (the roller does the same).
 */
export function diceOfRoll(formula: string, rolls: number[], dropped?: number[] | null): Die[] {
  const p = parseDice(formula);
  if (!p) return [];
  const base = p.terms.reduce((n, t) => n + t.count, 0);
  const crit = base > 0 && rolls.length === base * 2;
  const out: Die[] = [];
  let i = 0;
  p.terms.forEach((t, ti) => {
    const count = crit ? t.count * 2 : t.count;
    for (let k = 0; k < count && i < rolls.length; k++) out.push({ sides: t.sides, value: rolls[i++] });
    // the dropped die of advantage/disadvantage belongs to the first d20
    if (ti === 0 && t.sides === 20 && dropped?.length) for (const v of dropped) out.push({ sides: 20, value: v });
  });
  return out.filter((d) => DRAWABLE.has(d.sides) && d.value >= 1 && d.value <= d.sides).slice(0, MAX_DICE);
}

/**
 * Dice → notation with forced results for the 3D library ("1d20+2d6@17,3,5").
 * A d100 is drawn as a tens die plus a d10, like at a real table (57 → 50 and 7; 100 → 00 and 0).
 */
export function forcedNotation(dice: Die[]): string | null {
  const groups: { sides: number; values: number[] }[] = [];
  const push = (sides: number, value: number) => {
    const last = groups[groups.length - 1];
    if (last && last.sides === sides) last.values.push(value);
    else groups.push({ sides, values: [value] });
  };
  for (const d of dice) {
    if (d.sides === 100) {
      const tens = (Math.floor(d.value / 10) % 10) * 10 || 100;
      const units = d.value % 10 || 10;
      push(100, tens);
      push(10, units);
    } else push(d.sides, d.value);
  }
  if (!groups.length) return null;
  return groups.map((g) => `${g.values.length}d${g.sides}`).join('+') + '@' + groups.flatMap((g) => g.values).join(',');
}

/** Dark numbers on light dice, light numbers on dark dice. */
export function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

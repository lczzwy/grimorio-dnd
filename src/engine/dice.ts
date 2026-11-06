export interface DiceTerm { count: number; sides: number; sign: 1 | -1 }
export interface ParsedDice { terms: DiceTerm[]; mod: number }
export type RollMode = 'normal' | 'adv' | 'dis';

export interface RollResult {
  formula: string;
  rolls: number[]; // kept dice
  dropped?: number[];
  sides: number[]; // sides of each kept die, same order as rolls
  mod: number;
  total: number;
  natural?: number; // the kept d20 when the formula has exactly one d20
}

/** Parses things like "2d6+3", "d20 - 1", "1d8+1d4+2". Returns null on garbage. */
export function parseDice(input: string): ParsedDice | null {
  const s = input.replace(/\s+/g, '').toLowerCase();
  if (!s) return null;
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g;
  const terms: DiceTerm[] = [];
  let mod = 0;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index !== consumed) return null;
    consumed = re.lastIndex;
    if (m[3]) {
      const sign = m[1] === '-' ? -1 : 1;
      const count = m[2] ? parseInt(m[2], 10) : 1;
      const sides = parseInt(m[3], 10);
      if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
      terms.push({ count, sides, sign });
    } else {
      mod += (m[4] === '-' ? -1 : 1) * parseInt(m[5], 10);
    }
  }
  if (consumed !== s.length) return null;
  return { terms, mod };
}

const rand = (sides: number) => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
};

export function rollFormula(formula: string, opts: { mode?: RollMode; crit?: boolean } = {}): RollResult {
  const p = parseDice(formula) ?? { terms: [], mod: 0 };
  const rolls: number[] = [];
  const sides: number[] = [];
  const dropped: number[] = [];
  let total = p.mod;
  const singleD20 = p.terms.length >= 1 && p.terms[0].sides === 20 && p.terms[0].count === 1;
  let natural: number | undefined;
  p.terms.forEach((t, i) => {
    const count = opts.crit ? t.count * 2 : t.count;
    if (i === 0 && singleD20 && opts.mode && opts.mode !== 'normal') {
      const a = rand(20);
      const b = rand(20);
      const keep = opts.mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
      dropped.push(keep === a ? b : a);
      rolls.push(keep);
      sides.push(20);
      total += keep * t.sign;
      natural = keep;
      return;
    }
    for (let k = 0; k < count; k++) {
      const r = rand(t.sides);
      rolls.push(r);
      sides.push(t.sides);
      total += r * t.sign;
      if (i === 0 && singleD20) natural = r;
    }
  });
  return { formula, rolls, dropped: dropped.length ? dropped : undefined, sides, mod: p.mod, total, natural };
}

export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

import type { Ability } from '../data/types';
import type { MonsterAction, MonsterDef } from '../data/monsters';
import { parseDice } from '../engine/dice';

/** A creature from the GM's bestiary: an SRD-shaped stat block plus a picture and notes. */
export type Creature = MonsterDef & { image?: string | null; notes?: string };

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function blankCreature(): Creature {
  return {
    id: '',
    name: '',
    size: 'Médio',
    type: 'humanoide',
    ac: 12,
    hp: 11,
    hpDice: '2d8+2',
    speed: '9 m',
    scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    cr: '1/2',
    traits: [],
    actions: [{ name: 'Ataque', desc: 'Ataque corpo a corpo com arma.', toHit: 4, damage: '1d6+2' }],
    image: null,
    notes: '',
  };
}

/** Starts a creature from an SRD monster (to tweak it into a homebrew version). */
export function creatureFromSrd(m: MonsterDef): Creature {
  return { ...normalizeCreature(JSON.parse(JSON.stringify(m))), id: '', image: null, notes: '' };
}

/** Average of a hit-dice formula, like the books print it: "7d8+14" → 45. */
export function averageHp(formula: string): number | null {
  const p = parseDice(formula);
  if (!p || !p.terms.length) return null;
  const avg = p.terms.reduce((t, x) => t + x.sign * x.count * ((x.sides + 1) / 2), 0) + p.mod;
  return Math.max(1, Math.floor(avg));
}

const num = (v: unknown, d: number, min = -Infinity, max = Infinity) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const action = (a: unknown): MonsterAction | null => {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const name = str(o.name).trim();
  if (!name) return null;
  const damage = str(o.damage).replace(/\s+/g, '');
  return {
    name,
    desc: str(o.desc),
    toHit: o.toHit === undefined || o.toHit === null || o.toHit === '' ? undefined : num(o.toHit, 0, -10, 30),
    damage: damage && parseDice(damage) ? damage : undefined,
    dc: str(o.dc) || undefined,
  };
};
const actions = (v: unknown) => (Array.isArray(v) ? v.map(action).filter((x): x is MonsterAction => !!x) : []);

/** Whatever comes from storage or a form, turned into a safe, complete creature. */
export function normalizeCreature(raw: unknown): Creature {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const b = blankCreature();
  const scores = (o.scores && typeof o.scores === 'object' ? o.scores : {}) as Record<string, unknown>;
  const traits = Array.isArray(o.traits)
    ? o.traits.map((t) => (t && typeof t === 'object' ? { name: str((t as Record<string, unknown>).name).trim(), desc: str((t as Record<string, unknown>).desc) } : null)).filter((t): t is { name: string; desc: string } => !!t && !!t.name)
    : [];
  return {
    ...b,
    id: str(o.id),
    name: str(o.name).trim().slice(0, 120),
    size: str(o.size, b.size),
    type: str(o.type, b.type),
    ac: num(o.ac, b.ac, 0, 40),
    hp: num(o.hp, b.hp, 1, 9999),
    hpDice: str(o.hpDice).replace(/\s+/g, ''),
    speed: str(o.speed, b.speed),
    scores: Object.fromEntries(ABILITIES.map((a) => [a, num(scores[a], 10, 1, 30)])) as Record<Ability, number>,
    cr: str(o.cr, b.cr),
    xp: o.xp == null ? undefined : num(o.xp, 0, 0),
    senses: str(o.senses) || undefined,
    languages: str(o.languages) || undefined,
    resist: str(o.resist) || undefined,
    immune: str(o.immune) || undefined,
    vulnerable: str(o.vulnerable) || undefined,
    condImmune: str(o.condImmune) || undefined,
    traits,
    actions: actions(o.actions),
    bonus: actions(o.bonus),
    reactions: actions(o.reactions),
    legendary: actions(o.legendary),
    image: typeof o.image === 'string' && o.image.startsWith('data:image/') ? o.image : null,
    notes: str(o.notes),
  };
}

/** Names for N copies on the table: "Goblin" or "Goblin 1", "Goblin 2"… */
export function copyNames(name: string, count: number): string[] {
  return count <= 1 ? [name] : Array.from({ length: count }, (_, i) => `${name} ${i + 1}`);
}

import type { Character, Edition } from '../data/types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newCharacter(edition: Edition): Character {
  const now = Date.now();
  return {
    id: uid(),
    edition,
    name: '',
    createdAt: now,
    updatedAt: now,
    classes: [],
    xp: 0,
    base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    speciesChoice: [],
    backgroundBonus: {},
    extra: {},
    override: {},
    saveProfs: [],
    skills: {},
    feats: [],
    hp: { current: 0, temp: 0, maxBonus: 0 },
    hitDiceUsed: {},
    deathSaves: { success: 0, fail: 0 },
    conditions: [],
    exhaustion: 0,
    inspiration: false,
    acBonus: 0,
    initBonus: 0,
    speedBonus: 0,
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    attacks: [],
    spells: [],
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactUsed: 0,
    resources: [],
    customFeatures: [],
    proficienciesText: '',
    languagesText: '',
    personality: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
    appearance: '',
    notes: '',
  };
}

/** Fill in fields that older saved/imported characters may lack. */
export function normalizeCharacter(raw: Partial<Character> & { edition: Edition }): Character {
  const base = newCharacter(raw.edition);
  return {
    ...base,
    ...raw,
    hp: { ...base.hp, ...(raw.hp || {}) },
    currency: { ...base.currency, ...(raw.currency || {}) },
    deathSaves: { ...base.deathSaves, ...(raw.deathSaves || {}) },
    slotsUsed: raw.slotsUsed?.length === 9 ? raw.slotsUsed : base.slotsUsed,
  } as Character;
}

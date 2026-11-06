export type Edition = '2014' | '2024';
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export interface Named { id: string; name: string; desc?: string }

export interface SkillDef { key: string; name: string; ability: Ability; desc: string }
export interface AbilityDef { key: Ability; name: string; short: string; desc: string }

export interface FeatureRef { id?: string; name: string; desc: string; level?: number }

export interface SpellcastingLevel { cantrips?: number; known?: number; prepared?: number; slots: number[] }

export interface ClassLevel {
  level: number;
  prof?: number;
  asi?: number;
  features?: FeatureRef[];
  spellcasting?: SpellcastingLevel;
  specific?: Record<string, unknown>;
}

export interface ClassDef {
  id: string;
  name: string;
  hitDie: number;
  primary?: string;
  saves: Ability[];
  profs: string[];
  profIds: string[];
  skillChoice?: { choose: number; from: string[] };
  otherChoices?: string[];
  equipment?: string[];
  spellcasting?: { ability: Ability; level: number; info: { name: string; desc: string }[] };
  multiclass?: { prereq?: { ability: Ability; min: number }[]; prereqAny?: { ability: Ability; min: number }[]; profs?: string[] };
  levels: ClassLevel[];
  custom?: boolean;
}

export interface SubclassDef {
  id: string;
  name: string;
  class: string;
  flavor?: string;
  summary?: string;
  desc?: string;
  features: FeatureRef[];
  spells?: { spell: string; level?: string }[];
  custom?: boolean;
}

export interface Bonus { ability: Ability; bonus: number }

export interface SubraceDef { id: string; name: string; desc?: string; bonuses?: Bonus[]; traits?: FeatureRef[] }

export interface SpeciesDef {
  id: string;
  name: string;
  speed?: number;
  size?: string;
  sizeDesc?: string;
  age?: string;
  alignment?: string;
  creatureType?: string;
  bonuses?: Bonus[];
  bonusChoice?: { choose: number; from: Ability[]; bonus: number };
  languages?: string;
  traits?: FeatureRef[];
  subraces?: SubraceDef[];
  custom?: boolean;
}

export interface BackgroundDef {
  id: string;
  name: string;
  skills?: string[];
  tools?: string[];
  abilities?: Ability[];
  feat?: { id: string; name: string };
  languages?: number;
  feature?: { name: string; desc: string };
  equipment?: string[];
  personality?: string[];
  ideals?: string[];
  bonds?: string[];
  flaws?: string[];
  desc?: string;
  custom?: boolean;
}

export interface FeatDef { id: string; name: string; type?: string; desc: string; prereq?: string; repeatable?: string; custom?: boolean }

export interface SpellDef {
  id: string;
  name: string;
  level: number;
  school?: string;
  classes?: string[];
  time?: string;
  range?: string;
  comp?: string;
  material?: string;
  duration?: string;
  conc?: boolean;
  ritual?: boolean;
  attack?: string;
  save?: Ability;
  dmgType?: string;
  dmgSlot?: Record<string, string>;
  dmgChar?: Record<string, string>;
  heal?: Record<string, string>;
  area?: string;
  desc: string;
  higher?: string;
  custom?: boolean;
}

export interface WeaponStats {
  cat: string; // Simple | Martial
  range: string; // Melee | Ranged
  dmg?: string;
  type?: string;
  twoHanded?: string;
  props?: string[];
  normal?: number;
  long?: number;
  thrown?: string;
  mastery?: string;
}
export interface ArmorStats { cat: string; base: number; dex?: boolean; max?: number; stealth?: boolean; str?: number }

export interface EquipmentDef {
  id: string;
  name: string;
  category: string;
  cost?: string;
  weight?: number;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  desc?: string;
  custom?: boolean;
}

export interface MagicItemDef { id: string; name: string; category?: string; rarity?: string; attune?: boolean | string; desc: string; custom?: boolean }

export interface SrdData {
  edition: Edition;
  abilities: AbilityDef[];
  skills: SkillDef[];
  classes: ClassDef[];
  subclasses: SubclassDef[];
  species: SpeciesDef[];
  backgrounds: BackgroundDef[];
  feats: FeatDef[];
  spells: SpellDef[];
  equipment: EquipmentDef[];
  magicItems: MagicItemDef[];
  conditions: Named[];
  weaponProps: Named[];
  masteries: Named[];
  damageTypes: Named[];
  schools: Named[];
  languages: (Named & { type?: string })[];
  rules: Named[];
}

/* ------------------------------------------------------------------ */
/* Character                                                           */
/* ------------------------------------------------------------------ */

export type ProfLevel = 0 | 0.5 | 1 | 2; // none, half (Jack of all Trades), proficient, expertise

export interface ClassEntry { classId: string; subclassId?: string; level: number }

export interface InventoryItem {
  uid: string;
  refId?: string; // equipment / magic item id
  name: string;
  qty: number;
  weight?: number;
  equipped?: boolean;
  attuned?: boolean;
  notes?: string;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  magicBonus?: number; // +1/+2/+3 weapons & armor
  magic?: boolean;
  proficient?: boolean; // force proficiency (racial training, feats...)
}

export interface CustomAttack {
  uid: string;
  name: string;
  ability: Ability | 'none';
  proficient: boolean;
  bonus: number; // extra to-hit
  damage: string; // e.g. 1d8
  damageBonus: number;
  addMod: boolean;
  type: string;
  notes?: string;
}

export interface Resource { uid: string; name: string; max: number; used: number; reset: 'short' | 'long' | 'none'; auto?: string }

export interface KnownSpell { id: string; prepared?: boolean; alwaysPrepared?: boolean; classId?: string }

export interface CustomFeature { uid: string; name: string; source: string; desc: string }

export interface RollEntry { id: string; label: string; formula: string; rolls: number[]; dropped?: number[]; total: number; kind?: 'crit' | 'fumble'; at: number }

export interface Character {
  id: string;
  edition: Edition;
  name: string;
  player?: string;
  portrait?: string; // data url
  color?: string;
  createdAt: number;
  updatedAt: number;

  classes: ClassEntry[];
  speciesId?: string;
  subraceId?: string;
  backgroundId?: string;
  alignment?: string;
  xp: number;

  base: Record<Ability, number>;
  speciesChoice: Ability[]; // 2014 floating +1 picks (half-elf)
  backgroundBonus: Partial<Record<Ability, number>>; // 2024 +2/+1 or +1/+1/+1
  extra: Partial<Record<Ability, number>>; // ASIs, items, manual tweaks
  override: Partial<Record<Ability, number>>; // e.g. Gauntlets of Ogre Power

  saveProfs: Ability[];
  skills: Record<string, ProfLevel>;
  jackOfAllTrades?: boolean;
  feats: string[]; // feat ids

  hp: { current: number; temp: number; maxOverride?: number; maxBonus: number };
  hitDiceUsed: Record<string, number>; // 'd10' -> used
  deathSaves: { success: number; fail: number };
  conditions: string[];
  exhaustion: number;
  inspiration: boolean;
  concentration?: string; // spell id, or free text for non-spell effects
  psychicFocus?: string; // name of the discipline under psychic focus (Mystic)

  acBonus: number;
  acOverride?: number;
  initBonus: number;
  speedBonus: number;
  unarmoredDefense?: 'barbarian' | 'monk' | 'none';

  inventory: InventoryItem[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  attacks: CustomAttack[];

  spells: KnownSpell[];
  slotsUsed: number[]; // 9 levels
  pactUsed: number;
  spellAbilityOverride?: Ability;

  resources: Resource[];
  customFeatures: CustomFeature[];

  proficienciesText: string;
  languagesText: string;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  appearance: string;
  notes: string;

  rollLog?: RollEntry[];
}

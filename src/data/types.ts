export type Edition = '2014' | '2024';
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export interface Named { id: string; name: string; desc?: string }

export interface SkillDef { key: string; name: string; ability: Ability; desc: string }
export interface AbilityDef { key: Ability; name: string; short: string; desc: string }

/** What a feature is at the table: always on, used with an action/bonus action/reaction, or a pool of uses. */
export type FeatureType = 'passive' | 'action' | 'bonus' | 'reaction' | 'resource';

/** A pick the character makes when gaining a feature, e.g. "choose 1 discipline". */
export interface ChoiceDef {
  /** where the options come from: a power list id (see PowerListDef) or 'feats' */
  list: string;
  count: number;
  label?: string;
  /** only options carrying this tag (e.g. the disciplines of one order) */
  tag?: string;
}

export interface FeatureRef {
  id?: string;
  name: string;
  desc: string;
  level?: number;
  type?: FeatureType;
  choice?: ChoiceDef;
  /** this level gives an Ability Score Improvement (or a feat) */
  asi?: boolean;
  /** this is where the subclass is picked */
  subclass?: boolean;
}

/**
 * A number that grows with the class level, e.g. Psi Points 4/6/14…, disciplines known, a die size.
 * `values[0]` is level 1. With `reset`, it becomes a pool on the sheet (spent and recovered on rests).
 */
export interface CounterDef {
  id: string;
  name: string;
  desc?: string;
  values: number[];
  reset?: 'short' | 'long';
  /** names this pool had before (an old hand-made resource with one of these names is adopted) */
  aliases?: string[];
  /** this counter is the most of counter `limitOf` that one use may spend (e.g. Psi Limit) */
  limitOf?: string;
}

/** A list of powers a class uses (disciplines, talents, invocations…), shown in its own tab. */
export interface PowerListDef {
  id: string;
  name: string;
  desc?: string;
  /** counter id that pays the costs of these powers (e.g. psi points) */
  resource?: string;
  /** short name of the cost unit, e.g. "psi" */
  unit?: string;
}

/** One way to use a power, with its cost in the list's unit. */
export interface PowerOption { name: string; cost?: number; costMax?: number; time?: string; conc?: boolean; desc?: string }

export interface PowerDef {
  id: string;
  name: string;
  /** PowerListDef id */
  list: string;
  /** class level needed to pick it */
  level?: number;
  /** free labels a choice can filter by (e.g. the order a discipline belongs to) */
  tags?: string[];
  time?: string;
  range?: string;
  duration?: string;
  conc?: boolean;
  /** cost text when it isn't split in options, e.g. "1–7 psi" */
  cost?: string;
  /** an ongoing benefit while it is the active focus (Mystic's psychic focus) */
  focus?: string;
  desc: string;
  options?: PowerOption[];
  custom?: boolean;
}

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
  multiclass?: {
    prereq?: { ability: Ability; min: number }[];
    prereqAny?: { ability: Ability; min: number }[];
    profs?: string[];
    /** what entering this class by multiclassing gives, instead of the level 1 package */
    gains?: FeatureRef[];
  };
  levels: ClassLevel[];
  counters?: CounterDef[];
  powerLists?: PowerListDef[];
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
  counters?: CounterDef[];
  powerLists?: PowerListDef[];
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
  powerLists?: PowerListDef[];
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
  en?: string; // original English name when translated
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
  /** homebrew powers (disciplines, talents…); absent from the SRD files */
  powers?: PowerDef[];
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

export interface Resource {
  uid: string;
  name: string;
  max: number;
  used: number;
  reset: 'short' | 'long' | 'none';
  /** managed by the official class rules (rage, ki…) */
  auto?: string;
  /** follows a counter of the class data ("ctr:<class>:<counter>"); kept apart from `auto` so an
   *  older version of the site still treats it as a normal pool and never drops it */
  counter?: string;
}

export interface KnownSpell { id: string; prepared?: boolean; alwaysPrepared?: boolean; classId?: string }

export interface CustomFeature { uid: string; name: string; source: string; desc: string }

export interface RollEntry { id: string; label: string; formula: string; rolls: number[]; dropped?: number[]; total: number; kind?: 'crit' | 'fumble'; at: number }

export interface LevelStep {
  at: number;
  classId: string;
  /** the class level reached */
  level: number;
  /** a short line for the history list, e.g. "+7 PV · Arma Psiônica" */
  summary: string;
  /** the whole sheet just before this level (without the history itself) */
  before: Omit<Character, 'levelHistory'>;
}

export interface Character {
  id: string;
  edition: Edition;
  name: string;
  player?: string;
  portrait?: string; // Storage address (signed in) or data: URL (only on this device)
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
  /** chosen powers (PowerDef ids) from the lists of the character's classes */
  powers?: string[];
  /** one entry per level gained with the wizard, newest last: undoing restores `before` */
  levelHistory?: LevelStep[];

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
  cloud?: boolean; // synced to the user's account
  /** server version this device last saw (see save_character) */
  serverVersion?: number;
  /** this device's updatedAt when it last matched the server: newer edits are not uploaded yet */
  syncedAt?: number;
}

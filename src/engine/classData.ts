import type { Character, ChoiceDef, ClassDef, CounterDef, FeatureRef, PowerDef, PowerListDef, Resource, SrdData } from '../data/types';
import { syncResources } from './rules';

/**
 * Everything a class (or subclass, or species) defines as data: numbers that grow with the level,
 * lists of powers, the picks of each level. No class is named here: a homebrew class works the
 * same as an official one as long as its data says so.
 */

/** The value of a counter at a class level (the last value repeats past the end of the table). */
export function counterValue(def: CounterDef, level: number): number {
  if (!def.values.length) return 0;
  return def.values[Math.min(def.values.length, Math.max(1, level)) - 1] ?? 0;
}

export interface ActiveCounter { key: string; classId: string; level: number; def: CounterDef; value: number }

const classDef = (srd: SrdData, id: string) => srd.classes.find((c) => c.id === id);
const subclassDef = (srd: SrdData, id?: string) => (id ? srd.subclasses.find((s) => s.id === id) : undefined);

/** Every counter of the character's classes and subclasses, at their current class level. */
export function classCounters(c: Character, srd: SrdData): ActiveCounter[] {
  const out: ActiveCounter[] = [];
  for (const e of c.classes) {
    const defs = [...(classDef(srd, e.classId)?.counters || []), ...(subclassDef(srd, e.subclassId)?.counters || [])];
    for (const def of defs) out.push({ key: `ctr:${e.classId}:${def.id}`, classId: e.classId, level: e.level, def, value: counterValue(def, e.level) });
  }
  return out;
}

/** Pools (counters with a rest) as sheet resources; `auto` ties each to its counter. */
export function counterResources(c: Character, srd: SrdData): (Omit<Resource, 'uid' | 'used'> & { counter: string; aliases: string[] })[] {
  return classCounters(c, srd)
    .filter((x) => x.def.reset)
    .map((x) => ({ name: x.def.name, max: x.value, reset: x.def.reset!, counter: x.key, aliases: [x.def.name, ...(x.def.aliases || [])] }));
}

/** The power lists the character has access to (each one becomes a tab on the sheet). */
export function powerLists(c: Character, srd: SrdData): PowerListDef[] {
  const out = new Map<string, PowerListDef>();
  for (const e of c.classes) {
    for (const l of classDef(srd, e.classId)?.powerLists || []) out.set(l.id, l);
    for (const l of subclassDef(srd, e.subclassId)?.powerLists || []) out.set(l.id, l);
  }
  for (const l of srd.species.find((s) => s.id === c.speciesId)?.powerLists || []) out.set(l.id, l);
  return [...out.values()];
}

export const listPowers = (srd: SrdData, list: string) => (srd.powers || []).filter((p) => p.list === list);

/** The powers the character picked, optionally from one list. */
export function knownPowers(c: Character, srd: SrdData, list?: string): PowerDef[] {
  const ids = new Set(c.powers || []);
  return (srd.powers || []).filter((p) => ids.has(p.id) && (!list || p.list === list));
}

/** The pool that pays a list's costs and the most one use may spend, if the data defines them. */
export function powerPool(c: Character, srd: SrdData, list: PowerListDef) {
  if (!list.resource) return null;
  const counters = classCounters(c, srd);
  const ctr = counters.find((x) => x.def.id === list.resource);
  if (!ctr) return null;
  const resource = c.resources.find((r) => r.counter === ctr.key);
  if (!resource) return null;
  const limit = counters.find((x) => x.def.limitOf === list.resource)?.value;
  return { resource, max: resource.max, left: resource.max - resource.used, limit, unit: list.unit || ctr.def.name };
}

/* ---------------- what a level gives ---------------- */

// Official (SRD) classes don't mark these levels, so their English feature names are the fallback.
// Homebrew classes mark them in the editor (`asi`, `subclass` on the feature).
const ASI_NAME = /ability score improvement|aumento de atributo/i;
const SUBCLASS_NAME = /subclass|archetype|path|college|domain|circle|oath|tradition|origin|patron|conclave/i;
export const isAsiFeature = (f: FeatureRef) => f.asi ?? ASI_NAME.test(f.name);
export const isSubclassFeature = (f: FeatureRef) => f.subclass ?? SUBCLASS_NAME.test(f.name);

export interface LevelChoice { key: string; source: string; choice: ChoiceDef }
export interface LevelGains {
  cls: ClassDef;
  /** the class level being reached */
  level: number;
  /** entering this class now, while having another one */
  multiclass: boolean;
  features: FeatureRef[];
  choices: LevelChoice[];
  asi: boolean;
  subclass: boolean;
  counters: { def: CounterDef; from: number; to: number }[];
}

/** What reaching `classId` level N gives, read only from the class/subclass data. */
export function levelGains(c: Character, srd: SrdData, classId: string, subclassId?: string): LevelGains | null {
  const cls = classDef(srd, classId);
  if (!cls) return null;
  const entry = c.classes.find((e) => e.classId === classId);
  const level = (entry?.level || 0) + 1;
  const multiclass = !entry && c.classes.length > 0;
  const row = cls.levels.find((l) => l.level === level);
  const sub = subclassDef(srd, entry?.subclassId || subclassId);
  const features: FeatureRef[] = [
    ...(row?.features || []),
    ...(multiclass ? cls.multiclass?.gains || [] : []),
    ...(sub?.features.filter((f) => (f.level ?? 0) === level) || []),
  ];
  const choices = features.filter((f) => f.choice && f.choice.count > 0).map((f, i) => ({ key: `${f.name}#${i}`, source: f.name, choice: f.choice! }));
  // a homebrew class that marks no level at all gets the usual 4/8/12/16/19
  const marksAsi = cls.levels.some((l) => (l.features || []).some((f) => f.asi !== undefined));
  const asi = features.some(isAsiFeature) || (!!cls.custom && !marksAsi && [4, 8, 12, 16, 19].includes(level));
  const subclass = !entry?.subclassId && (row?.features || []).some(isSubclassFeature);
  const counters = [...(cls.counters || []), ...(sub?.counters || [])]
    .map((def) => ({ def, from: level > 1 ? counterValue(def, level - 1) : 0, to: counterValue(def, level) }))
    .filter((x) => x.from !== x.to);
  return { cls, level, multiclass, features, choices, asi, subclass, counters };
}

/** Options for a choice, minus what the character already has (and powers above their level). */
export function choiceOptions(c: Character, srd: SrdData, choice: ChoiceDef, classLevel: number): { id: string; name: string; desc: string; level?: number }[] {
  if (choice.list === 'feats') return srd.feats.filter((f) => !c.feats.includes(f.id) || !!f.repeatable).map((f) => ({ id: f.id, name: f.name, desc: f.desc }));
  const have = new Set(c.powers || []);
  return listPowers(srd, choice.list).filter((p) => !have.has(p.id) && (p.level ?? 1) <= classLevel && (!choice.tag || (p.tags || []).includes(choice.tag))).map((p) => ({ id: p.id, name: p.name, desc: p.desc, level: p.level }));
}

/* ---------------- migration of older sheets ---------------- */

export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** "Arma Psiônica (Psionic Weapon)" → ["arma psionica psionic weapon", "arma psionica", "psionic weapon"] */
export function nameForms(name: string): string[] {
  const out = new Set<string>([fold(name)]);
  const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) { out.add(fold(m[1])); out.add(fold(m[2])); }
  return [...out].filter(Boolean);
}

/** Whether a hand-written feature (e.g. "Psionic Weapon (Immortal)") is this power. */
export function sameAsPower(power: PowerDef, name: string): boolean {
  const mine = nameForms(power.name);
  return nameForms(name).some((n) => mine.includes(n));
}

/**
 * Sheets made before power lists existed kept disciplines as hand-written features or as feats.
 * Returns the power ids those match, or null while there are no powers to match against yet
 * (the sheet is left alone and tried again once the campaign's homebrew arrives).
 * Nothing is removed: the old entries stay, so an older version of the site still reads the sheet.
 */
export function migratePowers(c: Character, srd: SrdData): string[] | null {
  if (c.powers) return null;
  const all = srd.powers || [];
  const lists = new Set(powerLists(c, srd).map((l) => l.id));
  const pool = all.filter((p) => lists.has(p.list));
  if (!pool.length) return null;
  const ids = new Set<string>();
  for (const f of c.customFeatures) {
    const p = pool.find((x) => sameAsPower(x, f.name));
    if (p) ids.add(p.id);
  }
  for (const id of c.feats) if (pool.some((p) => p.id === id)) ids.add(id);
  return [...ids];
}

/** Hand-written features that are now shown as powers (so they aren't listed twice). */
export function featuresShownAsPowers(c: Character, srd: SrdData): Set<string> {
  const mine = knownPowers(c, srd);
  return new Set(c.customFeatures.filter((f) => mine.some((p) => sameAsPower(p, f.name))).map((f) => f.uid));
}

/**
 * Brings an older sheet up to the class data, only by adding: its disciplines become powers,
 * and a hand-made pool with a counter's name starts following the class table.
 * Returns the change to apply, or null when the sheet is already up to date.
 */
export function sheetMigration(c: Character, srd: SrdData, mkId: () => string): ((d: Character) => void) | null {
  const powers = migratePowers(c, srd);
  const missingPool = counterResources(c, srd).some((x) => !c.resources.some((r) => r.counter === x.counter));
  if (!powers && !missingPool) return null;
  return (d) => {
    if (powers) d.powers = powers;
    if (missingPool) d.resources = syncResources(d, srd, mkId);
  };
}

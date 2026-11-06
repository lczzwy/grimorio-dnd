// Importer for "5e Companion App" character exports (.cah, JSON).
// The export embeds full definitions for the character's class, race and background,
// so anything missing from the SRD (e.g. UA/third-party content) is turned into homebrew.
import type { Ability, BackgroundDef, Character, ClassDef, ClassLevel, FeatDef, FeatureRef, InventoryItem, ProfLevel, SpeciesDef, SpellDef, SrdData, SubclassDef } from '../data/types';
import { ABILITIES } from '../data/types';
import { newCharacter, uid } from '../engine/character';
import { computeScores, maxHp, profBonus } from '../engine/rules';
import type { Homebrew } from '../store';

/* ---------------- raw shapes (only the parts we read) ---------------- */

interface DescModel { description: string; level?: number }
interface RawFeat { name: string; descriptionModels?: DescModel[]; descriptions?: DescModel[] }
interface RawLevelFeat { level: number; feat: RawFeat }
interface RawSpell { name: string; level: number; school?: string; castingTime?: string; range?: string; components?: string; duration?: string; description?: string; higherLevels?: string; isRitual?: boolean; classes?: string; prepared?: boolean }
interface RawClass {
  id: string; name: string; hitDie?: string; savingThrows?: Record<string, boolean>; spellcastingAbility?: string;
  features?: RawLevelFeat[]; archetypes?: { id: string; name: string; features?: RawLevelFeat[] }[];
  armorProficiencies?: { proficiency: string }[]; weaponProficiencies?: { proficiency: string }[];
  classSkills?: { amountOfChoice: number; skillsModels: { name: string }[] }[];
  spellSlots?: unknown;
}
interface RawRace { id?: string; name: string; abilityScores?: Record<string, number>; speed?: { normal?: number }; traits?: RawLevelFeat[]; spells?: { level: number; spellModel: RawSpell }[] }
interface RawBackground { id?: string; name: string; features?: RawLevelFeat[]; skills?: { skillsModels: { name: string }[] }[]; tools?: { description: string }[] }
interface RawAbility { score: number; save: boolean }

export interface CompanionFile {
  jsonType?: string;
  name: string;
  player?: string;
  alignmentName?: string;
  exp?: number;
  hp?: number;
  tempHp?: number;
  successes?: number;
  failures?: number;
  hasInspiration?: boolean;
  personalityTraits?: string; ideals?: string; bonds?: string; flaws?: string; about?: string;
  copper?: number; silver?: number; electrum?: number; gold?: number; platinum?: number;
  extraAC?: number; initiativeModifier?: number; speedModifier?: number;
  strength: RawAbility; dexterity: RawAbility; constitution: RawAbility; intelligence: RawAbility; wisdom: RawAbility; charisma: RawAbility;
  skills?: { typeName: string; proficiencyName: string }[];
  proficiencies?: { name: string; typeName: string }[];
  jobs?: { jobId: string; archetypeId?: string; level: number }[];
  allRequiredClasses?: { jobs?: string[] };
  requiredRace?: string;
  requiredBackground?: string;
  race?: { raceId?: string };
  background?: { backgroundId?: string };
  equipment?: { name?: string; amount?: number; isEquipped?: boolean; isAttuned?: boolean; description?: string; item?: { name?: string; description?: string } }[];
  feats?: RawFeat[];
  spells?: RawSpell[];
  specialAbilities?: { name: string; usesLeft?: number; amountsPerLevel?: { amount: number; level: number; associatedValue?: string }[]; associatedValueName?: string }[];
  selectableFeatures?: { name: string; selectedFeatures?: RawFeat[] }[];
  notes?: { text: string }[];
  conditions?: Record<string, unknown>;
}

export const isCompanionFile = (x: unknown): x is CompanionFile =>
  !!x && typeof x === 'object' && (x as CompanionFile).jsonType === 'character' && 'strength' in (x as object) && ('jobs' in (x as object) || 'allRequiredClasses' in (x as object));

/* ---------------- helpers ---------------- */

const ABILITY_KEYS: Record<Ability, keyof CompanionFile> = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' };
const RACE_SCORE_KEYS: Record<string, Ability> = { str: 'str', dex: 'dex', con: 'con', intelligence: 'int', int: 'int', wis: 'wis', cha: 'cha' };
const ABILITY_BY_NAME: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

const ALIGN: Record<string, string> = {
  LAWFUL_GOOD: 'Leal e Bom', NEUTRAL_GOOD: 'Neutro e Bom', CHAOTIC_GOOD: 'Caótico e Bom',
  LAWFUL_NEUTRAL: 'Leal e Neutro', NEUTRAL: 'Neutro', TRUE_NEUTRAL: 'Neutro', CHAOTIC_NEUTRAL: 'Caótico e Neutro',
  LAWFUL_EVIL: 'Leal e Mau', NEUTRAL_EVIL: 'Neutro e Mau', CHAOTIC_EVIL: 'Caótico e Mau',
};

const SKILL_PROF: Record<string, ProfLevel> = { NONE: 0, HALF: 0.5, FULL: 1, EXPERTISE: 2, DOUBLE: 2 };

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\[[^\]]*\]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const skillKey = (typeName: string) => typeName.toLowerCase().replace(/_/g, '-');
const cleanName = (s: string) => s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();

function parseJson<T>(s: string | undefined): T | undefined {
  if (!s) return undefined;
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
}

/** Joins level-scaled descriptions ("Nível 3. …") or returns the single one. */
function featDesc(f: RawFeat): string {
  const models = f.descriptionModels || f.descriptions || [];
  if (models.length <= 1) return models[0]?.description || '';
  return models.map((m) => `**Nível ${m.level ?? 1}.** ${m.description}`).join('\n\n');
}

const toFeature = (lf: RawLevelFeat): FeatureRef => ({ name: lf.feat.name, desc: featDesc(lf.feat), level: lf.level });

function toSpell(s: RawSpell, homebrewId: string): SpellDef {
  return {
    id: homebrewId,
    name: s.name,
    level: s.level,
    school: s.school ? s.school[0].toUpperCase() + s.school.slice(1).toLowerCase() : undefined,
    classes: (s.classes || '').split(',').map((x) => x.trim()).filter((x) => x && !x.includes('_')),
    time: s.castingTime,
    range: s.range,
    comp: s.components,
    duration: s.duration?.replace(/^Concentration,\s*/i, ''),
    conc: /concentration/i.test(s.duration || '') || undefined,
    ritual: s.isRitual || undefined,
    desc: s.description || '',
    higher: s.higherLevels || undefined,
    custom: true,
  };
}

const findByName = <T extends { name: string }>(list: T[], name: string) => {
  const n = cleanName(name).toLowerCase();
  return list.find((x) => x.name.toLowerCase() === n);
};

/* ---------------- main ---------------- */

export interface CompanionImport { character: Character; homebrew: Homebrew; warnings: string[] }

export function importCompanion(raw: CompanionFile, srd: SrdData): CompanionImport {
  const warnings: string[] = [];
  const hb: Required<Pick<Homebrew, 'classes' | 'subclasses' | 'species' | 'backgrounds' | 'feats' | 'spells'>> = { classes: [], subclasses: [], species: [], backgrounds: [], feats: [], spells: [] };
  const c = newCharacter('2014');
  c.name = raw.name || 'Importado';
  c.player = raw.player || undefined;
  c.alignment = raw.alignmentName ? ALIGN[raw.alignmentName] : undefined;
  c.xp = raw.exp || 0;
  c.inspiration = !!raw.hasInspiration;
  c.personality = raw.personalityTraits || '';
  c.ideals = raw.ideals || '';
  c.bonds = raw.bonds || '';
  c.flaws = raw.flaws || '';
  c.backstory = raw.about || '';
  c.currency = { cp: raw.copper || 0, sp: raw.silver || 0, ep: raw.electrum || 0, gp: raw.gold || 0, pp: raw.platinum || 0 };
  c.acBonus = raw.extraAC || 0;
  c.initBonus = raw.initiativeModifier || 0;
  c.speedBonus = raw.speedModifier || 0;
  c.deathSaves = { success: raw.successes || 0, fail: raw.failures || 0 };
  c.notes = (raw.notes || []).map((n) => n.text).filter((t) => !/swipe this message/i.test(t)).join('\n\n');

  /* ---- class(es) ---- */
  const rawClasses = (raw.allRequiredClasses?.jobs || []).map((s) => parseJson<RawClass>(s)).filter((x): x is RawClass => !!x);
  for (const job of raw.jobs || []) {
    const rc = rawClasses.find((x) => x.id === job.jobId);
    let classId = srd.classes.find((k) => k.id === job.jobId || k.name.toLowerCase() === (rc?.name || job.jobId).toLowerCase())?.id;
    if (!classId && rc) {
      classId = 'hb-' + slug(rc.name);
      const hitDie = parseInt((rc.hitDie || 'D8').replace(/\D/g, ''), 10) || 8;
      const features = (rc.features || []).map(toFeature);
      const levels: ClassLevel[] = Array.from({ length: 20 }, (_, i) => ({
        level: i + 1,
        prof: profBonus(i + 1),
        features: features.filter((f) => (f.level || 1) === i + 1).map((f) => ({ name: f.name, desc: f.desc })),
      }));
      const spellAb = rc.spellcastingAbility ? ABILITY_BY_NAME[rc.spellcastingAbility.toLowerCase()] : undefined;
      const def: ClassDef = {
        id: classId,
        name: rc.name,
        hitDie,
        saves: Object.entries(rc.savingThrows || {}).filter(([, v]) => v).map(([k]) => RACE_SCORE_KEYS[k]).filter(Boolean),
        profs: [...(rc.armorProficiencies || []).map((p) => p.proficiency), ...(rc.weaponProficiencies || []).map((p) => (p.proficiency === 'all_simple' ? 'Simple Weapons' : p.proficiency === 'all_martial' ? 'Martial Weapons' : p.proficiency))],
        profIds: [],
        skillChoice: rc.classSkills?.[0] ? { choose: rc.classSkills[0].amountOfChoice, from: rc.classSkills[0].skillsModels.map((s) => slug(s.name)) } : undefined,
        spellcasting: spellAb ? { ability: spellAb, level: 1, info: [] } : undefined,
        levels,
        custom: true,
      };
      hb.classes.push(def);
      for (const a of rc.archetypes || []) {
        const sub: SubclassDef = { id: 'hb-' + slug(rc.name + ' ' + a.name), name: a.name, class: classId, features: (a.features || []).map(toFeature), custom: true };
        hb.subclasses.push(sub);
      }
    }
    if (!classId) {
      warnings.push(`Classe "${job.jobId}" não encontrada.`);
      continue;
    }
    const archName = rc?.archetypes?.find((a) => a.id === job.archetypeId)?.name;
    const subclassId = archName
      ? (srd.subclasses.find((s) => s.class === classId && s.name.toLowerCase() === archName.toLowerCase())?.id ?? hb.subclasses.find((s) => s.class === classId && s.name === archName)?.id)
      : undefined;
    c.classes.push({ classId, level: job.level || 1, subclassId });
  }

  /* ---- race ---- */
  const rr = parseJson<RawRace>(raw.requiredRace);
  let raceBonus: Partial<Record<Ability, number>> = {};
  if (rr) {
    const existing = findByName(srd.species, rr.name);
    if (existing) c.speciesId = existing.id;
    else {
      const bonuses = Object.entries(rr.abilityScores || {}).filter(([, v]) => v).map(([k, v]) => ({ ability: RACE_SCORE_KEYS[k], bonus: v })).filter((b) => b.ability);
      const sp: SpeciesDef = { id: 'hb-' + slug(rr.name), name: rr.name, speed: rr.speed?.normal ?? 30, size: 'Medium', bonuses, traits: (rr.traits || []).map((t) => ({ name: t.feat.name, desc: featDesc(t.feat) })), custom: true };
      hb.species.push(sp);
      c.speciesId = sp.id;
      raceBonus = Object.fromEntries(bonuses.map((b) => [b.ability, b.bonus]));
    }
  }

  /* ---- background ---- */
  const rb = parseJson<RawBackground>(raw.requiredBackground);
  if (rb) {
    const existing = findByName(srd.backgrounds, rb.name);
    if (existing) c.backgroundId = existing.id;
    else {
      const feat = rb.features?.[0];
      const bg: BackgroundDef = {
        id: 'hb-' + slug(rb.name),
        name: rb.name,
        skills: (rb.skills || []).flatMap((s) => s.skillsModels.map((m) => slug(m.name))),
        tools: (rb.tools || []).map((t) => t.description).filter(Boolean),
        feature: feat ? { name: feat.feat.name, desc: featDesc(feat.feat) } : undefined,
        custom: true,
      };
      hb.backgrounds.push(bg);
      c.backgroundId = bg.id;
    }
  }

  /* ---- ability scores: the export stores final scores, so base = final − racial bonus ---- */
  const srdSpecies = srd.species.find((s) => s.id === c.speciesId);
  for (const a of ABILITIES) {
    const r = raw[ABILITY_KEYS[a]] as RawAbility | undefined;
    const fromSrd = srdSpecies?.bonuses?.find((b) => b.ability === a)?.bonus || 0;
    c.base[a] = (r?.score ?? 10) - (raceBonus[a] || 0) - fromSrd;
    if (r?.save) c.saveProfs.push(a);
  }

  /* ---- skills & proficiencies ---- */
  for (const s of raw.skills || []) {
    const lvl = SKILL_PROF[s.proficiencyName] ?? 0;
    if (lvl) c.skills[skillKey(s.typeName)] = lvl;
  }
  const profs = raw.proficiencies || [];
  c.proficienciesText = profs.filter((p) => p.typeName !== 'LANGUAGE').map((p) => p.name).join(', ');
  c.languagesText = profs.filter((p) => p.typeName === 'LANGUAGE').map((p) => p.name).join(', ') || 'Common';

  /* ---- feats ---- */
  for (const f of raw.feats || []) {
    const name = cleanName(f.name);
    const existing = findByName(srd.feats, name);
    if (existing) c.feats.push(existing.id);
    else {
      const fd: FeatDef = { id: 'hb-' + slug(name), name, desc: featDesc(f), custom: true };
      hb.feats.push(fd);
      c.feats.push(fd.id);
    }
  }

  /* ---- spells ---- */
  for (const s of raw.spells || []) {
    const existing = findByName(srd.spells, s.name);
    let id = existing?.id;
    if (!id) {
      const sd = toSpell(s, 'hb-' + slug(s.name));
      hb.spells.push(sd);
      id = sd.id;
    }
    if (!c.spells.some((k) => k.id === id)) c.spells.push({ id, prepared: s.level === 0 || !!s.prepared });
  }

  /* ---- equipment ---- */
  for (const e of raw.equipment || []) {
    const name = e.name || e.item?.name;
    if (!name) continue;
    const ref = findByName(srd.equipment, name) || findByName(srd.magicItems, name);
    const eq = ref && 'category' in ref ? (ref as SrdData['equipment'][number]) : undefined;
    const item: InventoryItem = {
      uid: uid(),
      refId: ref?.id,
      name: ref?.name || name,
      qty: e.amount || 1,
      weight: eq?.weight,
      weapon: eq?.weapon,
      armor: eq?.armor,
      equipped: !!e.isEquipped,
      attuned: !!e.isAttuned,
      notes: e.description || (!ref ? e.item?.description : undefined) || undefined,
      magic: !!e.item && !ref,
    };
    c.inventory.push(item);
  }

  /* ---- class resources (Psi Points, etc.) ---- */
  const lvl = c.classes.reduce((s, x) => s + x.level, 0) || 1;
  for (const sa of raw.specialAbilities || []) {
    const row = [...(sa.amountsPerLevel || [])].filter((r) => r.level <= lvl).pop();
    const max = row?.amount ?? sa.usesLeft ?? 0;
    if (!max) continue;
    c.resources.push({ uid: uid(), name: sa.name, max, used: Math.max(0, max - (sa.usesLeft ?? max)), reset: 'long' });
    if (sa.associatedValueName && row?.associatedValue) {
      c.customFeatures.push({ uid: uid(), name: `${sa.associatedValueName}: ${row.associatedValue}`, source: sa.name, desc: `Valor atual de ${sa.associatedValueName} no nível ${lvl}: **${row.associatedValue}**.` });
    }
  }

  /* ---- chosen options (disciplines, talents, invocations...) ---- */
  for (const sf of raw.selectableFeatures || []) {
    for (const f of sf.selectedFeatures || []) {
      c.customFeatures.push({ uid: uid(), name: f.name, source: sf.name, desc: featDesc(f) });
    }
  }

  /* ---- AC & HP ---- */
  const allFeatureText = [...hb.subclasses.filter((s) => c.classes.some((x) => x.subclassId === s.id)).flatMap((s) => s.features), ...hb.classes.flatMap((k) => k.levels.flatMap((l) => l.features || []))].map((f) => f.desc).join('\n');
  if (/10 \+ your Dexterity modifier \+ your Constitution modifier/i.test(allFeatureText)) c.unarmoredDefense = 'barbarian';
  if (/hit point maximum increases by 1 per \w+ level/i.test(allFeatureText)) c.hp.maxBonus = lvl;

  const merged: SrdData = { ...srd, classes: [...srd.classes, ...hb.classes], subclasses: [...srd.subclasses, ...hb.subclasses], species: [...srd.species, ...hb.species], backgrounds: [...srd.backgrounds, ...hb.backgrounds], feats: [...srd.feats, ...hb.feats], spells: [...srd.spells, ...hb.spells] };
  const computedMax = maxHp(c, merged);
  const current = raw.hp ?? computedMax;
  if (current > computedMax) {
    c.hp.maxOverride = current;
    warnings.push(`PV máximo ajustado para ${current} (valor do app; o cálculo padrão daria ${computedMax}).`);
  }
  c.hp.current = current;
  c.hp.temp = raw.tempHp || 0;

  const scores = computeScores(c, merged);
  for (const a of ABILITIES) {
    const want = (raw[ABILITY_KEYS[a]] as RawAbility | undefined)?.score;
    if (want != null && scores[a] !== want) warnings.push(`${a.toUpperCase()} ficou ${scores[a]} (arquivo: ${want}).`);
  }

  const homebrew: Homebrew = Object.fromEntries(Object.entries(hb).filter(([, v]) => v.length)) as Homebrew;
  return { character: c, homebrew, warnings };
}

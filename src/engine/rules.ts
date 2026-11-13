import type { Ability, Character, ClassDef, FeatureRef, Resource, SpeciesDef, SrdData, SubraceDef, WeaponStats } from '../data/types';
import { ABILITIES } from '../data/types';
import { counterResources } from './classData';

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const profBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
export const totalLevel = (c: Character) => Math.max(1, c.classes.reduce((s, e) => s + e.level, 0));

export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

// lookups tolerate data that hasn't loaded yet (pages render once before the SRD fetch resolves)
export const findClass = (srd: SrdData | null | undefined, id?: string) => srd?.classes.find((c) => c.id === id);
export const findSpecies = (srd: SrdData | null | undefined, id?: string) => srd?.species.find((s) => s.id === id);
export function findSubrace(srd: SrdData, c: Character): SubraceDef | undefined {
  return findSpecies(srd, c.speciesId)?.subraces?.find((s) => s.id === c.subraceId);
}
export const findBackground = (srd: SrdData | null | undefined, id?: string) => srd?.backgrounds.find((b) => b.id === id);

/* ---------------- ability scores ---------------- */

export function speciesBonuses(c: Character, srd: SrdData): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  const add = (a: Ability, n: number) => (out[a] = (out[a] || 0) + n);
  const sp: SpeciesDef | undefined = findSpecies(srd, c.speciesId);
  sp?.bonuses?.forEach((b) => add(b.ability, b.bonus));
  findSubrace(srd, c)?.bonuses?.forEach((b) => add(b.ability, b.bonus));
  if (sp?.bonusChoice) c.speciesChoice.slice(0, sp.bonusChoice.choose).forEach((a) => add(a, sp.bonusChoice!.bonus));
  return out;
}

export function computeScores(c: Character, srd: SrdData): Record<Ability, number> {
  const sb = speciesBonuses(c, srd);
  const out = {} as Record<Ability, number>;
  for (const a of ABILITIES) {
    const v = (c.base[a] || 0) + (sb[a] || 0) + (c.backgroundBonus[a] || 0) + (c.extra[a] || 0);
    const ov = c.override[a];
    out[a] = ov && ov > v ? ov : v;
  }
  return out;
}

export function mods(c: Character, srd: SrdData): Record<Ability, number> {
  const s = computeScores(c, srd);
  return Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(s[a])])) as Record<Ability, number>;
}

/* ---------------- class helpers ---------------- */

export function classLevel(c: Character, id: string) {
  return c.classes.find((e) => e.classId === id)?.level ?? 0;
}

export function classSpecific(c: Character, srd: SrdData, classId: string): Record<string, unknown> {
  const lv = classLevel(c, classId);
  const cls = findClass(srd, classId);
  return (cls?.levels.find((l) => l.level === lv)?.specific as Record<string, unknown>) || {};
}

export const pb = (c: Character) => profBonus(totalLevel(c));

/* ---------------- saves & skills ---------------- */

export function saveMod(c: Character, srd: SrdData, a: Ability) {
  return mods(c, srd)[a] + (c.saveProfs.includes(a) ? pb(c) : 0);
}

export function hasJack(c: Character) {
  return !!c.jackOfAllTrades || classLevel(c, 'bard') >= 2;
}

export function skillMod(c: Character, srd: SrdData, key: string) {
  const sk = srd.skills.find((s) => s.key === key);
  if (!sk) return 0;
  const lvl = c.skills[key] || 0;
  const p = pb(c);
  let bonus = 0;
  if (lvl === 2) bonus = p * 2;
  else if (lvl === 1) bonus = p;
  else if (lvl === 0.5 || hasJack(c)) bonus = Math.floor(p / 2);
  return mods(c, srd)[sk.ability] + bonus;
}

/** CON save DC to keep concentration after taking damage. */
export const concentrationDc = (damage: number, edition: Character['edition']) => {
  const dc = Math.max(10, Math.floor(damage / 2));
  return edition === '2024' ? Math.min(30, dc) : dc;
};

export const passivePerception = (c: Character, srd: SrdData) => 10 + skillMod(c, srd, 'perception');
export const passiveInvestigation = (c: Character, srd: SrdData) => 10 + skillMod(c, srd, 'investigation');
export const passiveInsight = (c: Character, srd: SrdData) => 10 + skillMod(c, srd, 'insight');

/* ---------------- armor class ---------------- */

export function equippedArmor(c: Character) {
  const body = c.inventory.find((i) => i.equipped && i.armor && i.armor.cat !== 'Shield');
  const shield = c.inventory.find((i) => i.equipped && i.armor?.cat === 'Shield');
  return { body, shield };
}

export function armorClass(c: Character, srd: SrdData): { value: number; breakdown: string } {
  const m = mods(c, srd);
  const { body, shield } = equippedArmor(c);
  let value: number;
  let breakdown: string;
  if (body?.armor) {
    const a = body.armor;
    let dex = 0;
    if (a.dex !== false && a.cat !== 'Heavy') dex = a.max != null ? Math.min(m.dex, a.max) : m.dex;
    value = a.base + dex + (body.magicBonus || 0);
    breakdown = `${body.name} ${a.base}${dex ? ` + DES ${dex}` : ''}${body.magicBonus ? ` + ${body.magicBonus}` : ''}`;
  } else {
    const ud = c.unarmoredDefense ?? (classLevel(c, 'barbarian') ? 'barbarian' : classLevel(c, 'monk') ? 'monk' : 'none');
    if (ud === 'barbarian') {
      value = 10 + m.dex + m.con;
      breakdown = `10 + DES ${m.dex} + CON ${m.con} (Defesa sem Armadura)`;
    } else if (ud === 'monk' && !shield) {
      value = 10 + m.dex + m.wis;
      breakdown = `10 + DES ${m.dex} + SAB ${m.wis} (Defesa sem Armadura)`;
    } else {
      value = 10 + m.dex;
      breakdown = `10 + DES ${m.dex}`;
    }
  }
  if (shield?.armor) {
    value += shield.armor.base + (shield.magicBonus || 0);
    breakdown += ` + Escudo ${shield.armor.base + (shield.magicBonus || 0)}`;
  }
  if (c.acBonus) {
    value += c.acBonus;
    breakdown += ` + bônus ${c.acBonus}`;
  }
  if (c.acOverride) return { value: c.acOverride, breakdown: 'Valor manual' };
  return { value, breakdown };
}

/* ---------------- hit points ---------------- */

function hasTrait(c: Character, srd: SrdData, re: RegExp) {
  const sp = findSpecies(srd, c.speciesId);
  const sr = findSubrace(srd, c);
  return [...(sp?.traits || []), ...(sr?.traits || [])].some((t) => re.test(t.name));
}

export function maxHp(c: Character, srd: SrdData) {
  if (c.hp.maxOverride) return c.hp.maxOverride;
  const con = mods(c, srd).con;
  let hp = 0;
  c.classes.forEach((e, idx) => {
    const cls = findClass(srd, e.classId);
    const die = cls?.hitDie ?? 8;
    for (let l = 1; l <= e.level; l++) {
      const roll = idx === 0 && l === 1 ? die : Math.floor(die / 2) + 1;
      hp += Math.max(1, roll + con);
    }
  });
  const lvl = c.classes.length ? totalLevel(c) : 0;
  if (hasTrait(c, srd, /dwarven toughness/i)) hp += lvl;
  if (c.feats.includes('tough')) hp += lvl * 2;
  return Math.max(1, hp + (c.hp.maxBonus || 0));
}

export function hitDice(c: Character, srd: SrdData) {
  const map: Record<string, number> = {};
  c.classes.forEach((e) => {
    const d = 'd' + (findClass(srd, e.classId)?.hitDie ?? 8);
    map[d] = (map[d] || 0) + e.level;
  });
  return Object.entries(map)
    .sort((a, b) => parseInt(b[0].slice(1)) - parseInt(a[0].slice(1)))
    .map(([die, total]) => ({ die, total, used: Math.min(total, c.hitDiceUsed[die] || 0) }));
}

/* ---------------- initiative & speed ---------------- */

export function initiative(c: Character, srd: SrdData) {
  let v = mods(c, srd).dex + (c.initBonus || 0);
  if (c.edition === '2024' && c.feats.includes('alert')) v += pb(c);
  return v;
}

export function speed(c: Character, srd: SrdData) {
  let v = findSpecies(srd, c.speciesId)?.speed ?? 30;
  const { body, shield } = equippedArmor(c);
  const scores = computeScores(c, srd);
  if (body?.armor?.str && scores.str < body.armor.str) v -= 10;
  const monk = classLevel(c, 'monk');
  if (monk && !body && !shield) {
    const s = classSpecific(c, srd, 'monk');
    v += Number(s.unarmored_movement ?? s.unarmored_movement_bonus ?? 0);
  }
  if (classLevel(c, 'barbarian') >= 5 && body?.armor?.cat !== 'Heavy') v += 10;
  return v + (c.speedBonus || 0);
}

/* ---------------- proficiencies ---------------- */

export function classProfs(c: Character, srd: SrdData): string[] {
  const out: string[] = [];
  c.classes.forEach((e, i) => {
    const cls = findClass(srd, e.classId);
    if (!cls) return;
    out.push(...(i === 0 ? cls.profs : cls.multiclass?.profs || []));
  });
  return out;
}

const singular = (s: string) => s.toLowerCase().replace(/s$/, '');

export function weaponProficient(c: Character, srd: SrdData, item: { name: string; weapon?: WeaponStats; proficient?: boolean }) {
  if (item.proficient) return true;
  const w = item.weapon;
  if (!w) return false;
  const profs = [...classProfs(c, srd), ...c.proficienciesText.split(/[,;\n]/)].map((p) => p.trim().toLowerCase()).filter(Boolean);
  const name = singular(item.name);
  for (const p of profs) {
    if (p.includes('simple weapon') && w.cat === 'Simple') return true;
    if (p.includes('martial weapon')) {
      if (/finesse|light/.test(p)) {
        if ((w.props || []).some((x) => x === 'finesse' || x === 'light') && w.cat === 'Martial') return true;
      } else if (w.cat === 'Martial') return true;
    }
    if (singular(p) === name || p.includes(name)) return true;
  }
  if (hasTrait(c, srd, /combat training|weapon training/i)) {
    if (/axe|hammer|longsword|shortsword|longbow|shortbow/.test(name)) return true;
  }
  return false;
}

/* ---------------- attacks ---------------- */

export interface AttackLine {
  uid: string;
  name: string;
  toHit: number;
  damage: string;
  altDamage?: string;
  type?: string;
  range?: string;
  notes?: string;
  mastery?: string;
  ability?: Ability | 'none';
  custom?: boolean;
  /** shapes of the weapon, damage with the modifier added (none = no attack in that shape) */
  forms?: { name: string; desc?: string; damage?: string; altDamage?: string; type?: string }[];
}

const withMod = (dice: string | undefined, mod: number) => (!dice ? `${mod}` : mod ? `${dice}${mod > 0 ? '+' : ''}${mod}` : dice);

export function weaponAttacks(c: Character, srd: SrdData): AttackLine[] {
  const m = mods(c, srd);
  const p = pb(c);
  const lines: AttackLine[] = [];
  const archery = c.feats.includes('archery');
  const monk = classLevel(c, 'monk') > 0;
  for (const it of c.inventory) {
    if (!it.weapon || !it.equipped) continue;
    const w = it.weapon;
    const props = w.props || [];
    let ab: Ability = w.range === 'Ranged' ? 'dex' : 'str';
    if (props.includes('finesse') || (monk && w.range === 'Melee' && (w.cat === 'Simple' || props.includes('light')))) ab = m.dex > m.str ? 'dex' : 'str';
    const prof = weaponProficient(c, srd, it);
    const magic = it.magicBonus || 0;
    const toHit = m[ab] + (prof ? p : 0) + magic + (archery && w.range === 'Ranged' ? 2 : 0);
    const dmgMod = m[ab] + magic;
    const range = w.range === 'Ranged' ? `${w.normal}/${w.long} ft` : w.thrown ? `5 ft · arremesso ${w.thrown}` : props.includes('reach') ? '10 ft' : '5 ft';
    lines.push({
      uid: it.uid,
      name: it.name,
      toHit,
      damage: withMod(w.dmg, dmgMod),
      altDamage: w.twoHanded ? withMod(w.twoHanded, dmgMod) : undefined,
      type: w.type,
      range,
      mastery: c.edition === '2024' ? w.mastery : undefined,
      notes: prof ? undefined : 'sem proficiência',
      ability: ab,
    });
  }
  // unarmed strike
  const monkDie = monk ? classSpecific(c, srd, 'monk') : undefined;
  const md = monkDie ? (monkDie.martial_arts_die ? `1d${monkDie.martial_arts_die}` : (monkDie.martial_arts as { dice_count: number; dice_value: number } | undefined) ? `1d${(monkDie.martial_arts as { dice_value: number }).dice_value}` : undefined) : undefined;
  const uab: Ability = monk && m.dex > m.str ? 'dex' : 'str';
  lines.push({
    uid: 'unarmed',
    name: 'Ataque Desarmado',
    toHit: m[uab] + p,
    damage: md ? withMod(md, m[uab]) : `${Math.max(0, 1 + m[uab])}`,
    type: 'Bludgeoning',
    range: '5 ft',
    ability: uab,
  });
  for (const a of c.attacks) {
    const am = a.ability === 'none' ? 0 : m[a.ability];
    const dm = (a.addMod ? am : 0) + (a.damageBonus || 0);
    lines.push({
      uid: a.uid,
      name: a.name,
      toHit: am + (a.proficient ? p : 0) + (a.bonus || 0),
      damage: withMod(a.damage, dm),
      altDamage: a.versatile ? withMod(a.versatile, dm) : undefined,
      type: a.type,
      notes: a.notes,
      ability: a.ability,
      custom: true,
      forms: a.forms?.length ? a.forms.map((f) => ({ name: f.name, desc: f.desc, damage: f.damage ? withMod(f.damage, dm) : undefined, altDamage: f.versatile ? withMod(f.versatile, dm) : undefined, type: f.type })) : undefined,
    });
  }
  return lines;
}

/* ---------------- spellcasting ---------------- */

const FULL = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'];
const HALF = ['paladin', 'ranger'];
const THIRD_SUBCLASSES = ['eldritch-knight', 'arcane-trickster'];

// Multiclass spellcaster table (PHB) — caster level -> slots
const MC_TABLE: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const pad9 = (a: number[]) => [...a, 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 9);

export function spellSlots(c: Character, srd: SrdData): { slots: number[]; pact?: { count: number; level: number } } {
  let pact: { count: number; level: number } | undefined;
  const wl = classLevel(c, 'warlock');
  if (wl) {
    const row = findClass(srd, 'warlock')?.levels.find((l) => l.level === wl)?.spellcasting?.slots || [];
    const idx = row.findIndex((x) => x > 0);
    if (idx >= 0) pact = { count: row[idx], level: idx + 1 };
  }
  const casters = c.classes.filter((e) => e.classId !== 'warlock' && (FULL.includes(e.classId) || HALF.includes(e.classId) || THIRD_SUBCLASSES.includes(e.subclassId || '') || findClass(srd, e.classId)?.spellcasting));
  if (casters.length === 0) return { slots: pad9([]), pact };
  if (casters.length === 1) {
    const e = casters[0];
    const cls = findClass(srd, e.classId);
    // single class: its own table is authoritative (a custom class may have an ability but no slots)
    if (cls && !THIRD_SUBCLASSES.includes(e.subclassId || '')) return { slots: pad9(cls.levels.find((l) => l.level === e.level)?.spellcasting?.slots || []), pact };
  }
  let lvl = 0;
  for (const e of casters) {
    if (FULL.includes(e.classId)) lvl += e.level;
    else if (HALF.includes(e.classId)) lvl += c.edition === '2024' ? Math.ceil(e.level / 2) : Math.floor(e.level / 2);
    else if (THIRD_SUBCLASSES.includes(e.subclassId || '')) lvl += Math.floor(e.level / 3);
    else lvl += e.level; // custom caster: assume full
  }
  return { slots: pad9(MC_TABLE[Math.min(20, lvl)] || []), pact };
}

export function spellcastingClasses(c: Character, srd: SrdData): ClassDef[] {
  return c.classes.map((e) => findClass(srd, e.classId)).filter((x): x is ClassDef => !!x?.spellcasting);
}

export function spellAbility(c: Character, srd: SrdData): Ability | undefined {
  return c.spellAbilityOverride ?? spellcastingClasses(c, srd)[0]?.spellcasting?.ability;
}

export function spellSaveDc(c: Character, srd: SrdData, ability?: Ability) {
  const a = ability ?? spellAbility(c, srd);
  if (!a) return 0;
  return 8 + pb(c) + mods(c, srd)[a];
}
export function spellAttack(c: Character, srd: SrdData, ability?: Ability) {
  const a = ability ?? spellAbility(c, srd);
  if (!a) return 0;
  return pb(c) + mods(c, srd)[a];
}

export function spellLimits(c: Character, srd: SrdData, classId: string) {
  const e = c.classes.find((x) => x.classId === classId);
  const cls = findClass(srd, classId);
  const row = cls?.levels.find((l) => l.level === e?.level)?.spellcasting;
  let prepared = row?.prepared;
  // 2014 prepared casters: ability mod + level (half level for paladin)
  if (!row?.known && !prepared && cls?.spellcasting && e) {
    const m = mods(c, srd)[cls.spellcasting.ability];
    prepared = Math.max(1, m + (classId === 'paladin' ? Math.floor(e.level / 2) : e.level));
  }
  return { cantrips: row?.cantrips, known: row?.known, prepared };
}

/* ---------------- features ---------------- */

export interface FeatureGroup { source: string; kind: 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'custom'; items: FeatureRef[] }

export function allFeatures(c: Character, srd: SrdData): FeatureGroup[] {
  const groups: FeatureGroup[] = [];
  for (const e of c.classes) {
    const cls = findClass(srd, e.classId);
    if (!cls) continue;
    const items: FeatureRef[] = [];
    cls.levels.filter((l) => l.level <= e.level).forEach((l) => (l.features || []).forEach((f) => items.push({ ...f, level: l.level })));
    groups.push({ source: `${cls.name} ${e.level}`, kind: 'class', items });
    const sub = srd.subclasses.find((s) => s.id === e.subclassId);
    if (sub) groups.push({ source: sub.name, kind: 'subclass', items: sub.features.filter((f) => (f.level ?? 0) <= e.level) });
  }
  const sp = findSpecies(srd, c.speciesId);
  if (sp) {
    const sr = findSubrace(srd, c);
    groups.push({ source: sr ? `${sp.name} · ${sr.name}` : sp.name, kind: 'species', items: [...(sp.traits || []), ...(sr?.traits || [])] });
  }
  const bg = findBackground(srd, c.backgroundId);
  if (bg?.feature) groups.push({ source: bg.name, kind: 'background', items: [bg.feature] });
  const feats = c.feats.map((id) => srd.feats.find((f) => f.id === id)).filter(Boolean) as { name: string; desc: string }[];
  if (feats.length) groups.push({ source: 'Talentos', kind: 'feat', items: feats });
  if (c.customFeatures.length) groups.push({ source: 'Personalizado', kind: 'custom', items: c.customFeatures.map((f) => ({ name: f.name, desc: f.desc, id: f.uid, type: f.type })) });
  return groups;
}

/* ---------------- class resources ---------------- */

export function suggestedResources(c: Character, srd: SrdData): Omit<Resource, 'uid' | 'used'>[] {
  const out: Omit<Resource, 'uid' | 'used'>[] = [];
  const m = mods(c, srd);
  const p = pb(c);
  for (const e of c.classes) {
    const s = classSpecific(c, srd, e.classId);
    const id = e.classId;
    if (s.rage_count) out.push({ name: 'Fúria', max: Number(s.rage_count), reset: 'long', auto: 'rage' });
    if (s.ki_points) out.push({ name: 'Pontos de Ki', max: Number(s.ki_points), reset: 'short', auto: 'ki' });
    if (s.focus_points) out.push({ name: 'Pontos de Foco', max: Number(s.focus_points), reset: 'short', auto: 'focus' });
    if (s.sorcery_points) out.push({ name: 'Pontos de Feitiçaria', max: Number(s.sorcery_points), reset: 'long', auto: 'sorcery' });
    if (s.action_surges) out.push({ name: 'Surto de Ação', max: Number(s.action_surges), reset: 'short', auto: 'surge' });
    if (s.indomitable_uses) out.push({ name: 'Indomável', max: Number(s.indomitable_uses), reset: 'long', auto: 'indomitable' });
    if (s.second_wind_uses) out.push({ name: 'Retomar o Fôlego', max: Number(s.second_wind_uses), reset: 'long', auto: 'second-wind' });
    if (id === 'fighter' && c.edition === '2014') out.push({ name: 'Retomar o Fôlego', max: 1, reset: 'short', auto: 'second-wind' });
    if (id === 'fighter' && c.edition === '2024' && e.level >= 2 && !s.action_surges) out.push({ name: 'Surto de Ação', max: e.level >= 17 ? 2 : 1, reset: 'short', auto: 'surge' });
    if (s.channel_divinity_charges) out.push({ name: 'Canalizar Divindade', max: Number(s.channel_divinity_charges), reset: 'short', auto: 'channel' });
    if (s.wild_shape_uses) out.push({ name: 'Forma Selvagem', max: Number(s.wild_shape_uses), reset: 'long', auto: 'wildshape' });
    if (id === 'druid' && c.edition === '2014' && e.level >= 2) out.push({ name: 'Forma Selvagem', max: 2, reset: 'short', auto: 'wildshape' });
    if (id === 'bard') out.push({ name: `Inspiração de Bardo (d${s.bardic_inspiration_die ?? 6})`, max: Math.max(1, m.cha), reset: e.level >= 5 ? 'short' : 'long', auto: 'bardic' });
    if (id === 'paladin') out.push({ name: 'Cura pelas Mãos (pool)', max: 5 * e.level, reset: 'long', auto: 'lay-on-hands' });
    if (id === 'wizard') out.push({ name: 'Recuperação Arcana', max: 1, reset: 'long', auto: 'arcane-recovery' });
    if (id === 'monk' && c.edition === '2024' && !s.focus_points && e.level >= 2) out.push({ name: 'Pontos de Foco', max: e.level, reset: 'short', auto: 'focus' });
  }
  if (c.edition === '2024' && c.speciesId === 'orc') out.push({ name: 'Adrenalina', max: p, reset: 'short', auto: 'adrenaline' });
  if (c.edition === '2024' && c.speciesId === 'dragonborn') out.push({ name: 'Arma de Sopro', max: p, reset: 'long', auto: 'breath' });
  if (c.edition === '2014' && c.speciesId === 'dragonborn') out.push({ name: 'Arma de Sopro', max: 1, reset: 'short', auto: 'breath' });
  if (c.speciesId === 'half-orc') out.push({ name: 'Resistência Implacável', max: 1, reset: 'long', auto: 'relentless' });
  if (c.edition === '2024' && c.speciesId === 'goliath') out.push({ name: 'Ancestral Gigante', max: p, reset: 'long', auto: 'giant' });
  if (c.edition === '2024' && c.speciesId === 'dwarf') out.push({ name: 'Sentido de Pedra', max: p, reset: 'long', auto: 'stonecunning' });
  // dedupe by auto key, keep last (highest computed)
  const map = new Map<string, Omit<Resource, 'uid' | 'used'>>();
  out.forEach((r) => map.set(r.auto || r.name, r));
  return [...map.values()];
}

/** Keeps auto-managed resources in sync with level/class while preserving used counts and custom ones. */
export function syncResources(c: Character, srd: SrdData, mkId: () => string): Resource[] {
  const sugg = suggestedResources(c, srd);
  const auto = sugg.map((s) => {
    const prev = c.resources.find((r) => r.auto === s.auto);
    return { uid: prev?.uid ?? mkId(), used: Math.min(prev?.used ?? 0, s.max), ...s };
  });
  // pools the class data defines (homebrew counters with a rest): they follow the class level.
  // A hand-made pool with the same name (e.g. "Psi Points" typed before the class had a table)
  // is taken over, keeping its name and what was spent.
  const defs = counterResources(c, srd);
  const live = new Set(defs.map((d) => d.counter));
  let custom = c.resources.filter((r) => !r.auto && !(r.counter && live.has(r.counter)));
  const counted = defs.map(({ aliases, ...s }) => {
    let prev = c.resources.find((r) => r.counter === s.counter);
    if (!prev) {
      const names = aliases.map((n) => n.trim().toLowerCase());
      prev = custom.find((r) => !r.counter && names.includes(r.name.trim().toLowerCase()));
      if (prev) custom = custom.filter((r) => r !== prev);
    }
    return { uid: prev?.uid ?? mkId(), used: Math.min(prev?.used ?? 0, s.max), ...s, name: prev?.name || s.name };
  });
  return [...auto, ...counted, ...custom];
}

/* ---------------- encumbrance ---------------- */

export function carriedWeight(c: Character) {
  const coins = (c.currency.cp + c.currency.sp + c.currency.ep + c.currency.gp + c.currency.pp) / 50;
  return Math.round((c.inventory.reduce((s, i) => s + (i.weight || 0) * (i.qty || 1), 0) + coins) * 10) / 10;
}
export function carryCapacity(c: Character, srd: SrdData) {
  return computeScores(c, srd).str * 15;
}

/* ---------------- labels ---------------- */

export const ABILITY_PT: Record<Ability, { short: string; name: string }> = {
  str: { short: 'FOR', name: 'Força' },
  dex: { short: 'DES', name: 'Destreza' },
  con: { short: 'CON', name: 'Constituição' },
  int: { short: 'INT', name: 'Inteligência' },
  wis: { short: 'SAB', name: 'Sabedoria' },
  cha: { short: 'CAR', name: 'Carisma' },
};

export const SKILL_PT: Record<string, string> = {
  acrobatics: 'Acrobacia',
  'animal-handling': 'Lidar com Animais',
  arcana: 'Arcanismo',
  athletics: 'Atletismo',
  deception: 'Enganação',
  history: 'História',
  insight: 'Intuição',
  intimidation: 'Intimidação',
  investigation: 'Investigação',
  medicine: 'Medicina',
  nature: 'Natureza',
  perception: 'Percepção',
  performance: 'Atuação',
  persuasion: 'Persuasão',
  religion: 'Religião',
  'sleight-of-hand': 'Prestidigitação',
  stealth: 'Furtividade',
  survival: 'Sobrevivência',
};

/** What each skill is for, in short words of our own (shown when hovering a skill on the sheet). */
export const SKILL_DESC_PT: Record<string, string> = {
  acrobatics: 'Manter o equilíbrio, fazer piruetas, cair de pé, escapar de um agarrão com agilidade.',
  'animal-handling': 'Acalmar, conduzir ou entender um animal; montar sem perder o controle.',
  arcana: 'Lembrar o que se sabe sobre magia, magias, itens mágicos, símbolos e planos.',
  athletics: 'Escalar, nadar, saltar longe, empurrar ou agarrar à força.',
  deception: 'Mentir de forma convincente, disfarçar intenções, blefar.',
  history: 'Lembrar fatos sobre reinos, guerras, lendas e povos antigos.',
  insight: 'Perceber se alguém mente ou o que realmente quer.',
  intimidation: 'Assustar ou pressionar alguém com ameaças ou presença.',
  investigation: 'Procurar pistas, deduzir, achar um mecanismo ou uma falha.',
  medicine: 'Estabilizar quem está morrendo, diagnosticar uma doença ou um ferimento.',
  nature: 'Lembrar o que se sabe sobre terrenos, plantas, animais e o clima.',
  perception: 'Notar algo: um ruído, alguém escondido, um detalhe fora do lugar.',
  performance: 'Entreter uma plateia: música, dança, atuação, contar histórias.',
  persuasion: 'Convencer alguém com bons argumentos, simpatia ou diplomacia.',
  religion: 'Lembrar o que se sabe sobre deuses, ritos, cultos e símbolos sagrados.',
  'sleight-of-hand': 'Bater uma carteira, esconder um objeto, truques com as mãos.',
  stealth: 'Andar sem ser visto ou ouvido, se esconder.',
  survival: 'Seguir rastros, caçar, se orientar, prever o tempo.',
};

export const CONDITION_PT: Record<string, string> = {
  blinded: 'Cego',
  charmed: 'Enfeitiçado',
  deafened: 'Surdo',
  exhaustion: 'Exaustão',
  frightened: 'Amedrontado',
  grappled: 'Agarrado',
  incapacitated: 'Incapacitado',
  invisible: 'Invisível',
  paralyzed: 'Paralisado',
  petrified: 'Petrificado',
  poisoned: 'Envenenado',
  prone: 'Caído',
  restrained: 'Contido',
  stunned: 'Atordoado',
  unconscious: 'Inconsciente',
};

export const CLASS_PT: Record<string, string> = {
  barbarian: 'Bárbaro',
  bard: 'Bardo',
  cleric: 'Clérigo',
  druid: 'Druida',
  fighter: 'Guerreiro',
  monk: 'Monge',
  paladin: 'Paladino',
  ranger: 'Patrulheiro',
  rogue: 'Ladino',
  sorcerer: 'Feiticeiro',
  warlock: 'Bruxo',
  wizard: 'Mago',
};

export const SPECIES_PT: Record<string, string> = {
  dwarf: 'Anão',
  elf: 'Elfo',
  halfling: 'Halfling',
  human: 'Humano',
  dragonborn: 'Draconato',
  gnome: 'Gnomo',
  'half-elf': 'Meio-Elfo',
  'half-orc': 'Meio-Orc',
  tiefling: 'Tiefling',
  goliath: 'Golias',
  orc: 'Orc',
};

export const SCHOOL_PT: Record<string, string> = {
  Abjuration: 'Abjuração',
  Conjuration: 'Conjuração',
  Divination: 'Adivinhação',
  Enchantment: 'Encantamento',
  Evocation: 'Evocação',
  Illusion: 'Ilusão',
  Necromancy: 'Necromancia',
  Transmutation: 'Transmutação',
};

export const ALIGNMENTS = [
  'Leal e Bom', 'Neutro e Bom', 'Caótico e Bom',
  'Leal e Neutro', 'Neutro', 'Caótico e Neutro',
  'Leal e Mau', 'Neutro e Mau', 'Caótico e Mau',
];

export const className = (id: string, srd?: SrdData) => CLASS_PT[id] ?? findClass(srd, id)?.name ?? id;
export const speciesName = (id: string | undefined, srd?: SrdData) => (id ? SPECIES_PT[id] ?? srd?.species.find((s) => s.id === id)?.name ?? id : '');

export function classSummary(c: Character, srd?: SrdData) {
  if (!c.classes.length) return 'Sem classe';
  return c.classes.map((e) => `${className(e.classId, srd)} ${e.level}`).join(' / ');
}

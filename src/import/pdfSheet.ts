import type { Ability, Character, ClassDef, Edition, SpeciesDef, SrdData } from '../data/types';
import { ABILITIES } from '../data/types';
import { newCharacter, uid } from '../engine/character';
import { fold, nameForms } from '../engine/classData';
import { ABILITY_PT, CLASS_PT, SKILL_PT, SPECIES_PT, abilityMod, profBonus } from '../engine/rules';

/**
 * Import of the official fillable D&D 5e character sheet (PDF with form fields).
 * The fields are read as text, mapped to the sheet, and everything is shown for review before
 * saving: what was understood, what was not, and the class/race to link or to create.
 */

export type PdfFields = Record<string, string | boolean>;

/** Reads every form field of a PDF (text as text, checkboxes as true/false). Loads pdf-lib only now. */
export async function readPdfFields(data: ArrayBuffer | Uint8Array): Promise<PdfFields> {
  const { PDFDocument, PDFCheckBox, PDFTextField, PDFDropdown, PDFRadioGroup } = await import('pdf-lib');
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const out: PdfFields = {};
  for (const f of doc.getForm().getFields()) {
    const name = f.getName();
    if (f instanceof PDFTextField) out[name] = f.getText() ?? '';
    else if (f instanceof PDFCheckBox) out[name] = f.isChecked();
    else if (f instanceof PDFDropdown) out[name] = f.getSelected().join(', ');
    else if (f instanceof PDFRadioGroup) out[name] = f.getSelected() ?? '';
  }
  return out;
}

/** "Race " / "DEXmod " / "PersonalityTraits " → "race" / "dexmod" / "personalitytraits" */
const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const int = (v: unknown) => { const m = String(v ?? '').replace(/[−–]/g, '-').match(/-?\d+/); return m ? parseInt(m[0], 10) : undefined; };

const ABILITY_FIELD: Record<Ability, string> = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };
const SAVE_FIELD: Record<Ability, string> = { str: 'st strength', dex: 'st dexterity', con: 'st constitution', int: 'st intelligence', wis: 'st wisdom', cha: 'st charisma' };
/** skill key → field name on the sheet, and its ability */
const SKILL_FIELD: [string, string, Ability][] = [
  ['acrobatics', 'acrobatics', 'dex'], ['animal-handling', 'animal', 'wis'], ['arcana', 'arcana', 'int'], ['athletics', 'athletics', 'str'],
  ['deception', 'deception', 'cha'], ['history', 'history', 'int'], ['insight', 'insight', 'wis'], ['intimidation', 'intimidation', 'cha'],
  ['investigation', 'investigation', 'int'], ['medicine', 'medicine', 'wis'], ['nature', 'nature', 'int'], ['perception', 'perception', 'wis'],
  ['performance', 'performance', 'cha'], ['persuasion', 'persuasion', 'cha'], ['religion', 'religion', 'int'], ['sleight-of-hand', 'sleightofhand', 'dex'],
  ['stealth', 'stealth', 'dex'], ['survival', 'survival', 'wis'],
];
/** fields the site calculates by itself (not "unrecognized" when filled) */
const DERIVED = /^(strmod|dexmod|conmod|intmod|wismod|chamod|initiative|passive|profbonus|charactername 2|spellsavedc|spellatkbonus|spellcastingability|spellcasting class|slotstotal|slotsremaining|check box|hdtotal|hd)\b/;

export interface PdfRow { label: string; value: string; status: 'ok' | 'warn' | 'calc'; note?: string }
export interface ClassGuess { text: string; level: number; subclass?: string; classId?: string }
export interface PdfImport {
  character: Character;
  rows: PdfRow[];
  /** filled fields nothing on the sheet uses */
  unknown: [string, string][];
  classes: ClassGuess[];
  race: { text: string; speciesId?: string };
  spellsMissing: string[];
  hitDie?: number;
}

const matches = (text: string, ...names: (string | undefined)[]) => {
  const want = nameForms(text);
  return names.some((n) => n && nameForms(n).some((x) => want.includes(x)));
};

export function findClassByName(srd: SrdData, text: string): ClassDef | undefined {
  return srd.classes.find((c) => matches(text, c.name, c.id, CLASS_PT[c.id]));
}
export function findSpeciesByName(srd: SrdData, text: string): SpeciesDef | undefined {
  return srd.species.find((s) => matches(text, s.name, s.id, SPECIES_PT[s.id]));
}

/** "Fighter 3 / Wizard 2", "Guerreiro (Campeão) 5", "Mystic 4" → classes with levels */
type ClassPart = { text: string; level: number; subclass?: string };
export function parseClassLevel(text: string): ClassPart[] {
  const out: ClassPart[] = [];
  for (const part of text.split(/\s*(?:\/|,|;|\+|\be\b|\band\b)\s*/i)) {
    const m = part.trim().match(/^(.*?)\s*(?:\(([^)]*)\))?\s*(?:n[ií]vel|nv\.?|lvl\.?|level)?\s*(\d{1,2})\s*$/i);
    if (!m || !m[1].trim()) continue;
    const x: ClassPart = { text: m[1].trim(), level: Math.min(20, Math.max(1, +m[3])) };
    if (m[2]?.trim()) x.subclass = m[2].trim();
    out.push(x);
  }
  return out;
}

export function mapPdfSheet(fields: PdfFields, srd: SrdData, edition: Edition = '2014'): PdfImport {
  const f: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(fields)) f[key(k)] = v;
  const used = new Set<string>();
  const get = (k: string) => { const v = f[k]; if (v !== undefined && v !== '' && v !== false) used.add(k); return typeof v === 'string' ? v.trim() : v === true ? 'sim' : ''; };
  const rows: PdfRow[] = [];
  const row = (label: string, value: string, status: PdfRow['status'] = 'ok', note?: string) => { if (value) rows.push({ label, value, status, note }); };

  const c = newCharacter(edition);
  c.name = get('charactername');
  row('Nome', c.name);
  c.player = get('playername') || undefined;
  row('Jogador', c.player || '');
  c.alignment = get('alignment') || undefined;
  row('Tendência', c.alignment || '');
  c.xp = int(get('xp')) ?? 0;
  row('Experiência', get('xp'));

  // abilities
  for (const a of ABILITIES) {
    const v = int(get(ABILITY_FIELD[a]));
    if (v != null) c.base[a] = v;
  }
  row('Atributos', ABILITIES.map((a) => `${ABILITY_PT[a].short} ${c.base[a]}`).join(' · '));
  const mod = (a: Ability) => abilityMod(c.base[a]);

  // class & level
  const classes: ClassGuess[] = parseClassLevel(get('classlevel')).map((g) => ({ ...g, classId: findClassByName(srd, g.text)?.id }));
  const total = classes.reduce((s, x) => s + x.level, 0) || 1;
  const pb = int(get('profbonus')) ?? profBonus(total);
  for (const g of classes) row('Classe e nível', `${g.text}${g.subclass ? ` (${g.subclass})` : ''} ${g.level}`, g.classId ? 'ok' : 'warn', g.classId ? undefined : 'Classe não está no site: vincule a uma existente ou crie no Homebrew');
  if (!classes.length && get('classlevel')) row('Classe e nível', get('classlevel'), 'warn', 'Não entendi a classe e o nível (ex.: "Guerreiro 3")');
  const hd = get('hdtotal') || get('hd');
  const hitDie = int(hd.match(/d\s*(\d+)/i)?.[1]);

  const raceText = get('race');
  const species = raceText ? findSpeciesByName(srd, raceText) : undefined;
  row('Raça', raceText, species ? 'ok' : 'warn', species ? undefined : 'Raça não está no site: vincule ou crie no Homebrew');
  const bgText = get('background');
  const bg = bgText ? srd.backgrounds.find((b) => matches(bgText, b.name, b.id)) : undefined;
  if (bg) c.backgroundId = bg.id;
  row('Antecedente', bgText, bg ? 'ok' : 'warn', bg ? undefined : 'Fica como antecedente próprio (o nome vai para as notas)');

  // saves and skills: deduced from the numbers (bonus − attribute = proficiency), checkboxes ignored
  const saves: string[] = [];
  for (const a of ABILITIES) {
    const v = int(get(SAVE_FIELD[a]));
    if (v != null && v - mod(a) >= pb) { c.saveProfs.push(a); saves.push(ABILITY_PT[a].short); }
  }
  row('Salvaguardas proficientes', saves.join(', '), 'ok', 'Deduzido dos números da ficha');
  const skills: string[] = [];
  for (const [k, field, a] of SKILL_FIELD) {
    const v = int(get(field));
    if (v == null) continue;
    const extra = v - mod(a);
    if (extra >= 2 * pb) { c.skills[k] = 2; skills.push((SKILL_PT[k] || k) + ' (especialista)'); } else if (extra >= pb) { c.skills[k] = 1; skills.push(SKILL_PT[k] || k); }
  }
  row('Perícias proficientes', skills.join(', '), 'ok', 'Deduzido dos números da ficha');

  // life and defence
  const hpMax = int(get('hpmax'));
  if (hpMax) c.hp.maxOverride = hpMax;
  c.hp.current = int(get('hpcurrent')) ?? hpMax ?? 0;
  c.hp.temp = int(get('hptemp')) ?? 0;
  row('Pontos de vida', `${c.hp.current}/${hpMax ?? '?'}${c.hp.temp ? ` (+${c.hp.temp} temp.)` : ''}`, hpMax ? 'ok' : 'warn', hpMax ? 'O máximo fica fixo como na ficha; sobe ao subir de nível' : 'Sem PV máximo: o site calcula pela classe');
  const ac = int(get('ac'));
  if (ac) c.acOverride = ac;
  row('Classe de armadura', ac ? String(ac) : '', 'ok', 'Fica fixa como na ficha');
  row('Deslocamento', get('speed'), 'calc', 'O site calcula pela raça');
  row('Iniciativa, modificadores, percepção passiva', get('initiative') ? 'na ficha' : '', 'calc', 'O site calcula');

  // money and gear
  for (const k of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) c.currency[k] = int(get(k)) ?? 0;
  row('Dinheiro', (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((k) => c.currency[k]).map((k) => `${c.currency[k]} ${k.toUpperCase()}`).join(' · '));
  const gear = get('equipment').split(/\r?\n|;|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
  for (const g of gear) {
    const m = g.match(/^(\d+)\s*x?\s+(.+)$/i);
    c.inventory.push({ uid: uid(), name: m ? m[2] : g, qty: m ? +m[1] : 1 });
  }
  row('Equipamento', gear.length ? `${gear.length} itens` : '');

  // attacks: the bonus is kept exactly as on the sheet
  for (const [n, atk, dmg] of [['wpn name', 'wpn1 atkbonus', 'wpn1 damage'], ['wpn name 2', 'wpn2 atkbonus', 'wpn2 damage'], ['wpn name 3', 'wpn3 atkbonus', 'wpn3 damage']]) {
    const name = get(n);
    if (!name) continue;
    const toHit = int(get(atk)) ?? 0;
    const d = get(dmg).match(/(\d+d\d+)\s*([+-]\s*\d+)?\s*(.*)$/i);
    c.attacks.push({ uid: uid(), name, ability: 'none', proficient: false, bonus: toHit, damage: d?.[1] || get(dmg) || '1d4', damageBonus: d?.[2] ? int(d[2]) ?? 0 : 0, addMod: false, type: d?.[3]?.trim() || '' });
    row('Ataque', `${name} ${toHit >= 0 ? '+' : ''}${toHit} · ${get(dmg)}`);
  }

  // texts
  c.personality = get('personalitytraits');
  c.ideals = get('ideals');
  c.bonds = get('bonds');
  c.flaws = get('flaws');
  c.backstory = get('backstory');
  c.appearance = [['Idade', 'age'], ['Altura', 'height'], ['Peso', 'weight'], ['Olhos', 'eyes'], ['Pele', 'skin'], ['Cabelo', 'hair']].map(([l, k]) => (get(k) ? `${l}: ${get(k)}` : '')).filter(Boolean).join(' · ');
  c.proficienciesText = get('proficiencieslang');
  c.notes = [bg ? '' : bgText ? `Antecedente: ${bgText}` : '', get('allies') && `Aliados e organizações: ${get('allies')}`, get('factionname') && `Facção: ${get('factionname')}`, get('treasure') && `Tesouro: ${get('treasure')}`].filter(Boolean).join('\n\n');
  for (const [k, label] of [['features and traits', 'Características e traços (PDF)'], ['feat+traits', 'Outras características (PDF)']]) {
    const t = get(k);
    if (t) c.customFeatures.push({ uid: uid(), name: label, source: 'Ficha em PDF', desc: t });
  }
  row('Personalidade, ideais, vínculos, defeitos, história', [c.personality, c.ideals, c.bonds, c.flaws, c.backstory].filter(Boolean).length + ' de 5 preenchidos');
  row('Características e traços', c.customFeatures.length ? 'copiados como texto na aba Classe' : '');
  row('Proficiências e idiomas', c.proficienciesText ? 'copiados como texto' : '');

  // spells: the names on the spell page, matched to the site's spells
  const spellNames = Object.keys(f).filter((k) => /^spells \d+$/.test(k)).map((k) => get(k)).filter(Boolean);
  const spellsMissing: string[] = [];
  for (const n of spellNames) {
    const sp = srd.spells.find((s) => matches(n, s.name, s.en, s.id));
    if (sp && !c.spells.some((x) => x.id === sp.id)) c.spells.push({ id: sp.id, prepared: sp.level > 0 });
    else if (!sp) spellsMissing.push(n);
  }
  if (spellNames.length) row('Magias', `${c.spells.length} reconhecidas`, spellsMissing.length ? 'warn' : 'ok', spellsMissing.length ? `Não encontradas: ${spellsMissing.join(', ')} (ficam nas notas)` : undefined);
  if (spellsMissing.length) c.notes = [c.notes, `Magias da ficha em PDF não encontradas no site: ${spellsMissing.join(', ')}`].filter(Boolean).join('\n\n');

  const unknown = Object.entries(f)
    .filter(([k, v]) => typeof v === 'string' && v.trim() && !used.has(k) && !DERIVED.test(k) && !/^spells \d+$/.test(k))
    .map(([k, v]) => [k, String(v).trim()] as [string, string]);

  return { character: c, rows, unknown, classes, race: { text: raceText, speciesId: species?.id }, spellsMissing, hitDie };
}

/** What the player decided in the review: for each class (and the race), link or create. */
export interface PdfChoices { classes: (string | { create: true; hitDie: number })[]; race: string | { create: true } | null }

const slugId = (s: string) => 'hb-' + fold(s).replace(/\s+/g, '-');

/** The final sheet, plus the minimal homebrew to create for classes/races not on the site. */
export function finishPdfImport(r: PdfImport, choices: PdfChoices): { character: Character; homebrew: { classes?: ClassDef[]; species?: SpeciesDef[] } } {
  const c = structuredClone(r.character);
  const hb: { classes: ClassDef[]; species: SpeciesDef[] } = { classes: [], species: [] };
  r.classes.forEach((g, i) => {
    const ch = choices.classes[i];
    let id = typeof ch === 'string' ? ch : '';
    if (typeof ch === 'object') {
      id = slugId(g.text);
      hb.classes.push({
        id, name: g.text, hitDie: ch.hitDie, saves: i === 0 ? [...c.saveProfs] : [], profs: [], profIds: [], custom: true,
        levels: Array.from({ length: 20 }, (_, l) => ({ level: l + 1, prof: profBonus(l + 1), features: [] })),
      });
    }
    if (id) c.classes.push({ classId: id, level: g.level });
  });
  if (choices.race && typeof choices.race === 'object') {
    const id = slugId(r.race.text);
    hb.species.push({ id, name: r.race.text, speed: 30, size: 'Medium', traits: [], custom: true });
    c.speciesId = id;
  } else if (choices.race) c.speciesId = choices.race;
  return { character: c, homebrew: { ...(hb.classes.length ? { classes: hb.classes } : {}), ...(hb.species.length ? { species: hb.species } : {}) } };
}

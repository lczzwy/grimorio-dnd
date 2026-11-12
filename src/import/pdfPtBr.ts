import type { PdfFields } from './pdfSheet';

/**
 * The Brazilian Portuguese fillable sheet names its fields "Campo de Texto N" and
 * "Caixa de Seleção N", with numbers that don't follow the page order. This table (made from a
 * filled copy, by where each field sits on the page) turns them into the names of the English
 * sheet, so both go through the same import.
 */
export interface FieldBox { page: number; x: number; y: number; w: number; h: number }
export type PdfLayout = Record<string, FieldBox>;

const T = (n: number) => `Campo de Texto${n}`;
const C = (n: number) => `Caixa de Seleção${n}`;

/** text field number → English sheet field name */
const TEXT: Record<number, string> = {
  0: 'CharacterName', 8: 'ClassLevel', 9: 'Background', 10: 'PlayerName', 11: 'XP', 12: 'Alignment', 13: 'Race',
  26: 'Inspiration', 28: 'ProfBonus', 25: 'AC', 23: 'Initiative', 24: 'Speed',
  42: 'HPMax', 40: 'HPCurrent', 41: 'HPTemp', 44: 'HDTotal', 43: 'HD',
  // the six abilities, top to bottom on the page: score and modifier
  29: 'STR', 33: 'DEX', 31: 'CON', 34: 'INT', 39: 'WIS', 37: 'CHA',
  27: 'STRmod', 30: 'DEXmod', 32: 'CONmod', 35: 'INTmod', 36: 'WISmod', 38: 'CHAmod',
  60: 'ST Strength', 61: 'ST Dexterity', 62: 'ST Constitution', 63: 'ST Intelligence', 64: 'ST Wisdom', 65: 'ST Charisma',
  // skills in the Portuguese alphabetical order of the sheet
  66: 'Acrobatics', 67: 'Arcana', 68: 'Athletics', 69: 'Performance', 70: 'Deception', 71: 'Stealth', 72: 'History',
  73: 'Intimidation', 74: 'Insight', 75: 'Investigation', 76: 'Animal', 77: 'Medicine', 78: 'Nature', 79: 'Perception',
  80: 'Persuasion', 81: 'SleightofHand', 82: 'Religion', 83: 'Survival',
  1: 'PersonalityTraits', 2: 'Ideals', 3: 'Bonds', 4: 'Flaws', 5: 'AttacksSpellcasting', 6: 'Equipment', 7: 'ProficienciesLang', 14: 'Features and Traits',
  45: 'Wpn Name', 48: 'Wpn1 AtkBonus', 51: 'Wpn1 Damage', 46: 'Wpn Name 2', 49: 'Wpn2 AtkBonus', 52: 'Wpn2 Damage', 47: 'Wpn Name 3', 50: 'Wpn3 AtkBonus', 53: 'Wpn3 Damage',
  54: 'Passive', 55: 'CP', 57: 'SP', 58: 'EP', 59: 'GP', 56: 'PP',
  // page 2
  84: 'CharacterName 2', 85: 'Age', 86: 'Height', 87: 'Weight', 90: 'Eyes', 89: 'Skin', 88: 'Hair',
  18: 'FactionName', 209: 'Allies', 15: 'Feat+Traits', 17: 'Backstory', 16: 'Treasure',
  // page 3
  19: 'Spellcasting Class 2', 20: 'SpellcastingAbility 2', 21: 'SpellSaveDC 2', 22: 'SpellAtkBonus 2',
};
/** spell slots by circle: [total, used] */
const SLOTS: Record<number, [number, number]> = { 1: [104, 103], 2: [105, 102], 3: [92, 91], 4: [97, 98], 5: [106, 99], 6: [93, 94], 7: [95, 96], 8: [108, 101], 9: [107, 100] };
const DEATH = { success: [24, 25, 26], fail: [27, 28, 29] };

/** The Portuguese sheet has these two fields; the English one has "CharacterName". */
export const isPtBrSheet = (f: PdfFields) => T(0) in f && T(209) in f && !('CharacterName' in f);

/** Portuguese field names → English ones (plus spell, slot and death-save entries). */
export function fromPtBrSheet(f: PdfFields, layout: PdfLayout): PdfFields {
  const out: PdfFields = {};
  const used = new Set<string>();
  const take = (name: string) => { used.add(name); return f[name]; };
  for (const [n, en] of Object.entries(TEXT)) if (T(+n) in f) out[en] = take(T(+n)) ?? '';
  for (const [lvl, [tot, use]] of Object.entries(SLOTS)) {
    if (T(tot) in f) out[`slots total ${lvl}`] = take(T(tot)) ?? '';
    if (T(use) in f) out[`slots used ${lvl}`] = take(T(use)) ?? '';
  }
  DEATH.success.forEach((n, i) => { if (C(n) in f) out[`death success ${i + 1}`] = take(C(n)) ?? false; });
  DEATH.fail.forEach((n, i) => { if (C(n) in f) out[`death fail ${i + 1}`] = take(C(n)) ?? false; });
  // the other text fields of the spell page are spell names; the checkbox just left of one,
  // on the same line, says whether it is prepared
  const boxes = Object.keys(f).filter((k) => k.startsWith('Caixa de Seleção') && layout[k]?.page === 2);
  for (const name of Object.keys(f)) {
    if (used.has(name) || !name.startsWith('Campo de Texto') || layout[name]?.page !== 2) continue;
    const v = f[name];
    if (typeof v !== 'string' || !v.trim()) continue;
    const n = name.replace('Campo de Texto', '');
    out[`Spells ${n}`] = v;
    used.add(name);
    const me = layout[name];
    const box = boxes.find((b) => { const l = layout[b]; return Math.abs(l.y - me.y) <= 3 && me.x - l.x > 0 && me.x - l.x <= 14; });
    if (box) out[`spells prepared ${n}`] = f[box] === true;
  }
  // checkboxes (proficiency marks) and the image fields aren't needed: the numbers say it all
  for (const [k, v] of Object.entries(f)) if (!used.has(k) && !k.startsWith('Caixa de Seleção') && !(k in out)) out[k] = v;
  return out;
}

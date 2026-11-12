import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyTranslation } from '../data/translate';
import { fromPtBrSheet, isPtBrSheet, type PdfLayout } from './pdfPtBr';
import { finishPdfImport, mapPdfSheet, type PdfFields } from './pdfSheet';
import { maxHp, skillMod, spellSlots } from '../engine/rules';
import type { SrdData } from '../data/types';

const data = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data', f), 'utf8'));
// the site shows spell names in Portuguese, as the sheet writes them
const srd = applyTranslation(data('srd-2014.json'), data('pt-2014.json')) as SrdData;

// A Brazilian sheet as the PDF gives it: generic field names, positions on the page
const T = (n: number) => `Campo de Texto${n}`;
const C = (n: number) => `Caixa de Seleção${n}`;
const fields: PdfFields = {
  [T(0)]: 'Vesper', [T(8)]: 'Bruxo 5', [T(13)]: 'Kaelari (homebrew)', [T(9)]: 'Charlatão', [T(209)]: 'Ordem do Olho',
  [T(29)]: '10', [T(33)]: '14', [T(31)]: '14', [T(34)]: '12', [T(39)]: '10', [T(37)]: '18', [T(28)]: '+3',
  [T(64)]: '+3', [T(65)]: '+7', [T(60)]: '+0',
  [T(67)]: '+4', [T(69)]: '+4', [T(70)]: '+7', [T(81)]: '+5', [T(74)]: '+0',
  [T(25)]: '13', [T(24)]: '9 m', [T(42)]: '38', [T(40)]: '31', [T(41)]: '5', [T(44)]: '5d8', [T(43)]: '3d8',
  [T(55)]: '35', [T(57)]: '12', [T(59)]: '84', [T(56)]: '2',
  [T(92)]: '2', [T(91)]: '1',
  [T(134)]: 'Rajada Mística', [T(135)]: 'Mãos Mágicas',
  [T(110)]: 'Repreensão Infernal', [C(54)]: false,
  [T(121)]: 'Passo Nebuloso', [C(49)]: true,
  [C(4)]: true, [C(25)]: true,
};
const at = (page: number, x: number, y: number) => ({ page, x, y, w: 10, h: 10 });
const layout: PdfLayout = {
  [T(134)]: at(2, 31, 590), [T(135)]: at(2, 31, 576),
  [T(110)]: at(2, 39, 397), [C(54)]: at(2, 31, 396),
  [T(121)]: at(2, 39, 204), [C(49)]: at(2, 31, 204),
};

describe('Brazilian fillable sheet', () => {
  it('is told apart from the English one', () => {
    expect(isPtBrSheet(fields)).toBe(true);
    expect(isPtBrSheet({ CharacterName: 'x', [T(0)]: 'y', [T(209)]: '' })).toBe(false);
  });

  it('every section lands in its place on the sheet', () => {
    const r = mapPdfSheet(fromPtBrSheet(fields, layout), srd);
    const c = r.character;
    expect(c.name).toBe('Vesper');
    // the abilities' field numbers don't follow the page; the table puts each one right
    expect(c.base).toEqual({ str: 10, dex: 14, con: 14, int: 12, wis: 10, cha: 18 });
    expect(c.saveProfs).toEqual(['wis', 'cha']);
    // Portuguese alphabetical order of the skills: Arcanismo, Atuação (no prof.), Enganação, Prestidigitação
    expect(c.skills).toEqual({ arcana: 1, deception: 1, 'sleight-of-hand': 1 });
    expect(c.hp).toMatchObject({ maxOverride: 38, current: 31, temp: 5 });
    expect(c.hitDiceUsed).toEqual({ d8: 2 });
    expect(c.acOverride).toBe(13);
    expect(c.currency).toMatchObject({ cp: 35, sp: 12, gp: 84, pp: 2 });
    expect(r.classes).toEqual([{ text: 'Bruxo', level: 5, classId: 'warlock' }]);
    expect(r.race.text).toBe('Kaelari');
    expect(r.speedFt).toBe(30);
    expect(r.slotsUsed).toEqual({ 3: 1 });
    // "Mãos Mágicas" is the site's "Mão Mágica"
    expect(c.spells.map((s) => s.id).sort()).toEqual(['eldritch-blast', 'hellish-rebuke', 'mage-hand', 'misty-step']);
    expect(c.spells.find((s) => s.id === 'hellish-rebuke')?.prepared).toBe(false);
    expect(c.spells.find((s) => s.id === 'misty-step')?.prepared).toBe(true);
    expect(r.unknown).toEqual([]);
  });

  it('a warlock knows its spells (all ready) and spends pact slots', () => {
    const r = mapPdfSheet(fromPtBrSheet(fields, layout), srd);
    const { character: c, homebrew } = finishPdfImport(r, { classes: ['warlock'], race: { create: true } }, srd);
    expect(c.spells.every((s) => s.prepared)).toBe(true);
    expect(spellSlots(c, srd).pact).toEqual({ count: 2, level: 3 });
    expect(c.pactUsed).toBe(1);
    expect(homebrew.species?.[0]).toMatchObject({ id: 'hb-kaelari', name: 'Kaelari', speed: 30 });
    const full = { ...srd, species: [...srd.species, ...homebrew.species!] };
    expect(maxHp(c, full)).toBe(38);
    expect(skillMod(c, full, 'deception')).toBe(7);
    expect(skillMod(c, full, 'performance')).toBe(4);
  });
});

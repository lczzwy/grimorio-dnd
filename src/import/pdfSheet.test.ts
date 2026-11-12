import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { finishPdfImport, mapPdfSheet, parseClassLevel, readPdfFields } from './pdfSheet';
import { makeSheetPdf, SAMPLE } from './fixtures/makeSheetPdf';
import { maxHp, skillMod } from '../engine/rules';
import type { SrdData } from '../data/types';

const srd = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;

describe('PDF sheet import', () => {
  it('reads class and level in the usual ways', () => {
    expect(parseClassLevel('Fighter 3 / Wizard 2')).toEqual([{ text: 'Fighter', level: 3 }, { text: 'Wizard', level: 2 }]);
    expect(parseClassLevel('Guerreiro (Campeão) nível 5')).toEqual([{ text: 'Guerreiro', level: 5, subclass: 'Campeão' }]);
    expect(parseClassLevel('Mystic 4')).toEqual([{ text: 'Mystic', level: 4 }]);
  });

  it('reads the form fields of a real PDF and maps them to the sheet', async () => {
    const fields = await readPdfFields(await makeSheetPdf(SAMPLE, ['Check Box 25']));
    expect(fields['Race ']).toBe('Mind Flayer');
    expect(fields['Check Box 25']).toBe(true);
    const r = mapPdfSheet(fields, srd);
    const c = r.character;
    expect(c.name).toBe('Kael');
    expect(c.base).toEqual({ str: 8, dex: 14, con: 12, int: 18, wis: 13, cha: 10 });
    expect(c.hp).toMatchObject({ maxOverride: 27, current: 20, temp: 3 });
    expect(c.acOverride).toBe(12);
    expect(c.saveProfs.sort()).toEqual(['int', 'wis']);
    // proficiency from the numbers: Arcana +6 = INT +4 + 2; Investigation +8 = expertise; Insight +3 = WIS +1 + 2
    // History +4 = INT +4 alone: not proficient
    expect(c.skills).toEqual({ arcana: 1, insight: 1, investigation: 2 });
    expect(c.currency).toMatchObject({ gp: 15, sp: 3 });
    expect(c.inventory.map((i) => [i.name, i.qty])).toEqual([['Adagas', 2], ['Mochila', 1], ['Corda de seda (15 m)', 1]]);
    expect(c.attacks[0]).toMatchObject({ name: 'Adaga', bonus: 4, damage: '1d4', damageBonus: 2, type: 'perfurante' });
    expect(c.spells.map((s) => s.id)).toEqual(['mage-hand']);
    expect(r.spellsMissing).toEqual(['Feitiço Inventado']);
    expect(r.classes).toEqual([{ text: 'Mystic', level: 4, classId: undefined }]);
    expect(r.race).toEqual({ text: 'Mind Flayer', speciesId: undefined });
    expect(r.hitDie).toBe(8);
    // the 2014 SRD has only Acolyte: Hermit stays a custom background, its name kept in the notes
    expect(c.backgroundId).toBeUndefined();
    expect(c.notes).toContain('Antecedente: Hermit');
    expect(r.unknown).toEqual([['campoestranho', 'algo que ninguém usa']]);
    expect(r.rows.filter((x) => x.status === 'warn').map((x) => x.label)).toEqual(['Classe e nível', 'Raça', 'Antecedente', 'Magias']);
  });

  it('a class or race not on the site is linked or created as minimal homebrew', async () => {
    const r = mapPdfSheet(await readPdfFields(await makeSheetPdf(SAMPLE)), srd);
    const linked = finishPdfImport(r, { classes: ['wizard'], race: 'human' });
    expect(linked.character.classes).toEqual([{ classId: 'wizard', level: 4 }]);
    expect(linked.character.speciesId).toBe('human');
    expect(linked.homebrew).toEqual({});
    const made = finishPdfImport(r, { classes: [{ create: true, hitDie: 8 }], race: { create: true } });
    expect(made.character.classes).toEqual([{ classId: 'hb-mystic', level: 4 }]);
    expect(made.homebrew.classes?.[0]).toMatchObject({ id: 'hb-mystic', name: 'Mystic', hitDie: 8, saves: ['int', 'wis'] });
    expect(made.homebrew.classes?.[0].levels).toHaveLength(20);
    expect(made.homebrew.species?.[0]).toMatchObject({ id: 'hb-mind-flayer', name: 'Mind Flayer' });
    // the numbers on the sheet survive: fixed max HP, skills
    const full = { ...srd, classes: [...srd.classes, ...made.homebrew.classes!], species: [...srd.species, ...made.homebrew.species!] };
    expect(maxHp(made.character, full)).toBe(27);
    expect(skillMod(made.character, full, 'arcana')).toBe(6);
  });

  it('a sheet in Portuguese finds the official class and race', async () => {
    const r = mapPdfSheet(await readPdfFields(await makeSheetPdf({ ClassLevel: 'Guerreiro 3 / Mago 1', 'Race ': 'Anão', STR: '16' })), srd);
    expect(r.classes.map((g) => g.classId)).toEqual(['fighter', 'wizard']);
    expect(r.race.speciesId).toBe('dwarf');
  });
});

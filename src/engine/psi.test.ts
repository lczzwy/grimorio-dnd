import { describe, expect, it } from 'vitest';
import { newCharacter } from './character';
import { hasPsychicFocus, parsePsiOptions, psiPool, psiTable } from './psi';
import { syncResources } from './rules';
import fs from 'node:fs';
import path from 'node:path';
import type { SrdData } from '../data/types';

const srd = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;

describe('psionics', () => {
  it('mystic table', () => {
    expect(psiTable(1)).toEqual({ points: 4, limit: 2 });
    expect(psiTable(4)).toEqual({ points: 17, limit: 3 });
    expect(psiTable(20)).toEqual({ points: 71, limit: 7 });
  });

  it('parses bold, ranged, concentration and dash-list options', () => {
    const desc = [
      '**Psychic Focus.** You gain resistance.',
      '**Inertial Armor (2 psi).** As an action…',
      '**Combustion (1–7 psi; conc., 1 min.).** As an action…',
      '- Ethereal Weapon (1 psi): As a bonus action…',
    ].join('\n\n');
    expect(parsePsiOptions(desc)).toEqual([
      { name: 'Inertial Armor', min: 2, max: 2, conc: false, note: undefined },
      { name: 'Combustion', min: 1, max: 7, conc: true, note: 'conc., 1 min.' },
      { name: 'Ethereal Weapon', min: 1, max: 1, conc: false, note: undefined },
    ]);
    expect(hasPsychicFocus(desc)).toBe(true);
  });

  it('psi pool follows mystic level; syncing on level up raises the max', () => {
    const c = newCharacter('2014');
    c.classes = [{ classId: 'hb-mystic', level: 4 }];
    c.resources = [{ uid: 'p', name: 'Psi Points', max: 17, used: 5, reset: 'long' }];
    expect(psiPool(c)).toMatchObject({ max: 17, left: 12, limit: 3 });
    c.classes[0].level = 5;
    c.resources = syncResources(c, srd, () => 'x');
    expect(psiPool(c)).toMatchObject({ max: 27, left: 22, limit: 5 });
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { SrdData } from '../data/types';
import { newCharacter } from '../engine/character';
import { partySummary } from './party';

const srd = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;

describe('partySummary', () => {
  it('computes what the table card shows', () => {
    const c = newCharacter('2014');
    c.name = 'Aldric';
    c.classes = [{ classId: 'fighter', level: 1 }];
    c.base.con = 14;
    c.base.wis = 12;
    c.skills = { perception: 1 };
    c.hp = { current: 5, temp: 3, maxBonus: 0 };
    c.conditions = ['prone'];
    c.concentration = 'bless';
    expect(partySummary(c, srd)).toEqual({ name: 'Aldric', summary: 'Guerreiro 1', hp: 5, maxHp: 12, temp: 3, ac: 10, passive: 13, conditions: ['prone'], concentration: 'Bless', dying: false, band: 'sangrando' });
  });
  it('flags dying at 0 hp', () => {
    const c = newCharacter('2014');
    c.classes = [{ classId: 'wizard', level: 1 }];
    c.hp.current = 0;
    expect(partySummary(c, srd)).toMatchObject({ dying: true, band: 'caido' });
  });
});

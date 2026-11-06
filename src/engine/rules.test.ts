import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { SrdData } from '../data/types';
import { newCharacter } from './character';
import {
  abilityMod,
  armorClass,
  computeScores,
  maxHp,
  profBonus,
  skillMod,
  spellSlots,
  totalLevel,
  weaponAttacks,
  passivePerception,
  spellSaveDc,
} from './rules';
import { parseDice, rollFormula } from './dice';

const load = (ed: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-' + ed + '.json'), 'utf8')) as SrdData;
const srd14 = load('2014');
const srd24 = load('2024');

describe('basics', () => {
  it('ability modifier', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(9)).toBe(-1);
    expect(abilityMod(16)).toBe(3);
    expect(abilityMod(1)).toBe(-5);
    expect(abilityMod(30)).toBe(10);
  });
  it('proficiency bonus by level', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(profBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });
});

// The sample sheet: Human Fighter 1 (Noble), STR 16 DEX 9 CON 15 INT 11 WIS 13 CHA 14
function sampleFighter() {
  const c = newCharacter('2014');
  c.classes = [{ classId: 'fighter', level: 1 }];
  c.speciesId = 'human';
  c.base = { str: 15, dex: 8, con: 14, int: 10, wis: 12, cha: 13 }; // +1 all from human
  c.saveProfs = ['str', 'con'];
  c.skills = { athletics: 1, history: 1, perception: 1, persuasion: 1 };
  c.inventory = [
    { uid: 'a', refId: 'chain-mail', name: 'Chain Mail', qty: 1, equipped: true, armor: { cat: 'Heavy', base: 16, dex: false, stealth: true, str: 13 } },
    { uid: 'b', refId: 'greataxe', name: 'Greataxe', qty: 1, equipped: true, weapon: { cat: 'Martial', range: 'Melee', dmg: '1d12', type: 'Slashing', props: ['heavy', 'two-handed'] } },
    { uid: 'c', refId: 'javelin', name: 'Javelin', qty: 3, equipped: true, weapon: { cat: 'Simple', range: 'Melee', dmg: '1d6', type: 'Piercing', props: ['thrown'], thrown: '30/120' } },
  ];
  c.acBonus = 1; // Defense fighting style
  return c;
}

describe('sample fighter sheet matches the printed sheet', () => {
  const c = sampleFighter();
  const scores = computeScores(c, srd14);
  it('scores include racial bonus', () => {
    expect(scores).toEqual({ str: 16, dex: 9, con: 15, int: 11, wis: 13, cha: 14 });
  });
  it('skills and saves', () => {
    expect(skillMod(c, srd14, 'athletics')).toBe(5);
    expect(skillMod(c, srd14, 'acrobatics')).toBe(-1);
    expect(skillMod(c, srd14, 'persuasion')).toBe(4);
    expect(skillMod(c, srd14, 'perception')).toBe(3);
    expect(passivePerception(c, srd14)).toBe(13);
  });
  it('armor class 17 with chain mail + defense', () => {
    expect(armorClass(c, srd14).value).toBe(17);
  });
  it('max hp 12', () => {
    expect(maxHp(c, srd14)).toBe(12);
  });
  it('attacks +5', () => {
    const atk = weaponAttacks(c, srd14);
    const axe = atk.find((a) => a.name === 'Greataxe')!;
    expect(axe.toHit).toBe(5);
    expect(axe.damage).toBe('1d12+3');
    const jav = atk.find((a) => a.name === 'Javelin')!;
    expect(jav.toHit).toBe(5);
  });
});

describe('armor class variants', () => {
  it('unarmored, barbarian and monk', () => {
    const c = newCharacter('2014');
    c.base = { str: 10, dex: 14, con: 16, int: 10, wis: 16, cha: 10 };
    expect(armorClass(c, srd14).value).toBe(12);
    c.classes = [{ classId: 'barbarian', level: 1 }];
    expect(armorClass(c, srd14).value).toBe(15);
    c.classes = [{ classId: 'monk', level: 1 }];
    expect(armorClass(c, srd14).value).toBe(15);
  });
  it('medium armor caps dex, shield adds 2', () => {
    const c = newCharacter('2014');
    c.base = { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 };
    c.inventory = [
      { uid: 'a', name: 'Breastplate', qty: 1, equipped: true, armor: { cat: 'Medium', base: 14, dex: true, max: 2 } },
      { uid: 'b', name: 'Shield', qty: 1, equipped: true, armor: { cat: 'Shield', base: 2 } },
    ];
    expect(armorClass(c, srd14).value).toBe(18);
  });
});

describe('spellcasting', () => {
  it('single-class wizard 5 uses class table', () => {
    const c = newCharacter('2014');
    c.classes = [{ classId: 'wizard', level: 5 }];
    expect(spellSlots(c, srd14).slots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
  });
  it('multiclass paladin 2 / sorcerer 3 = caster level 4', () => {
    const c = newCharacter('2014');
    c.classes = [
      { classId: 'paladin', level: 2 },
      { classId: 'sorcerer', level: 3 },
    ];
    expect(spellSlots(c, srd14).slots).toEqual([4, 3, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('warlock gets pact slots', () => {
    const c = newCharacter('2024');
    c.classes = [{ classId: 'warlock', level: 5 }];
    const s = spellSlots(c, srd24);
    expect(s.pact).toEqual({ count: 2, level: 3 });
    expect(s.slots.every((x) => x === 0)).toBe(true);
  });
  it('spell save DC', () => {
    const c = newCharacter('2024');
    c.classes = [{ classId: 'wizard', level: 1 }];
    c.base.int = 16;
    expect(spellSaveDc(c, srd24)).toBe(13);
  });
});

describe('2024 background bonuses and multiclass hp', () => {
  it('background +2/+1 applied', () => {
    const c = newCharacter('2024');
    c.backgroundBonus = { int: 2, wis: 1 };
    const s = computeScores(c, srd24);
    expect(s.int).toBe(12);
    expect(s.wis).toBe(11);
  });
  it('hp for fighter 1 / wizard 2 with con 14', () => {
    const c = newCharacter('2024');
    c.classes = [
      { classId: 'fighter', level: 1 },
      { classId: 'wizard', level: 2 },
    ];
    c.base.con = 14;
    expect(totalLevel(c)).toBe(3);
    // 10+2, then 2x (4+2)
    expect(maxHp(c, srd24)).toBe(24);
  });
});

describe('dice', () => {
  it('parses formulas', () => {
    expect(parseDice('2d6+3')).toEqual({ terms: [{ count: 2, sides: 6, sign: 1 }], mod: 3 });
    expect(parseDice('1d20 - 1')).toEqual({ terms: [{ count: 1, sides: 20, sign: 1 }], mod: -1 });
    expect(parseDice('d8+1d4+2')).toEqual({ terms: [{ count: 1, sides: 8, sign: 1 }, { count: 1, sides: 4, sign: 1 }], mod: 2 });
  });
  it('rolls within bounds, advantage keeps highest', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollFormula('2d6+3');
      expect(r.total).toBeGreaterThanOrEqual(5);
      expect(r.total).toBeLessThanOrEqual(15);
      const a = rollFormula('1d20', { mode: 'adv' });
      expect(a.rolls.length).toBe(1);
      expect(a.dropped!.length).toBe(1);
      expect(a.rolls[0]).toBeGreaterThanOrEqual(a.dropped![0]);
    }
  });
});

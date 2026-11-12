import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { newCharacter } from './character';
import { applyLevel, hpAverage, multiclassBlocks, undoLevel } from './levelUp';
import { maxHp, pb } from './rules';
import { levelGains } from './classData';
import type { ClassDef, PowerDef, SrdData } from '../data/types';

const CHRONO: ClassDef = {
  id: 'hb-chrono', name: 'Cronomante', hitDie: 8, saves: ['int', 'wis'], profs: [], profIds: [], custom: true,
  counters: [{ id: 'sand', name: 'Grãos de Areia', values: [3, 5, 8, 10], reset: 'long' }],
  powerLists: [{ id: 'tricks', name: 'Truques do Tempo', resource: 'sand' }],
  multiclass: { prereq: [{ ability: 'int', min: 13 }] },
  levels: [
    { level: 1, features: [{ name: 'Truques', desc: '', choice: { list: 'tricks', count: 1 } }] },
    { level: 2, features: [{ name: 'Passo', desc: '' }] },
    { level: 3, features: [{ name: 'Novo truque', desc: '', choice: { list: 'tricks', count: 1 } }] },
    { level: 4, features: [{ name: 'Melhoria', desc: '', asi: true }] },
  ],
};
const POWERS: PowerDef[] = [
  { id: 'p1', name: 'Rebobinar', list: 'tricks', desc: '' },
  { id: 'p2', name: 'Pressa', list: 'tricks', desc: '' },
];
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;
const srd: SrdData = { ...base, classes: [...base.classes, CHRONO], powers: POWERS };
let n = 0;
const id = () => 'id' + ++n;

const chrono = (level: number) => {
  const c = newCharacter('2014');
  c.base = { str: 10, dex: 12, con: 14, int: 16, wis: 10, cha: 8 };
  c.classes = [{ classId: 'hb-chrono', level }];
  c.hp.current = maxHp(c, srd);
  return c;
};

describe('level up', () => {
  it('average hit points: half the die + 1, plus CON', () => {
    const c = chrono(2);
    const { next, hpGain } = applyLevel(c, srd, { classId: 'hb-chrono', hp: { mode: 'avg' }, picks: {} }, id);
    expect(hpGain).toBe(hpAverage(8) + 2);
    expect(maxHp(next, srd)).toBe(maxHp(c, srd) + 7);
    expect(next.hp.current).toBe(maxHp(next, srd));
    expect(next.classes[0].level).toBe(3);
  });

  it('a fixed max HP (imported sheet) grows by the level too', () => {
    const c = chrono(2);
    c.hp.maxOverride = 58;
    c.hp.current = 53;
    const { next, hpGain } = applyLevel(c, srd, { classId: 'hb-chrono', hp: { mode: 'avg' }, picks: {} }, id);
    expect(hpGain).toBe(7);
    expect(next.hp.maxOverride).toBe(65);
    expect(maxHp(next, srd)).toBe(65);
    expect(next.hp.current).toBe(60);
  });

  it('a roll counts the die instead of the average', () => {
    const c = chrono(2);
    const { hpGain } = applyLevel(c, srd, { classId: 'hb-chrono', hp: { mode: 'roll', rolled: 2 }, picks: {} }, id);
    expect(hpGain).toBe(2 + 2);
  });

  it('picks become powers; the pool grows with the class table', () => {
    const c = chrono(2);
    const key = levelGains(c, srd, 'hb-chrono')!.choices[0].key;
    const { next, summary } = applyLevel(c, srd, { classId: 'hb-chrono', hp: { mode: 'avg' }, picks: { [key]: ['p2'] } }, id);
    expect(next.powers).toEqual(['p2']);
    expect(next.resources.find((r) => r.counter === 'ctr:hb-chrono:sand')?.max).toBe(8);
    expect(summary).toContain('Pressa');
  });

  it('ability score improvement: +2 capped at 20, and the CON part raises HP', () => {
    const c = chrono(3);
    c.base.con = 19;
    const { next } = applyLevel(c, srd, { classId: 'hb-chrono', hp: { mode: 'avg' }, picks: {}, asi: { mode: 'plus2', a: 'con' } }, id);
    expect(next.extra.con).toBe(1);
  });

  it('multiclass needs the minimums of the new class and of the current ones', () => {
    const c = newCharacter('2014');
    c.base = { str: 15, dex: 10, con: 12, int: 10, wis: 10, cha: 10 };
    c.classes = [{ classId: 'fighter', level: 2 }];
    expect(multiclassBlocks(c, srd, 'hb-chrono').map((b) => [b.ability, b.min])).toEqual([['int', 13]]);
    c.base.int = 13;
    expect(multiclassBlocks(c, srd, 'hb-chrono')).toEqual([]);
    expect(multiclassBlocks(c, srd, 'fighter')).toEqual([]);
  });

  it('proficiency follows the total level across classes', () => {
    const c = chrono(4);
    c.base.str = 13;
    const { next } = applyLevel(c, srd, { classId: 'fighter', hp: { mode: 'avg' }, picks: {} }, id);
    expect(next.classes.map((e) => [e.classId, e.level])).toEqual([['hb-chrono', 4], ['fighter', 1]]);
    expect(pb(next)).toBe(3);
  });

  it('undo puts the sheet back exactly as before the last level', () => {
    const c = chrono(1);
    const a = applyLevel(c, srd, { classId: 'hb-chrono', hp: { mode: 'avg' }, picks: {} }, id).next;
    const b = applyLevel(a, srd, { classId: 'hb-chrono', hp: { mode: 'roll', rolled: 8 }, picks: {} }, id).next;
    expect(b.levelHistory?.length).toBe(2);
    const back = undoLevel(b)!;
    expect(back).toEqual(a);
    expect(undoLevel(undoLevel(back)!)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { newCharacter } from './character';
import { choiceOptions, classCounters, counterValue, featuresShownAsPowers, knownPowers, levelGains, migratePowers, powerLists, powerPool, sameAsPower, sheetMigration } from './classData';
import { syncResources } from './rules';
import { turnOptions } from './turn';
import type { ClassDef, PowerDef, SrdData, SubclassDef } from '../data/types';

// An invented class (no published content): every rule below comes from this data only.
const CHRONO: ClassDef = {
  id: 'hb-chrono', name: 'Cronomante (Chronomancer)', hitDie: 8, saves: ['int', 'wis'], profs: [], profIds: [], custom: true,
  counters: [
    { id: 'sand', name: 'Grãos de Areia', values: [3, 5, 8, 10], reset: 'long', aliases: ['Sand Grains'] },
    { id: 'sand-limit', name: 'Limite de Areia', values: [2, 2, 3, 4], limitOf: 'sand' },
  ],
  powerLists: [{ id: 'chrono-tricks', name: 'Truques do Tempo', resource: 'sand', unit: 'grãos' }],
  multiclass: { prereq: [{ ability: 'int', min: 13 }], gains: [{ name: 'Relógio de bolso', desc: 'Proficiência com ferramentas de relojoeiro.' }] },
  levels: [
    { level: 1, features: [{ name: 'Truques do Tempo', desc: 'Você conhece truques.', choice: { list: 'chrono-tricks', count: 1 } }, { name: 'Escola do Tempo', desc: 'Escolha sua escola.', subclass: true }] },
    { level: 2, features: [{ name: 'Passo Adiante', desc: 'Você pode, como ação bônus, avançar.', type: 'passive' }] },
    { level: 3, features: [{ name: 'Novo truque', desc: '+1 truque.', choice: { list: 'chrono-tricks', count: 1 } }] },
    { level: 4, features: [{ name: 'Melhoria', desc: 'Atributos.', asi: true }] },
  ],
};
const SCHOOL: SubclassDef = { id: 'hb-chrono-dawn', name: 'Escola da Aurora', class: 'hb-chrono', features: [{ name: 'Truques da Aurora', desc: 'Dois truques da Aurora.', level: 1, choice: { list: 'chrono-tricks', count: 2, tag: 'Aurora' } }] };
const POWERS: PowerDef[] = [
  { id: 'hb-rewind', name: 'Rebobinar (Rewind)', list: 'chrono-tricks', tags: ['Aurora'], desc: 'Volta um instante.', options: [{ name: 'Desfazer golpe', cost: 2, time: 'Reação' }] },
  { id: 'hb-haste', name: 'Pressa (Haste Step)', list: 'chrono-tricks', time: 'Ação bônus', desc: 'Mais rápido.', options: [{ name: 'Correr', cost: 1, costMax: 3 }] },
  { id: 'hb-late', name: 'Tarde Demais', list: 'chrono-tricks', level: 3, desc: 'Só no 3º.' },
];

const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;
const srd: SrdData = { ...base, classes: [...base.classes, CHRONO], subclasses: [...base.subclasses, SCHOOL], powers: POWERS };

const chrono = (level: number) => {
  const c = newCharacter('2014');
  c.name = 'Tique';
  c.classes = [{ classId: 'hb-chrono', level, subclassId: 'hb-chrono-dawn' }];
  return c;
};

describe('class data', () => {
  it('counters follow the class level; the last value repeats', () => {
    expect(counterValue(CHRONO.counters![0], 1)).toBe(3);
    expect(counterValue(CHRONO.counters![0], 4)).toBe(10);
    expect(counterValue(CHRONO.counters![0], 15)).toBe(10);
    expect(classCounters(chrono(3), srd).map((x) => [x.def.id, x.value])).toEqual([['sand', 8], ['sand-limit', 3]]);
  });

  it('a counter with a rest becomes a pool that grows on level up, keeping what was spent', () => {
    const c = chrono(2);
    c.resources = syncResources(c, srd, () => 'id1');
    expect(c.resources).toEqual([{ uid: 'id1', name: 'Grãos de Areia', max: 5, used: 0, reset: 'long', counter: 'ctr:hb-chrono:sand' }]);
    c.resources[0].used = 2;
    c.classes[0].level = 3;
    c.resources = syncResources(c, srd, () => 'other');
    expect(c.resources[0]).toMatchObject({ uid: 'id1', max: 8, used: 2 });
  });

  it('a hand-made pool with the counter name is taken over: same name, same id, what was spent kept', () => {
    const c = chrono(4);
    c.resources = [{ uid: 'old', name: 'Sand Grains', max: 99, used: 4, reset: 'long' }, { uid: 'x', name: 'Outra coisa', max: 1, used: 0, reset: 'short' }];
    c.resources = syncResources(c, srd, () => 'new');
    expect(c.resources).toEqual([
      { uid: 'old', name: 'Sand Grains', max: 10, used: 4, reset: 'long', counter: 'ctr:hb-chrono:sand' },
      { uid: 'x', name: 'Outra coisa', max: 1, used: 0, reset: 'short' },
    ]);
  });

  it('the list pool pays costs, capped by the limit counter', () => {
    const c = chrono(3);
    c.resources = syncResources(c, srd, () => 'p');
    c.resources[0].used = 1;
    const list = powerLists(c, srd)[0];
    expect(list.name).toBe('Truques do Tempo');
    expect(powerPool(c, srd, list)).toMatchObject({ max: 8, left: 7, limit: 3, unit: 'grãos' });
  });

  it('a level shows what it gives, the picks and the numbers that change', () => {
    const c = chrono(2);
    const g = levelGains(c, srd, 'hb-chrono')!;
    expect(g.level).toBe(3);
    expect(g.features.map((f) => f.name)).toEqual(['Novo truque']);
    expect(g.choices).toEqual([{ key: 'Novo truque#0', source: 'Novo truque', choice: { list: 'chrono-tricks', count: 1 } }]);
    expect(g.counters.map((x) => [x.def.id, x.from, x.to])).toEqual([['sand', 5, 8], ['sand-limit', 2, 3]]);
    expect(g.asi).toBe(false);
    c.classes[0].level = 3;
    expect(levelGains(c, srd, 'hb-chrono')!.asi).toBe(true);
  });

  it('level 1 asks for the subclass; the subclass adds its own pick filtered by tag', () => {
    const c = newCharacter('2014');
    const g = levelGains(c, srd, 'hb-chrono', 'hb-chrono-dawn')!;
    expect(g.subclass).toBe(true);
    expect(g.choices.map((x) => x.choice.count)).toEqual([1, 2]);
    expect(choiceOptions(c, srd, g.choices[1].choice, 1).map((p) => p.id)).toEqual(['hb-rewind']);
    // a power above the level isn't offered; one already known isn't either
    expect(choiceOptions(c, srd, g.choices[0].choice, 1).map((p) => p.id)).toEqual(['hb-rewind', 'hb-haste']);
    c.powers = ['hb-haste'];
    expect(choiceOptions(c, srd, g.choices[0].choice, 3).map((p) => p.id)).toEqual(['hb-rewind', 'hb-late']);
  });

  it('multiclassing in gives the class level 1 and its multiclass extras', () => {
    const c = newCharacter('2014');
    c.classes = [{ classId: 'fighter', level: 3 }];
    const g = levelGains(c, srd, 'hb-chrono')!;
    expect(g.multiclass).toBe(true);
    expect(g.features.map((f) => f.name)).toContain('Relógio de bolso');
  });

  it('powers go to the turn by their time; a feature typed as passive stays out', () => {
    const c = chrono(2);
    c.powers = ['hb-rewind', 'hb-haste'];
    const t = turnOptions(c, srd);
    expect(t.bonus.filter((o) => o.kind === 'power').map((o) => o.name)).toEqual(['Pressa (Haste Step)']);
    expect(t.reaction.filter((o) => o.kind === 'power').map((o) => o.name)).toEqual(['Rebobinar (Rewind)']);
    expect([...t.action, ...t.bonus, ...t.reaction].some((o) => o.name === 'Passo Adiante')).toBe(false);
  });
});

describe('migration of older sheets', () => {
  it('matches hand-written features by the name in either language', () => {
    expect(sameAsPower(POWERS[0], 'Rewind (Aurora)')).toBe(true);
    expect(sameAsPower(POWERS[0], 'Rebobinar o relógio')).toBe(false);
    expect(sameAsPower(POWERS[0], 'Rewind')).toBe(true);
    expect(sameAsPower(POWERS[0], 'Rebobinar')).toBe(true);
    expect(sameAsPower(POWERS[1], 'Haste Step (Aurora)')).toBe(true);
  });

  it('turns hand-written disciplines into powers, adds a pool, and removes nothing', () => {
    const c = chrono(3);
    c.customFeatures = [
      { uid: 'f1', name: 'Haste Step (Aurora)', source: 'Disciplines', desc: '…' },
      { uid: 'f2', name: 'Algo meu', source: 'Notas', desc: '…' },
    ];
    c.feats = ['hb-rewind'];
    c.resources = [{ uid: 'r', name: 'Sand Grains', max: 5, used: 1, reset: 'long' }];
    const before = structuredClone(c);
    const fix = sheetMigration(c, srd, () => 'n')!;
    fix(c);
    expect(c.powers).toEqual(['hb-haste', 'hb-rewind']);
    expect(c.resources[0]).toMatchObject({ uid: 'r', name: 'Sand Grains', max: 8, used: 1, counter: 'ctr:hb-chrono:sand' });
    // nothing old is gone
    expect(c.customFeatures).toEqual(before.customFeatures);
    expect(c.feats).toEqual(before.feats);
    expect(knownPowers(c, srd).map((p) => p.id)).toEqual(['hb-rewind', 'hb-haste']);
    // the hand-written copy isn't listed twice; the unrelated one stays visible
    expect([...featuresShownAsPowers(c, srd)]).toEqual(['f1']);
    // running it again changes nothing
    expect(sheetMigration(c, srd, () => 'n')).toBeNull();
  });

  it('waits while the campaign has no powers to match against', () => {
    const c = chrono(3);
    c.customFeatures = [{ uid: 'f1', name: 'Haste Step', source: '', desc: '' }];
    expect(migratePowers(c, { ...srd, powers: [] })).toBeNull();
    expect(c.powers).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { MonsterDef } from './monsters';
import { hpBand } from '../engine/hpBand';

const load = (ed: string) => JSON.parse(fs.readFileSync(path.join(__dirname, `../../public/data/monsters-${ed}.json`), 'utf8')) as MonsterDef[];

describe('SRD monsters', () => {
  it('2014 goblin is compact and usable at the table', () => {
    const g = load('2014').find((m) => m.id === 'goblin')!;
    expect(g).toMatchObject({ name: 'Goblin', ac: 15, hp: 7, hpDice: '2d6', cr: '1/4', xp: 50, speed: '30 ft.' });
    expect(g.scores).toEqual({ str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
    expect(g.actions[0]).toMatchObject({ name: 'Scimitar', toHit: 4, damage: '1d6+2' });
    expect(g.traits.map((t) => t.name)).toContain('Nimble Escape');
  });
  it('2024 has bonus actions and both editions have 300+ monsters', () => {
    const w = load('2024').find((m) => m.id === 'goblin-warrior')!;
    expect(w.bonus?.map((b) => b.name)).toContain('Nimble Escape');
    expect(load('2014').length).toBeGreaterThan(300);
    expect(load('2024').length).toBeGreaterThan(300);
  });
  it('hpBand matches the SQL thresholds', () => {
    expect([hpBand(60, 60), hpBand(30, 60), hpBand(15, 60), hpBand(14, 60), hpBand(0, 60)]).toEqual(['ileso', 'ferido', 'sangrando', 'quase morto', 'caido']);
  });
});

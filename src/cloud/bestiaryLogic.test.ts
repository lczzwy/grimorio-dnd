import { describe, expect, it } from 'vitest';
import { averageHp, blankCreature, copyNames, creatureFromSrd, normalizeCreature } from './bestiaryLogic';
import type { MonsterDef } from '../data/monsters';

describe('bestiary logic', () => {
  it('averages hit dice like the books', () => {
    expect(averageHp('7d8+14')).toBe(45);
    expect(averageHp('2d6')).toBe(7);
    expect(averageHp('1d4-3')).toBe(1);
    expect(averageHp('banana')).toBeNull();
  });

  it('normalizes bad input into a safe creature', () => {
    const c = normalizeCreature({
      name: '  Lobo Sombrio  ',
      ac: '15',
      hp: -5,
      scores: { str: 99, dex: 'x' },
      actions: [{ name: 'Mordida', toHit: '5', damage: '2d6 + 3', desc: 'morde' }, { name: '' }, { name: 'Uivo', damage: 'nada' }],
      image: 'javascript:alert(1)',
    });
    expect(c.name).toBe('Lobo Sombrio');
    expect(c.ac).toBe(15);
    expect(c.hp).toBe(1);
    expect(c.scores.str).toBe(30);
    expect(c.scores.dex).toBe(10);
    expect(c.actions).toEqual([
      { name: 'Mordida', desc: 'morde', toHit: 5, damage: '2d6+3', dc: undefined },
      { name: 'Uivo', desc: '', toHit: undefined, damage: undefined, dc: undefined },
    ]);
    expect(c.image).toBeNull();
  });

  it('keeps a valid picture and a blank creature is usable as is', () => {
    expect(normalizeCreature({ name: 'X', image: 'data:image/jpeg;base64,AAA' }).image).toBe('data:image/jpeg;base64,AAA');
    const stored = 'https://lnvrptqcjcmvsmeprkfk.supabase.co/storage/v1/object/public/portraits/u/lobo.jpg';
    expect(normalizeCreature({ name: 'X', image: stored }).image).toBe(stored);
    expect(normalizeCreature({ name: 'X', image: 'https://evil.example.com/x.jpg' }).image).toBeNull();
    const b = normalizeCreature(blankCreature());
    expect(b.actions[0].damage).toBe('1d6+2');
  });

  it('copies an SRD monster without its id', () => {
    const m = { ...blankCreature(), id: 'goblin', name: 'Goblin' } as MonsterDef;
    const c = creatureFromSrd(m);
    expect(c.id).toBe('');
    expect(c.name).toBe('Goblin');
  });

  it('numbers copies on the table', () => {
    expect(copyNames('Goblin', 1)).toEqual(['Goblin']);
    expect(copyNames('Goblin', 3)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
  });
});

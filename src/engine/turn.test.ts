import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { SrdData } from '../data/types';
import { newCharacter } from './character';
import { spellSlotKind, turnOptions } from './turn';

const srd = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe('turn options', () => {
  it('casting time → slot', () => {
    expect(spellSlotKind('1 action')).toBe('action');
    expect(spellSlotKind('Action')).toBe('action');
    expect(spellSlotKind('1 bonus action')).toBe('bonus');
    expect(spellSlotKind('Bonus Action')).toBe('bonus');
    expect(spellSlotKind('1 reaction, which you take when you are hit')).toBe('reaction');
    expect(spellSlotKind('1 minute')).toBeNull();
  });

  it('fighter: weapon attack as action, Second Wind as bonus action', () => {
    const c = newCharacter('2014');
    c.classes = [{ classId: 'fighter', level: 2 }];
    c.inventory = [{ uid: 'a', name: 'Greataxe', qty: 1, equipped: true, weapon: { cat: 'Martial', range: 'Melee', dmg: '1d12', type: 'Slashing', props: [] } }];
    const t = turnOptions(c, srd);
    expect(names(t.action)).toContain('Greataxe');
    expect(names(t.action)).toContain('Esquivar');
    expect(names(t.bonus)).toContain('Second Wind');
    expect(names(t.reaction)).toContain('Ataque de Oportunidade');
  });

  it('spells: prepared ones by casting time, unprepared leveled spells skipped', () => {
    const c = newCharacter('2014');
    c.classes = [{ classId: 'wizard', level: 1 }];
    c.spells = [{ id: 'fire-bolt' }, { id: 'shield', prepared: true }, { id: 'magic-missile', prepared: false }];
    const t = turnOptions(c, srd);
    expect(names(t.action)).toContain('Fire Bolt');
    expect(names(t.reaction)).toContain('Shield');
    expect(names(t.action)).not.toContain('Magic Missile');
  });

  it('custom (homebrew) features are classified from their text', () => {
    const c = newCharacter('2014');
    c.customFeatures = [{ uid: 'x', name: 'Mind Thrust', source: 'Psionic Talents', desc: 'As an action, you target one creature…' }, { uid: 'y', name: 'Light Step', source: 'Psionic Talents', desc: 'As a bonus action, you alter your density…' }];
    const t = turnOptions(c, srd);
    expect(names(t.action)).toContain('Mind Thrust');
    expect(names(t.bonus)).toContain('Light Step');
  });
});

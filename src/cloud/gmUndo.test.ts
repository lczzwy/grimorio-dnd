import { describe, expect, it } from 'vitest';
import { gmUndo } from './campaigns';
import { newCharacter } from '../engine/character';

const sheet = (current: number, temp = 0) => { const c = newCharacter('2014'); c.id = 'x'; c.hp = { current, temp, maxBonus: 0 }; return c; };

describe('undo of the GM life changes', () => {
  it('damage and healing above 0 can be undone', () => {
    expect(gmUndo(sheet(20, 3), sheet(15), 'camp', 30)).toBeTypeOf('function');
    expect(gmUndo(sheet(10), sheet(18), 'camp', 30)).toBeTypeOf('function');
  });
  it('not when someone dropped to 0 or rose from it (concentration, death saves)', () => {
    expect(gmUndo(sheet(5), sheet(0), 'camp', 30)).toBeNull();
    expect(gmUndo(sheet(0), sheet(6), 'camp', 30)).toBeNull();
  });
  it('not a heal while there are temporary HP (the opposite damage would take them first)', () => {
    expect(gmUndo(sheet(10, 4), sheet(14, 4), 'camp', 30)).toBeNull();
  });
  it('not when nothing came back from the server', () => {
    expect(gmUndo(sheet(10), null, 'camp', 30)).toBeNull();
  });
});

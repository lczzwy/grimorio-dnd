import { describe, expect, it } from 'vitest';
import { isBackupFile, makeBackup, restoreBackup } from './backup';
import { newCharacter } from '../engine/character';

const char = (id: string, name: string, updatedAt: number) => ({ ...newCharacter('2014'), id, name, updatedAt });

describe('backup', () => {
  it('round-trips and is recognised', () => {
    const b = makeBackup([char('a', 'Voss', 1)], { '2014': { feats: [{ id: 'hb-x', name: 'X', desc: 'x' }] }, '2024': {} });
    expect(isBackupFile(JSON.parse(JSON.stringify(b)))).toBe(true);
    expect(isBackupFile({ edition: '2014' })).toBe(false);
  });

  it('restoring merges: adds new, keeps the newest copy, never deletes', () => {
    const current = { characters: [char('a', 'Voss editado', 200), char('b', 'Lyra', 100)], homebrew: { '2014': {}, '2024': {} } };
    const backup = makeBackup([char('a', 'Voss velho', 100), char('b', 'Lyra nova', 300), char('c', 'Aldric', 50)], {
      '2014': { feats: [{ id: 'hb-x', name: 'X', desc: 'x' }], junk: [{}] } as never,
      '2024': {},
    });
    const r = restoreBackup(current, backup);
    expect(r.characters.map((c) => c.name).sort()).toEqual(['Aldric', 'Lyra nova', 'Voss editado']);
    expect([r.added, r.updated, r.kept]).toEqual([1, 1, 1]);
    expect(Object.keys(r.homebrew['2014'])).toEqual(['feats']);
  });
});

import { describe, expect, it } from 'vitest';
import { mergeHomebrew, sanitizeHomebrew } from './homebrew';

// Shape of a 5e Companion character export: arrays under keys that look like homebrew kinds,
// but with entries in a different format (no `desc`, no `category`, …). Pasting this into
// "Colar JSON" used to store it as homebrew and break every 2014 page.
const companionLike = {
  jsonType: 'character',
  name: 'Voss',
  skills: [{ typeName: 'ARCANA', proficiencyName: 'FULL' }],
  notes: [{ text: 'hi' }],
  jobs: [{ jobId: 'mystic', level: 4 }],
  feats: [{ name: 'Telekinetic [TCE]', descriptions: [{ description: 'x' }] }],
  spells: [{ name: 'Levitate', level: 2, description: 'float' }],
  equipment: [{ name: 'Spear', amount: 1 }, { amount: 1 }],
  conditions: {},
};

describe('sanitizeHomebrew', () => {
  it('rejects a character file pasted as a pack', () => {
    const r = sanitizeHomebrew(companionLike);
    expect(r.homebrew).toEqual({});
    expect(r.kept).toBe(0);
    expect(r.dropped).toBe(4);
    expect(r.ignoredKeys).toEqual(expect.arrayContaining(['skills', 'notes', 'jobs', 'jsonType', 'conditions']));
  });

  it('keeps valid entries, fills missing ids and drops broken ones', () => {
    const r = sanitizeHomebrew({
      feats: [{ name: 'Mind Thrust', desc: 'Psychic damage.' }, { name: 'Broken' }, 'nope'],
      spells: [{ id: 'my-bolt', name: 'Bolt', level: 1, desc: 'zap' }],
      classes: [{ name: 'Mystic', hitDie: 8, levels: [], saves: ['int'], profs: [] }, { name: 'No levels', hitDie: 8 }],
      species: [{ name: 'Mind Flayer' }],
    });
    expect(r.homebrew.feats).toEqual([{ id: 'hb-mind-thrust', name: 'Mind Thrust', desc: 'Psychic damage.', custom: true }]);
    expect(r.homebrew.spells?.[0].id).toBe('my-bolt');
    expect(r.homebrew.classes?.map((c) => c.name)).toEqual(['Mystic']);
    expect(r.homebrew.species?.[0].id).toBe('hb-mind-flayer');
    expect(r.kept).toBe(4);
    expect(r.dropped).toBe(3);
  });

  it('cleans data previously saved with junk keys (migration path)', () => {
    // what the old importer saved: valid pack entries mixed with the pasted sheet's lists
    const stored = { ...companionLike, feats: [{ id: 'hb-psi-beacon', name: 'Beacon', desc: 'Light.' }, ...companionLike.feats] };
    const r = sanitizeHomebrew(stored);
    expect(Object.keys(r.homebrew)).toEqual(['feats']);
    expect(r.homebrew.feats?.map((f) => f.name)).toEqual(['Beacon']);
  });

  it('tolerates garbage input', () => {
    expect(sanitizeHomebrew(null).kept).toBe(0);
    expect(sanitizeHomebrew([1, 2]).kept).toBe(0);
    expect(sanitizeHomebrew('x').kept).toBe(0);
  });
});

describe('mergeHomebrew', () => {
  const translated = { feats: [{ id: 'hb-telekinetic', name: 'Telecinético [TCE]', desc: 'PT-BR' }] } as const;
  const fromSheet = { feats: [{ id: 'hb-telekinetic', name: 'Telekinetic', desc: 'EN' }, { id: 'hb-x', name: 'X', desc: 'x' }] } as const;

  it('re-importing a character sheet keeps the user’s translated feat', () => {
    const m = mergeHomebrew(translated as never, fromSheet as never, true);
    expect(m.feats?.map((f) => f.name)).toEqual(['Telecinético [TCE]', 'X']);
  });

  it('importing a pack replaces entries with the same id', () => {
    const m = mergeHomebrew(fromSheet as never, translated as never);
    expect(m.feats?.map((f) => f.name)).toEqual(['X', 'Telecinético [TCE]']);
  });
});

describe('homebrew on top of the SRD', () => {
  it('adds a kind the SRD files lack (powers) without breaking', async () => {
    const { withHomebrew } = await import('./srd');
    const base = { classes: [{ id: 'fighter', name: 'Fighter' }], spells: [] } as unknown as import('./types').SrdData;
    const out = withHomebrew(base, { powers: [{ id: 'p', name: 'P', list: 'l', desc: 'd' }], classes: [{ id: 'fighter', name: 'Meu Guerreiro' }] } as never);
    expect(out.powers?.map((p) => p.id)).toEqual(['p']);
    expect(out.classes.map((c) => c.name)).toEqual(['Meu Guerreiro']);
  });
});

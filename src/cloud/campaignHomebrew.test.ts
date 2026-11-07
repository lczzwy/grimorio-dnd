import { describe, expect, it } from 'vitest';
import { mergeCampaignHomebrew } from './campaignHomebrew';
import type { SrdData } from '../data/types';

describe('mergeCampaignHomebrew', () => {
  it('adds campaign items and replaces same-id ones', () => {
    const base = { feats: [{ id: 'grappler', name: 'Grappler', desc: '' }, { id: 'hb-telekinetic', name: 'Telekinetic', desc: 'EN' }], classes: [] } as unknown as SrdData;
    const m = mergeCampaignHomebrew(base, { feats: [{ id: 'hb-telekinetic', name: 'Telecinético', desc: 'PT' }], classes: [{ id: 'hb-mystic', name: 'Mystic', hitDie: 8, saves: [], profs: [], profIds: [], levels: [] }] });
    expect(m.feats.map((f) => f.name)).toEqual(['Grappler', 'Telecinético']);
    expect(m.classes.map((c) => c.id)).toEqual(['hb-mystic']);
    expect(base.feats.length).toBe(2);
  });
});

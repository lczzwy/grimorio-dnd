import { describe, expect, it } from 'vitest';
import { colorFor, mergeFeed, parseChatInput, PLAYER_COLORS } from './chatLogic';

describe('chat input', () => {
  it('plain text is a message', () => {
    expect(parseChatInput('  oi mesa  ')).toEqual({ kind: 'msg', body: 'oi mesa' });
    expect(parseChatInput('   ')).toEqual({ kind: 'empty' });
  });
  it('/r rolls a formula with an optional label', () => {
    expect(parseChatInput('/r 1d20+5 ataque com espada')).toEqual({ kind: 'roll', formula: '1d20+5', label: 'ataque com espada' });
    expect(parseChatInput('/roll 2d6')).toEqual({ kind: 'roll', formula: '2d6', label: 'Rolagem' });
    expect(parseChatInput('/rolar 3D8 + 2 cura')).toEqual({ kind: 'roll', formula: '3d8+2', label: 'cura' });
  });
  it('rejects garbage formulas', () => {
    expect(parseChatInput('/r banana').kind).toBe('error');
    expect(parseChatInput('/r 5').kind).toBe('error');
  });
});

describe('colours', () => {
  it('keeps a valid stored colour, else a stable default', () => {
    expect(colorFor('u1', '#123abc')).toBe('#123abc');
    expect(colorFor('u1', 'red')).toBe(colorFor('u1'));
    expect(PLAYER_COLORS).toContain(colorFor('abc'));
  });
});

describe('feed', () => {
  it('interleaves messages and rolls by time without duplicates', () => {
    const m = { id: '1', campaign_id: 'c', user_id: 'u', author: 'A', body: 'oi', created_at: '2026-01-01T10:00:02Z' };
    const r = { id: '9', campaign_id: 'c', user_id: 'u', author: 'A', label: 'x', formula: '1d20', rolls: [5], dropped: null, total: 5, kind: null, hidden: false, created_at: '2026-01-01T10:00:01Z' };
    const f = mergeFeed([m, m], [r]);
    expect(f.map((i) => i.type)).toEqual(['roll', 'msg']);
  });
});

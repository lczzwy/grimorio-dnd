import { describe, expect, it } from 'vitest';
import { colorFor, mergeFeed, parseChatInput, PLAYER_COLORS, rollBreakdown } from './chatLogic';

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


describe('roll breakdown', () => {
  it('splits terms and the modifier', () => {
    const b = rollBreakdown('1d20+2d6+3', [17, 3, 5])!;
    expect(b.parts.map((p) => [p.label, p.dice, p.subtotal])).toEqual([['1d20', [17], 17], ['2d6', [3, 5], 8]]);
    expect(b.mod).toBe(3);
    expect(b.total).toBe(28);
    expect(b.crit).toBe(false);
  });
  it('shows the discarded d20 of advantage', () => {
    const b = rollBreakdown('1d20+5', [18], [7], 'adv')!;
    expect(b.parts[0].dropped).toEqual([7]);
    expect(b.adv).toBe('adv');
    expect(b.total).toBe(23);
  });
  it('reads advantage from the discarded die when the row is a crit', () => {
    expect(rollBreakdown('1d20+7', [20], [6], 'crit')!.adv).toBe('adv');
    expect(rollBreakdown('1d20+7', [1], [15], 'fumble')!.adv).toBe('dis');
    expect(rollBreakdown('1d20+7', [12])!.adv).toBeNull();
  });
  it('recognises doubled dice on a critical', () => {
    const b = rollBreakdown('1d8+3', [4, 7])!;
    expect(b.crit).toBe(true);
    expect(b.parts[0].label).toBe('2d8');
    expect(b.total).toBe(14);
  });
  it('subtracts negative terms', () => {
    expect(rollBreakdown('1d20-1d4', [10, 3])!.total).toBe(7);
  });
  it('garbage → null', () => {
    expect(rollBreakdown('banana', [1])).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { toRollRow } from './rollRow';

describe('toRollRow', () => {
  it('maps a local roll to a campaign feed row', () => {
    const row = toRollRow({ id: 'x', key: 1, label: 'Voss: Ataque', formula: '1d20+5', rolls: [17], dropped: [3], total: 22, kind: undefined, at: 0, mode: 'adv' }, 'camp', 'user', 'Ana', true);
    expect(row).toEqual({ campaign_id: 'camp', user_id: 'user', author: 'Ana', label: 'Voss: Ataque', formula: '1d20+5', rolls: [17], dropped: [3], total: 22, kind: 'adv', hidden: true });
  });
  it('keeps crit/fumble as the kind', () => {
    expect(toRollRow({ id: 'x', key: 1, label: 'a', formula: '1d20', rolls: [20], total: 20, kind: 'crit', at: 0 }, 'c', 'u', 'A', false).kind).toBe('crit');
  });
});

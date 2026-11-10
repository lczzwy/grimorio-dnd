import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setServerRoller, useDice, type ServerRoller } from './store';

const table = { campaignId: 'camp', hidden: false, isGm: false };

describe('dice: who draws the numbers', () => {
  beforeEach(() => {
    useDice.setState({ table: undefined, mode: 'normal', log: [], current: undefined });
    setServerRoller(null as unknown as ServerRoller);
  });

  it('a sheet used on its own rolls in the browser', async () => {
    const r = await useDice.getState().roll('Teste', '2d6+3');
    expect(r).not.toBeNull();
    expect(r!.rolls).toHaveLength(2);
    expect(r!.total).toBe(r!.rolls[0] + r!.rolls[1] + 3);
  });

  it('at a table the server draws and the result is what the server returned', async () => {
    const roller = vi.fn<ServerRoller>(async () => ({ id: 'srv-1', formula: '1d20+5', rolls: [20], dropped: [3], total: 25, kind: 'crit' }));
    setServerRoller(roller);
    useDice.setState({ table, mode: 'adv' });
    const r = await useDice.getState().roll('Ataque', '1d20+5');
    expect(roller).toHaveBeenCalledWith(table, { label: 'Ataque', formula: '1d20+5', mode: 'adv', crit: false });
    expect(r).toMatchObject({ id: 'srv-1', rolls: [20], dropped: [3], total: 25, kind: 'crit', mode: 'adv' });
    expect(useDice.getState().current?.id).toBe('srv-1');
    expect(useDice.getState().mode).toBe('normal'); // advantage is one-shot
  });

  it('at a table, if the server fails, nothing is rolled', async () => {
    setServerRoller(async () => { throw new Error('offline'); });
    useDice.setState({ table });
    expect(await useDice.getState().roll('Ataque', '1d20')).toBeNull();
    expect(useDice.getState().log).toEqual([]);
  });

  it('at a table with no server roller wired, it refuses instead of rolling locally', async () => {
    useDice.setState({ table });
    expect(await useDice.getState().roll('Ataque', '1d20')).toBeNull();
    expect(useDice.getState().log).toEqual([]);
  });
});

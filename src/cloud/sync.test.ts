import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../data/types';
import { newCharacter } from '../engine/character';

// a fake Supabase: save_character answers what each test sets; downloads return nothing
const rpc = vi.fn();
vi.mock('./client', () => {
  const chain = { select: () => chain, eq: () => chain, then: (cb: (r: { data: unknown[]; error: null }) => void) => cb({ data: [], error: null }) };
  return {
    supabase: {
      rpc: (...a: unknown[]) => rpc(...a),
      from: () => chain,
      channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
      removeChannel: () => undefined,
    },
  };
});

// sync listens for the page closing; tests have no window
vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });

const { useApp } = await import('../store');
const { applyRemote, startSync, uploader, useSyncStatus } = await import('./sync');

const sheet = (o: Partial<Character> = {}): Character => ({ ...newCharacter('2014'), id: 'voss', name: 'Voss', hp: { current: 20, temp: 0, maxBonus: 0 }, notes: '', cloud: true, ...o });
const local = () => useApp.getState().characters.find((c) => c.id === 'voss')!;

describe('character sync with versions', () => {
  let stop: () => void;
  beforeEach(() => {
    rpc.mockReset();
    useSyncStatus.setState({ failed: {} });
    useApp.setState({ characters: [] });
    stop = startSync('user-1');
  });
  afterEach(() => stop());

  it('a save remembers the server version, so the next one builds on it', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'ok', version: 4 }, error: null });
    useApp.setState({ characters: [sheet({ serverVersion: 3, syncedAt: 1, updatedAt: 2 })] });
    uploader.schedule(local());
    await uploader.flush();
    expect(rpc).toHaveBeenCalledWith('save_character', expect.objectContaining({ ch_id: 'voss', base_version: 3 }));
    expect(local().serverVersion).toBe(4);
    expect(local().syncedAt).toBe(2);
  });

  it("the GM's damage survives a save made from an older version", async () => {
    // the player wrote notes on version 3; meanwhile the GM took 8 HP (version 4)
    const base = sheet({ serverVersion: 3, syncedAt: 10, updatedAt: 10 });
    applyRemote(base, 3);
    useApp.getState().updateCharacter('voss', (c) => { c.notes = 'anotei'; });
    rpc
      .mockResolvedValueOnce({ data: { status: 'conflict', version: 4, data: { ...base, hp: { current: 12, temp: 0, maxBonus: 0 } } }, error: null })
      .mockResolvedValueOnce({ data: { status: 'ok', version: 5 }, error: null });
    uploader.schedule(local());
    await uploader.flush(); // conflict → merged locally and queued again
    expect(local().hp.current).toBe(12);
    expect(local().notes).toBe('anotei');
    await uploader.flush(); // the merged sheet goes up on top of version 4
    expect(rpc.mock.calls[1][1]).toMatchObject({ base_version: 4 });
    expect(rpc.mock.calls[1][1].ch_data.hp.current).toBe(12);
    expect(local().serverVersion).toBe(5);
  });

  it('a live update with no local edits pending is taken as is, even from a device with a slow clock', () => {
    applyRemote(sheet({ updatedAt: 500 }), 1);
    applyRemote(sheet({ hp: { current: 5, temp: 0, maxBonus: 0 }, updatedAt: 100 }), 2); // older clock, newer version
    expect(local().hp.current).toBe(5);
    expect(local().serverVersion).toBe(2);
  });

  it('our own save coming back is not sent again', () => {
    applyRemote(sheet({ updatedAt: 500 }), 1);
    const spy = vi.spyOn(uploader, 'schedule');
    applyRemote(sheet({ updatedAt: 500 }), 2);
    expect(local().serverVersion).toBe(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('after a few failed saves the reason shows up for the warning', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    useApp.setState({ characters: [sheet({ serverVersion: 1, syncedAt: 1, updatedAt: 2 })] });
    for (let i = 0; i < 3; i++) {
      uploader.schedule(local());
      await uploader.flush();
    }
    expect(useSyncStatus.getState().failed.voss).toBe('sem conexão com o servidor');
  });
});

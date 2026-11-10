import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeCharacter, Uploader } from './merge';
import { newCharacter } from '../engine/character';
import type { Character } from '../data/types';

const ch = (id: string, hp: number, updatedAt: number): Character => ({ ...newCharacter('2014'), id, name: id, updatedAt, hp: { current: hp, temp: 0, maxBonus: 0 } });

describe('Uploader', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces edits and sends only the latest state', async () => {
    const sent: number[] = [];
    const up = new Uploader(async (c) => { sent.push(c.hp.current); }, 800);
    up.schedule(ch('v', 9, 1));
    up.schedule(ch('v', 8, 2));
    up.schedule(ch('v', 7, 3));
    expect(up.pending()).toBe(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(sent).toEqual([7]);
    expect(up.pending()).toBe(0);
  });

  it('retries with backoff when the network fails, without losing newer edits', async () => {
    const sent: number[] = [];
    let failures = 2;
    const up = new Uploader(async (c) => {
      if (failures-- > 0) throw new Error('Failed to fetch');
      sent.push(c.hp.current);
    }, 800);
    up.schedule(ch('v', 9, 1));
    await vi.advanceTimersByTimeAsync(800); // fail #1, retry in 1s
    up.schedule(ch('v', 5, 2)); // edited while offline
    await vi.advanceTimersByTimeAsync(1000); // fail #2, retry in 2s
    expect(up.pending()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual([5]);
    expect(up.pending()).toBe(0);
  });

  it('flush() sends everything immediately', async () => {
    const sent: string[] = [];
    const up = new Uploader(async (c) => { sent.push(c.id); }, 800);
    up.schedule(ch('a', 1, 1));
    up.schedule(ch('b', 1, 1));
    await up.flush();
    expect(sent.sort()).toEqual(['a', 'b']);
  });
});

describe('mergeCharacter (three-way)', () => {
  const base = { ...ch('v', 20, 100), notes: 'antes', conditions: [] as string[] };

  it("keeps the GM's damage when the player edited something else meanwhile", () => {
    const local = { ...base, notes: 'anotei algo', updatedAt: 300 }; // player wrote notes
    const remote = { ...base, hp: { ...base.hp, current: 12 }, conditions: ['poisoned'], updatedAt: 200 }; // GM hit and poisoned
    const m = mergeCharacter(base, local, remote);
    expect(m.hp.current).toBe(12);
    expect(m.conditions).toEqual(['poisoned']);
    expect(m.notes).toBe('anotei algo');
    expect(m.cloud).toBe(true);
  });

  it('a change made on only one side always survives, whatever the clocks say', () => {
    const local = { ...base, hp: { ...base.hp, current: 25 }, updatedAt: 50 }; // healed, clock behind
    const remote = { ...base, notes: 'outro aparelho', updatedAt: 999 };
    const m = mergeCharacter(base, local, remote);
    expect(m.hp.current).toBe(25);
    expect(m.notes).toBe('outro aparelho');
  });

  it('when both sides changed the same field: server for HP and conditions, this device for the rest', () => {
    const local = { ...base, hp: { ...base.hp, current: 18 }, notes: 'meu texto', updatedAt: 300 };
    const remote = { ...base, hp: { ...base.hp, current: 9 }, notes: 'texto do outro', updatedAt: 200 };
    const m = mergeCharacter(base, local, remote);
    expect(m.hp.current).toBe(9);
    expect(m.notes).toBe('meu texto');
  });

  it('without a known base, table fields come from the server and the rest from here', () => {
    const local = { ...base, hp: { ...base.hp, current: 20 }, notes: 'local', updatedAt: 300 };
    const remote = { ...base, hp: { ...base.hp, current: 7 }, notes: 'remoto', updatedAt: 200 };
    const m = mergeCharacter(undefined, local, remote);
    expect(m.hp.current).toBe(7);
    expect(m.notes).toBe('local');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeRemote, Uploader } from './merge';
import { newCharacter } from '../engine/character';
import type { Character } from '../data/types';

const ch = (id: string, hp: number, updatedAt: number): Character => ({ ...newCharacter('2014'), id, name: id, updatedAt, hp: { current: hp, temp: 0, maxBonus: 0 } });

describe('mergeRemote', () => {
  it('a newer remote copy replaces the local one and stays marked as cloud', () => {
    const r = mergeRemote(ch('v', 10, 100), ch('v', 4, 200));
    expect(r?.hp.current).toBe(4);
    expect(r?.cloud).toBe(true);
  });
  it('an older or equal remote copy never overwrites local edits', () => {
    expect(mergeRemote(ch('v', 10, 300), ch('v', 4, 200))).toBeNull();
    expect(mergeRemote(ch('v', 10, 200), ch('v', 4, 200))).toBeNull();
  });
  it('a character that only exists remotely is taken as is', () => {
    expect(mergeRemote(undefined, ch('v', 4, 200))?.id).toBe('v');
  });
});

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

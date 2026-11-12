import { useEffect, useState } from 'react';

/**
 * One live subscription shared by every component that asks for the same thing.
 * The turn order, the map, the chat and the party panel all watch the same characters and the
 * same fight; without this each opened its own realtime channel and its own queries, so one change
 * reached each browser three or four times.
 */
interface Entry<T> {
  value: T;
  subs: Set<(v: T) => void>;
  stop?: () => void;
  refs: number;
  timer?: number;
}
const registry = new Map<string, Entry<unknown>>();

/** Updates a shared value from outside a component (no-op when nobody is watching it). */
export function updateShared<T>(key: string, f: (v: T) => T) {
  const e = registry.get(key) as Entry<T> | undefined;
  if (!e) return;
  e.value = f(e.value);
  e.subs.forEach((s) => s(e.value));
}

export function useShared<T>(key: string | null, initial: T, start: (set: (f: (v: T) => T) => void) => () => void): T {
  const [value, setValue] = useState<T>(() => (key && registry.has(key) ? (registry.get(key)!.value as T) : initial));
  useEffect(() => {
    if (!key) { setValue(initial); return; }
    let e = registry.get(key) as Entry<T> | undefined;
    if (!e) {
      const entry: Entry<T> = { value: initial, subs: new Set(), refs: 0 };
      e = entry;
      registry.set(key, entry as Entry<unknown>);
      entry.stop = start((f) => {
        entry.value = f(entry.value);
        entry.subs.forEach((s) => s(entry.value));
      });
    }
    const entry = e;
    window.clearTimeout(entry.timer);
    entry.refs++;
    entry.subs.add(setValue);
    setValue(entry.value);
    return () => {
      entry.subs.delete(setValue);
      entry.refs--;
      // keep it a moment: switching tabs unmounts and remounts the same panels
      if (entry.refs === 0) entry.timer = window.setTimeout(() => { if (entry.refs === 0) { entry.stop?.(); registry.delete(key); } }, 3000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

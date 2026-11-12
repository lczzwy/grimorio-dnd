import { useEffect, useMemo, useState } from 'react';
import type { Edition, SrdData } from './types';
import { useApp } from '../store';
import { HOMEBREW_KINDS, type Homebrew, type HomebrewKind } from './homebrew';
import { applyTranslation, type Translation } from './translate';

const cache: Partial<Record<Edition, Promise<SrdData>>> = {};
const ready: Partial<Record<Edition, SrdData>> = {};

export function loadSrd(ed: Edition): Promise<SrdData> {
  if (!cache[ed]) {
    const base = `${import.meta.env.BASE_URL}data/`;
    const pt = fetch(`${base}pt-${ed}.json`).then((r) => (r.ok ? (r.json() as Promise<Translation>) : undefined)).catch(() => undefined);
    cache[ed] = fetch(`${base}srd-${ed}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar dados do SRD ' + ed);
        return r.json() as Promise<SrdData>;
      })
      .then(async (d) => (ready[ed] = applyTranslation(d, await pt)));
  }
  return cache[ed]!;
}

/** SRD data for an edition, merged with the user's homebrew content. */
export function useSrd(ed: Edition | undefined): SrdData | null {
  const [base, setBase] = useState<SrdData | null>(() => (ed && ready[ed]) || null);
  const homebrew = useApp((s) => (ed ? s.homebrew[ed] : undefined));
  useEffect(() => {
    if (!ed) return;
    let alive = true;
    if (ready[ed]) return setBase(ready[ed]!); // already loaded: no loading flash
    setBase(null);
    loadSrd(ed).then((d) => alive && setBase(d));
    return () => {
      alive = false;
    };
  }, [ed]);
  return useMemo(() => {
    if (!base) return null;
    if (!homebrew) return base;
    return withHomebrew(base, homebrew);
  }, [base, homebrew]);
}

/** The SRD with this browser's homebrew on top (same id: the homebrew wins). */
export function withHomebrew(base: SrdData, homebrew: Homebrew): SrdData {
  const merged = { ...base } as SrdData;
  for (const [k, arr] of Object.entries(homebrew)) {
    if (!HOMEBREW_KINDS.includes(k as HomebrewKind) || !Array.isArray(arr) || !arr.length) continue;
    const key = k as keyof SrdData;
    const ids = new Set(arr.map((x: { id: string }) => x.id));
    // a kind the SRD files lack (e.g. powers) starts empty
    (merged as unknown as Record<string, unknown>)[key] = [...((base[key] as { id: string }[] | undefined) || []).filter((x) => !ids.has(x.id)), ...arr];
  }
  return merged;
}

import { useEffect, useMemo, useState } from 'react';
import type { Edition, SrdData } from './types';
import { useApp } from '../store';
import { HOMEBREW_KINDS, type HomebrewKind } from './homebrew';

const cache: Partial<Record<Edition, Promise<SrdData>>> = {};

export function loadSrd(ed: Edition): Promise<SrdData> {
  if (!cache[ed]) {
    cache[ed] = fetch(`${import.meta.env.BASE_URL}data/srd-${ed}.json`).then((r) => {
      if (!r.ok) throw new Error('Falha ao carregar dados do SRD ' + ed);
      return r.json();
    });
  }
  return cache[ed]!;
}

/** SRD data for an edition, merged with the user's homebrew content. */
export function useSrd(ed: Edition | undefined): SrdData | null {
  const [base, setBase] = useState<SrdData | null>(null);
  const homebrew = useApp((s) => (ed ? s.homebrew[ed] : undefined));
  useEffect(() => {
    if (!ed) return;
    let alive = true;
    setBase(null);
    loadSrd(ed).then((d) => alive && setBase(d));
    return () => {
      alive = false;
    };
  }, [ed]);
  return useMemo(() => {
    if (!base) return null;
    if (!homebrew) return base;
    const merged = { ...base } as SrdData;
    for (const [k, arr] of Object.entries(homebrew)) {
      if (!HOMEBREW_KINDS.includes(k as HomebrewKind) || !Array.isArray(arr) || !arr.length) continue;
      const key = k as keyof SrdData;
      const ids = new Set(arr.map((x: { id: string }) => x.id));
      (merged as unknown as Record<string, unknown>)[key] = [...(base[key] as { id: string }[]).filter((x) => !ids.has(x.id)), ...arr];
    }
    return merged;
  }, [base, homebrew]);
}

import { useEffect, useRef } from 'react';
import type { Character } from '../../data/types';
import { useFlash } from '../../ui/ui';

/** A short notice when a pool (psi points, rage, ki…) runs out, saying when it comes back. */
export function useResourceNotice(c: Character | undefined) {
  const flash = useFlash((s) => s.show);
  const prev = useRef<Map<string, number> | null>(null);
  const sig = c ? c.resources.map((r) => `${r.uid}:${r.max - r.used}`).join('|') : '';
  useEffect(() => {
    if (!c) return;
    const now = new Map(c.resources.map((r) => [r.uid, r.max - r.used]));
    const was = prev.current;
    prev.current = now;
    if (!was) return;
    const empty = c.resources.find((r) => r.max > 0 && r.max - r.used === 0 && (was.get(r.uid) ?? 0) > 0);
    if (empty) flash(`${empty.name} acabou (0/${empty.max}). ${empty.reset === 'long' ? 'Volta no descanso longo.' : empty.reset === 'short' ? 'Volta no descanso curto ou longo.' : 'Não volta sozinho.'}`);
    // the signature covers every pool's value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

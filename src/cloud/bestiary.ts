import { useCallback, useEffect, useState } from 'react';
import type { Edition } from '../data/types';
import { supabase } from './client';
import { campaignErrorPt } from './campaignText';
import { normalizeCreature, type Creature } from './bestiaryLogic';
import { isStoredPortrait, storePortrait } from './portraits';

interface Row { id: string; edition: Edition; name: string; data: unknown; updated_at: string }

const ok = <T,>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(campaignErrorPt(r.error.message));
  return r.data;
};

const toCreature = (r: Row): Creature => ({ ...normalizeCreature(r.data), id: r.id, name: r.name });

/** The signed-in GM's creatures for an edition, sorted by name. */
export function useBestiary(edition: Edition) {
  const [list, setList] = useState<Creature[] | null>(null);
  const load = useCallback(async () => {
    const rows = ok(await supabase.from('creatures').select('id, edition, name, data, updated_at').eq('edition', edition).order('name')) as Row[];
    const list = rows.map(toCreature);
    setList(list);
    // move pictures still saved inside the creature to Storage, one time
    for (const c of list) {
      if (!c.image?.startsWith('data:image/')) continue;
      const url = await storePortrait(c.image);
      if (isStoredPortrait(url)) await saveCreature({ ...c, image: url }, edition).catch(() => undefined);
    }
  }, [edition]);
  useEffect(() => {
    void load().catch(() => setList([]));
  }, [load]);
  return { list, reload: load };
}

/** Creates or updates a creature; returns it with its id. */
export async function saveCreature(c: Creature, edition: Edition): Promise<Creature> {
  const clean = normalizeCreature(c);
  if (!clean.name) throw new Error('Dê um nome à criatura.');
  const { id, ...data } = clean;
  const row = { name: clean.name, edition, data, updated_at: new Date().toISOString() };
  const saved = (id
    ? ok(await supabase.from('creatures').update(row).eq('id', id).select('id, edition, name, data, updated_at').single())
    : ok(await supabase.from('creatures').insert(row).select('id, edition, name, data, updated_at').single())) as Row;
  return toCreature(saved);
}

export async function deleteCreature(id: string) {
  ok(await supabase.from('creatures').delete().eq('id', id));
}

import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Character } from '../data/types';
import { normalizeCharacter } from '../engine/character';
import { useApp } from '../store';
import { supabase } from './client';
import { mergeRemote, Uploader } from './merge';

let currentUser: string | null = null;
/** id@updatedAt of copies that came from the server, so they are not echoed back. */
const fromServer = new Set<string>();
const key = (c: Character) => `${c.id}@${c.updatedAt}`;

async function sendCharacter(c: Character) {
  if (!currentUser) return;
  const { error } = await supabase.from('characters').upsert({
    id: c.id,
    owner: currentUser,
    edition: c.edition,
    name: c.name,
    data: c,
    updated_at: new Date(c.updatedAt || Date.now()).toISOString(),
  });
  if (error) throw new Error(error.message);
}

export const uploader = new Uploader(sendCharacter, 800);

/** Applies a copy from the server to the local store when it is newer. */
export function applyRemote(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const remote = normalizeCharacter(raw as Character);
  const local = useApp.getState().characters.find((c) => c.id === remote.id);
  const merged = mergeRemote(local, remote);
  if (!merged) return;
  fromServer.add(key(merged));
  useApp.setState((s) => ({
    characters: local ? s.characters.map((c) => (c.id === merged.id ? merged : c)) : [...s.characters, merged],
  }));
}

/** Starts syncing the signed-in user's characters. Returns a function that stops it. */
export function startSync(userId: string): () => void {
  currentUser = userId;
  const startedAt = Date.now();

  // 1. download the account's characters
  void supabase
    .from('characters')
    .select('data')
    .eq('owner', userId)
    .then(({ data, error }) => {
      if (error) return;
      const remoteIds = new Set<string>();
      for (const row of data || []) {
        applyRemote(row.data);
        remoteIds.add((row.data as Character).id);
      }
      // deleted on another device: keep it here as a local-only sheet
      useApp.setState((s) => ({ characters: s.characters.map((c) => (c.cloud && !remoteIds.has(c.id) ? { ...c, cloud: false } : c)) }));
    });

  // 2. upload local edits of cloud characters (and characters created while signed in)
  const unsubStore = useApp.subscribe((state, prev) => {
    if (state.characters === prev.characters) return;
    const before = new Map(prev.characters.map((c) => [c.id, c]));
    for (const c of state.characters) {
      const old = before.get(c.id);
      if (old === c) continue;
      if (fromServer.delete(key(c))) continue;
      if (!old && c.cloud === undefined && c.createdAt >= startedAt) {
        useApp.setState((s) => ({ characters: s.characters.map((x) => (x.id === c.id ? { ...x, cloud: true } : x)) }));
        continue; // the state change above re-enters with cloud = true
      }
      if (c.cloud) uploader.schedule(c);
    }
  });

  // 3. live updates (another device, or the gm applying damage)
  const channel: RealtimeChannel = supabase
    .channel('my-characters-' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `owner=eq.${userId}` }, (p) => {
      if (p.eventType === 'DELETE') return;
      applyRemote((p.new as { data: unknown }).data);
    })
    .subscribe();

  const onUnload = () => void uploader.flush();
  window.addEventListener('beforeunload', onUnload);

  return () => {
    void uploader.flush();
    unsubStore();
    void supabase.removeChannel(channel);
    window.removeEventListener('beforeunload', onUnload);
    currentUser = null;
  };
}

/** Marks every local character as synced and uploads them now. */
export async function uploadAll(): Promise<number> {
  const local = useApp.getState().characters.filter((c) => !c.cloud);
  useApp.setState((s) => ({ characters: s.characters.map((c) => (c.cloud ? c : { ...c, cloud: true })) }));
  await uploader.flush();
  return local.length;
}

export async function deleteCloudCharacter(id: string) {
  const { error } = await supabase.from('characters').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Follows characters of a campaign (read-only for non-owners). */
export function watchCharacters(ids: string[], onChange: (c: Character) => void): () => void {
  if (!ids.length) return () => undefined;
  void supabase
    .from('characters')
    .select('data')
    .in('id', ids)
    .then(({ data }) => (data || []).forEach((r) => onChange(normalizeCharacter(r.data as Character))));
  const channel = supabase
    .channel('watch-' + ids.join(',').slice(0, 60) + Math.random().toString(36).slice(2, 6))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'characters', filter: `id=in.(${ids.join(',')})` }, (p) =>
      onChange(normalizeCharacter((p.new as { data: Character }).data)),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}

/** Asks for confirmation and deletes a character here and, if synced, from the account. */
export async function confirmAndDelete(c: Character): Promise<boolean> {
  const name = c.name || 'este personagem';
  const msg = c.cloud
    ? `Excluir ${name}? Ele também será apagado da sua conta online e sairá das campanhas. Não dá para desfazer.`
    : `Excluir ${name}? Não dá para desfazer.`;
  if (!confirm(msg)) return false;
  if (c.cloud && currentUser) {
    try {
      await deleteCloudCharacter(c.id);
    } catch (e) {
      alert('Não consegui apagar a cópia online agora (' + (e as Error).message + '). Tente de novo com internet.');
      return false;
    }
  }
  useApp.getState().removeCharacter(c.id);
  return true;
}

import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Character } from '../data/types';
import { normalizeCharacter, uid } from '../engine/character';
import { useApp } from '../store';
import { supabase } from './client';
import { mergeCharacter, Uploader } from './merge';
import { migratePortraits } from './portraits';
import { alertBox, confirmBox } from '../ui/dialogs';

let currentUser: string | null = null;
/** id@updatedAt of copies written by the sync itself, so they are not sent back up. */
const fromServer = new Set<string>();
const key = (c: Character) => `${c.id}@${c.updatedAt}`;
/** Last copy each side agreed on, per character (in memory; used by the three-way merge). */
const bases = new Map<string, Character>();

/* ---------------- sync status (what the warning banner shows) ---------------- */

interface SyncStatus { failed: Record<string, string>; clear: (id: string) => void }
/** Characters that could not be saved online, with the reason. */
export const useSyncStatus = create<SyncStatus>((set) => ({
  failed: {},
  clear: (id) => set((s) => { const f = { ...s.failed }; delete f[id]; return { failed: f }; }),
}));
const failures = new Map<string, number>();
const FAIL_WARN_AFTER = 3;

/** Plain-language reason for a failed save. */
export function saveErrorPt(message: string) {
  if (/failed to fetch|network|load failed/i.test(message)) return 'sem conexão com o servidor';
  if (/jwt|not_authenticated|auth/i.test(message)) return 'a sessão expirou, entre na conta de novo';
  if (/payload|too large|413/i.test(message)) return 'a ficha ficou grande demais (foto muito pesada?)';
  return message;
}

/* ---------------- writing to the local store without echoing back ---------------- */

/** Replaces a character locally. `upload: false` means it already matches the server. */
function putLocal(c: Character, upload: boolean) {
  if (!upload) fromServer.add(key(c));
  useApp.setState((s) => ({
    characters: s.characters.some((x) => x.id === c.id) ? s.characters.map((x) => (x.id === c.id ? c : x)) : [...s.characters, c],
  }));
}

const strip = (c: Character) => {
  const copy: Partial<Character> = { ...c };
  delete copy.cloud;
  delete copy.serverVersion;
  delete copy.syncedAt;
  return copy;
};

/* ---------------- sending ---------------- */

type SaveResult = { status: 'ok'; version: number } | { status: 'conflict'; version: number; data: Character };

async function sendCharacter(c: Character) {
  if (!currentUser) return;
  const { data, error } = await supabase.rpc('save_character', {
    ch_id: c.id,
    ch_edition: c.edition,
    ch_name: c.name,
    ch_data: strip(c),
    base_version: c.serverVersion ?? null,
  });
  if (error) {
    // a sheet id that already belongs to someone else (very rare): keep it as a new sheet
    if (/not_owner/.test(error.message)) {
      const local = useApp.getState().characters.find((x) => x.id === c.id);
      if (local) {
        useApp.setState((s) => ({ characters: s.characters.filter((x) => x.id !== c.id) }));
        putLocal({ ...local, id: uid(), serverVersion: undefined, syncedAt: undefined, updatedAt: Date.now() }, true);
      }
      return;
    }
    const n = (failures.get(c.id) || 0) + 1;
    failures.set(c.id, n);
    if (n >= FAIL_WARN_AFTER) useSyncStatus.setState((s) => ({ failed: { ...s.failed, [c.id]: saveErrorPt(error.message) } }));
    throw new Error(error.message);
  }
  failures.delete(c.id);
  useSyncStatus.getState().clear(c.id);
  const res = data as SaveResult;
  const now = useApp.getState().characters.find((x) => x.id === c.id) ?? c;
  if (res.status === 'ok') {
    bases.set(c.id, { ...c, serverVersion: res.version });
    // this device now matches version N; edits made while sending stay queued
    putLocal({ ...now, serverVersion: res.version, syncedAt: c.updatedAt }, false);
    return;
  }
  // someone changed it meanwhile (the GM's damage, another device): merge instead of overwriting
  const remote = normalizeCharacter(res.data);
  const merged = mergeCharacter(bases.get(c.id), now, remote);
  bases.set(c.id, remote);
  putLocal({ ...merged, updatedAt: Date.now(), serverVersion: res.version, syncedAt: now.syncedAt }, true);
}

export const uploader = new Uploader(sendCharacter, 800);

/* ---------------- receiving ---------------- */

/** Applies a copy that came from the server (download, live update, the GM's damage). */
export function applyRemote(raw: unknown, version?: number) {
  if (!raw || typeof raw !== 'object') return;
  const remote = normalizeCharacter(raw as Character);
  const v = version ?? 0;
  const local = useApp.getState().characters.find((c) => c.id === remote.id);
  bases.set(remote.id, { ...remote, serverVersion: v });
  if (!local) return putLocal({ ...remote, cloud: true, serverVersion: v, syncedAt: remote.updatedAt }, false);
  if (local.serverVersion != null && local.serverVersion >= v) return; // already have it
  // our own save coming back (it can arrive before the save's answer): same content, just note the version
  if (JSON.stringify(strip(local)) === JSON.stringify(strip(remote))) return putLocal({ ...local, serverVersion: v, syncedAt: local.updatedAt }, false);
  const unsent = uploader.has(local.id) || (local.syncedAt != null ? local.updatedAt > local.syncedAt : local.serverVersion == null);
  if (!unsent) return putLocal({ ...remote, cloud: true, serverVersion: v, syncedAt: remote.updatedAt }, false);
  // edits on this device not uploaded yet: merge, then send the result on top of version v
  const merged = mergeCharacter(local.serverVersion == null ? undefined : bases.get(local.id), local, remote);
  putLocal({ ...merged, updatedAt: Date.now(), serverVersion: v, syncedAt: local.syncedAt }, true);
}

/** Starts syncing the signed-in user's characters. Returns a function that stops it. */
export function startSync(userId: string): () => void {
  currentUser = userId;
  const startedAt = Date.now();

  // 1. download the account's characters
  void supabase
    .from('characters')
    .select('data, version')
    .eq('owner', userId)
    .then(({ data, error }) => {
      if (error) return;
      const remoteIds = new Set<string>();
      for (const row of data || []) {
        applyRemote(row.data, row.version as number);
        remoteIds.add((row.data as Character).id);
      }
      // edits made on this device while offline: send them now (on top of the version they started from)
      for (const c of useApp.getState().characters) if (c.cloud && c.syncedAt != null && c.updatedAt > c.syncedAt) uploader.schedule(c);
      // old pictures saved inside the sheets go to Storage (the sheets get lighter)
      void migratePortraits();
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
      const row = p.new as { data: unknown; version: number };
      applyRemote(row.data, row.version);
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
  if (!(await confirmBox(msg, { danger: true, ok: 'Excluir' }))) return false;
  if (c.cloud && currentUser) {
    try {
      await deleteCloudCharacter(c.id);
    } catch (e) {
      void alertBox('Não consegui apagar a cópia online agora (' + (e as Error).message + '). Tente de novo com internet.');
      return false;
    }
  }
  useApp.getState().removeCharacter(c.id);
  return true;
}

import { useApp } from '../store';
import { useAuth } from './auth';
import { supabase } from './client';

export const PORTRAIT_BUCKET = 'portraits';

/** True for a picture already in our Storage bucket (as opposed to an inline data: image). */
export function isStoredPortrait(url: string | null | undefined): boolean {
  return !!url && /^https:\/\/[a-z0-9.-]+\.supabase\.co\/storage\/v1\/object\/public\/portraits\//.test(url);
}

/** Where a person's picture goes: their own folder, a fresh name per upload. */
export function portraitPath(userId: string, name: string = crypto.randomUUID()) {
  return `${userId}/${name}.jpg`;
}

/**
 * Sends an inline picture (data: URL) to Supabase Storage and returns its public address.
 * Signed out, offline or on any failure it returns the picture unchanged, so nothing is lost:
 * the next login moves it (see migratePortraits).
 */
export async function storePortrait(dataUrl: string): Promise<string> {
  const uid = useAuth.getState().user?.id;
  if (!uid || !dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = portraitPath(uid);
    const { error } = await supabase.storage.from(PORTRAIT_BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (error) return dataUrl;
    return supabase.storage.from(PORTRAIT_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return dataUrl;
  }
}

let migrating = false;
/**
 * Moves the pictures of this account's sheets that are still inline (data: URLs) to Storage.
 * Runs after login; each moved sheet is then saved online with just the address.
 */
export async function migratePortraits(): Promise<number> {
  if (migrating || !useAuth.getState().user) return 0;
  migrating = true;
  let moved = 0;
  try {
    const todo = useApp.getState().characters.filter((c) => c.cloud && c.portrait?.startsWith('data:image/'));
    for (const c of todo) {
      const url = await storePortrait(c.portrait!);
      if (!isStoredPortrait(url)) continue;
      useApp.getState().updateCharacter(c.id, (d) => { if (d.portrait === c.portrait) d.portrait = url; });
      moved++;
    }
  } finally {
    migrating = false;
  }
  return moved;
}

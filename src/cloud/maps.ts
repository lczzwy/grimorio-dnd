import { useEffect, useState } from 'react';
import { supabase } from './client';

export const MAP_BUCKET = 'maps';
const MAX_SIDE = 4096;
const MAX_BYTES = 5 * 1024 * 1024;

export interface BattleMapRow {
  id: string;
  campaign_id: string;
  name: string;
  image_url: string;
  width: number;
  height: number;
  grid_size: number;
  grid_x: number;
  grid_y: number;
  show_grid: boolean;
  active: boolean;
  created_at: string;
}

/** All maps of a campaign, kept live; `active` is the one on the table (or null for the felt). */
export function useCampaignMaps(campaignId: string) {
  const [maps, setMaps] = useState<BattleMapRow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('campaign_maps').select('*').eq('campaign_id', campaignId).order('created_at');
      if (alive && data) setMaps(data as BattleMapRow[]);
    };
    void load();
    const ch = supabase
      .channel('maps-' + campaignId + '-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_maps', filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [campaignId]);
  return { maps, active: maps.find((m) => m.active) ?? null };
}

/** Shrinks big pictures (longest side 4096 px) and re-encodes them so they fit the 5 MB limit. */
async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const tryEncode = async (q: number) => {
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', q));
    if (!blob) throw new Error('Não consegui ler essa imagem.');
    return { blob, width: w, height: h };
  };
  if (scale === 1 && file.size <= MAX_BYTES && /^image\/(png|jpeg|webp)$/.test(file.type)) {
    return { blob: file, width: bmp.width, height: bmp.height };
  }
  let out = await tryEncode(0.86);
  while (out.blob.size > MAX_BYTES && scale > 0.3) {
    scale *= 0.8;
    out = await tryEncode(0.8);
  }
  return out;
}

/** GM only: uploads a picture and creates the map row (not active yet). */
export async function addMap(campaignId: string, file: File, name: string): Promise<BattleMapRow> {
  const { blob, width, height } = await prepareImage(file);
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `${campaignId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(MAP_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (up.error) throw new Error(mapErrorPt(up.error.message));
  const image_url = supabase.storage.from(MAP_BUCKET).getPublicUrl(path).data.publicUrl;
  // a sensible first grid: about 20 squares across the long side
  const grid_size = Math.max(24, Math.round(Math.max(width, height) / 20));
  const { data, error } = await supabase.from('campaign_maps').insert({ campaign_id: campaignId, name, image_url, width, height, grid_size }).select().single();
  if (error) throw new Error(mapErrorPt(error.message));
  return data as BattleMapRow;
}

export async function updateMap(id: string, patch: Partial<Pick<BattleMapRow, 'name' | 'grid_size' | 'grid_x' | 'grid_y' | 'show_grid'>>) {
  const { error } = await supabase.from('campaign_maps').update(patch).eq('id', id);
  if (error) throw new Error(mapErrorPt(error.message));
}

export async function setActiveMap(campaignId: string, mapId: string | null) {
  const { error } = await supabase.rpc('set_active_map', { campaign: campaignId, map: mapId });
  if (error) throw new Error(mapErrorPt(error.message));
}

export async function deleteMap(m: BattleMapRow) {
  const { error } = await supabase.from('campaign_maps').delete().eq('id', m.id);
  if (error) throw new Error(mapErrorPt(error.message));
  const marker = `/object/public/${MAP_BUCKET}/`;
  const i = m.image_url.indexOf(marker);
  if (i >= 0) await supabase.storage.from(MAP_BUCKET).remove([decodeURIComponent(m.image_url.slice(i + marker.length))]);
}

export function mapErrorPt(msg: string): string {
  if (/not_gm|row-level security|Unauthorized|403/i.test(msg)) return 'Só o mestre da campanha mexe nos mapas.';
  if (/Bucket not found/i.test(msg)) return 'O espaço de mapas ainda não existe no Supabase. Rode o schema.sql atualizado no SQL Editor.';
  if (/campaign_maps|relation .* does not exist|schema cache/i.test(msg)) return 'O banco ainda não tem a tabela de mapas. Rode o schema.sql atualizado no SQL Editor.';
  if (/exceeded|too large|payload/i.test(msg)) return 'Imagem grande demais, mesmo depois de reduzida. Tente uma com até 5 MB.';
  if (/map_not_found/.test(msg)) return 'Esse mapa não existe mais.';
  return msg;
}

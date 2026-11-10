import { useEffect, useState } from 'react';
import { supabase } from './client';

export const MAP_BUCKET = 'maps';
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_maps', filter: `campaign_id=eq.${campaignId}` }, (p) => { if (p.eventType !== 'DELETE') void load(); })
      // deletions carry only the id (see useMapTokens), so they are heard without the filter
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'campaign_maps' }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) setMaps((m) => m.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [campaignId]);
  const drop = (id: string) => setMaps((m) => m.filter((x) => x.id !== id));
  return { maps, active: maps.find((m) => m.active) ?? null, drop };
}

/** GM only: uploads an already-cropped square picture and creates the map row (not on the table yet). */
export async function addMap(campaignId: string, blob: Blob, size: number, name: string): Promise<BattleMapRow> {
  if (blob.size > MAX_BYTES) throw new Error('Imagem grande demais, mesmo depois de reduzida. Tente uma com até 5 MB.');
  const path = `${campaignId}/${crypto.randomUUID()}.webp`;
  const up = await supabase.storage.from(MAP_BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp', cacheControl: '31536000', upsert: false });
  if (up.error) throw new Error(mapErrorPt(up.error.message));
  const image_url = supabase.storage.from(MAP_BUCKET).getPublicUrl(path).data.publicUrl;
  // a sensible first grid: 20 squares across
  const grid_size = Math.max(16, Math.round((size / 20) * 2) / 2);
  const { data, error } = await supabase.from('campaign_maps').insert({ campaign_id: campaignId, name, image_url, width: size, height: size, grid_size }).select().single();
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

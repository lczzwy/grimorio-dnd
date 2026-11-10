import { useEffect, useState } from 'react';
import { supabase } from './client';
import { MAP_BUCKET } from './maps';

export type TokenColor = 'ally' | 'enemy' | 'neutral';

export interface MapToken {
  id: string;
  campaign_id: string;
  map_id: string;
  name: string;
  image_url: string | null;
  x: number;
  y: number;
  size: number;
  color: TokenColor;
  hidden: boolean;
  owner: string | null;
}

export const TOKEN_COLORS: { id: TokenColor; label: string; hint: string }[] = [
  { id: 'ally', label: 'Aliado', hint: 'verde' },
  { id: 'enemy', label: 'Inimigo', hint: 'vermelho' },
  { id: 'neutral', label: 'Neutro', hint: 'dourado' },
];

/** Tokens on one map, kept live. Players never receive hidden ones (the database filters them). */
export function useMapTokens(campaignId: string, mapId: string | undefined) {
  const [tokens, setTokens] = useState<MapToken[]>([]);
  useEffect(() => {
    if (!mapId) { setTokens([]); return; }
    let alive = true;
    let seq = 0;
    let timer: number | undefined;
    const load = async () => {
      const mine = ++seq;
      const { data } = await supabase.from('map_tokens').select('*').eq('map_id', mapId).order('created_at');
      // an answer that started before a newer change is stale: drop it instead of jumping back
      if (alive && data && mine === seq) setTokens(data as MapToken[]);
    };
    // one refresh after a burst of changes (it also catches a token the GM just hid from players)
    const later = () => { seq++; window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 700); };
    void load();
    const ch = supabase
      .channel('tokens-' + mapId + '-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_tokens', filter: `campaign_id=eq.${campaignId}` }, (p) => {
        const row = (p.new && 'id' in p.new ? p.new : p.old) as Partial<MapToken>;
        if (row.map_id && row.map_id !== mapId) return;
        if (p.eventType === 'DELETE') setTokens((t) => t.filter((x) => x.id !== row.id));
        else if (p.eventType === 'UPDATE') setTokens((t) => t.map((x) => (x.id === row.id ? { ...x, ...(row as MapToken) } : x)));
        later();
      })
      .subscribe();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [campaignId, mapId]);
  return [tokens, setTokens] as const;
}

/** Square-crops a picture to 256 px for a round token and stores it in the campaign folder. */
export async function uploadTokenImage(campaignId: string, file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.86));
  if (!blob) throw new Error('Não consegui ler essa imagem.');
  const path = `${campaignId}/tokens/${crypto.randomUUID()}.webp`;
  const up = await supabase.storage.from(MAP_BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (up.error) throw new Error(tokenErrorPt(up.error.message));
  return supabase.storage.from(MAP_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function addToken(t: Omit<MapToken, 'id'>) {
  const { error } = await supabase.from('map_tokens').insert(t);
  if (error) throw new Error(tokenErrorPt(error.message));
}

export async function updateToken(id: string, patch: Partial<Omit<MapToken, 'id' | 'campaign_id' | 'map_id'>>) {
  const { error } = await supabase.from('map_tokens').update(patch).eq('id', id);
  if (error) throw new Error(tokenErrorPt(error.message));
}

export async function deleteToken(id: string) {
  const { error } = await supabase.from('map_tokens').delete().eq('id', id);
  if (error) throw new Error(tokenErrorPt(error.message));
}

export async function moveTokens(moves: { id: string; x: number; y: number }[]) {
  if (!moves.length) return;
  const { error } = await supabase.rpc('move_tokens', { ids: moves.map((m) => m.id), xs: moves.map((m) => m.x), ys: moves.map((m) => m.y) });
  if (error) throw new Error(tokenErrorPt(error.message));
}

/** Centre of the cell block a token of `size` squares lands on, given a point near its centre. */
export function snapToGrid(x: number, y: number, size: number, grid: { grid_size: number; grid_x: number; grid_y: number }) {
  const g = grid.grid_size;
  const half = (size * g) / 2;
  const cx = Math.round((x - half - grid.grid_x) / g);
  const cy = Math.round((y - half - grid.grid_y) / g);
  return { x: grid.grid_x + cx * g + half, y: grid.grid_y + cy * g + half };
}

export function tokenErrorPt(msg: string): string {
  if (/not_allowed/.test(msg)) return 'Você só pode mover o seu próprio token.';
  if (/row-level security|403|Unauthorized/i.test(msg)) return 'Só o mestre cria, edita e apaga tokens.';
  if (/map_tokens|does not exist|schema cache/i.test(msg)) return 'O banco ainda não tem a tabela de tokens. Rode o schema.sql atualizado no SQL Editor.';
  return msg;
}

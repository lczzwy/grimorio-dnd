import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './client';

export interface Drawing {
  id: string;
  campaign_id: string;
  map_id: string;
  author: string;
  color: string;
  width: number;
  /** flat list: x0, y0, x1, y1, … in picture pixels */
  points: number[];
}

export const PEN_COLORS = ['#e8c46a', '#e5484d', '#4fbf6a', '#4aa3ff', '#b57bff', '#ffffff', '#111111'];

/** Pencil strokes on one map, kept live for everyone at the table. */
export function useDrawings(campaignId: string, mapId: string | undefined) {
  const [list, setList] = useState<Drawing[]>([]);
  useEffect(() => {
    if (!mapId) { setList([]); return; }
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('map_drawings').select('*').eq('map_id', mapId).order('created_at');
      if (alive && data) setList(data as Drawing[]);
    };
    void load();
    const ch = supabase
      .channel('draw-' + mapId + '-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'map_drawings', filter: `campaign_id=eq.${campaignId}` }, (p) => {
        const d = p.new as Drawing;
        if (d.map_id === mapId) setList((l) => (l.some((x) => x.id === d.id) ? l : [...l, d]));
      })
      // deletions carry only the id, so they are heard without the filter
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'map_drawings' }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) setList((l) => l.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [campaignId, mapId]);

  const add = useCallback(async (d: Omit<Drawing, 'id' | 'author'>) => {
    const { data, error } = await supabase.from('map_drawings').insert(d).select().single();
    if (error) throw new Error(drawErrorPt(error.message));
    setList((l) => (l.some((x) => x.id === data.id) ? l : [...l, data as Drawing]));
  }, []);
  const remove = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setList((l) => l.filter((x) => !ids.includes(x.id)));
    const { error } = await supabase.from('map_drawings').delete().in('id', ids);
    if (error) throw new Error(drawErrorPt(error.message));
  }, []);
  return { drawings: list, add, remove };
}

export function drawErrorPt(msg: string) {
  if (/map_drawings|does not exist|schema cache/i.test(msg)) return 'O banco ainda não tem a tabela de desenhos. Rode o schema.sql atualizado no SQL Editor.';
  if (/row-level security/i.test(msg)) return 'Você só pode apagar os seus próprios desenhos.';
  return msg;
}

/* ---------------- régua e ping: ao vivo, sem guardar nada ---------------- */

export interface RulerFx { uid: string; name: string; color: string; a: { x: number; y: number }; b: { x: number; y: number } }
export interface PingFx { key: number; x: number; y: number; color: string; name: string }

/**
 * What others are measuring and pointing at, sent straight between browsers (a broadcast channel):
 * fast, and nothing is stored.
 */
export function useMapFx(campaignId: string, mapId: string | undefined, me: { uid: string; name: string; color: string }) {
  const [rulers, setRulers] = useState<Record<string, RulerFx>>({});
  const [pings, setPings] = useState<PingFx[]>([]);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const meRef = useRef(me);
  meRef.current = me;

  const showPing = useCallback((p: Omit<PingFx, 'key'>) => {
    const key = Date.now() + Math.random();
    setPings((l) => [...l, { ...p, key }]);
    window.setTimeout(() => setPings((l) => l.filter((x) => x.key !== key)), 2200);
  }, []);

  useEffect(() => {
    if (!mapId) return;
    const ch = supabase
      .channel('mapfx-' + campaignId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'ruler' }, ({ payload }) => {
        if (payload.map !== mapId) return;
        setRulers((r) => {
          const next = { ...r };
          if (payload.clear) delete next[payload.uid];
          else next[payload.uid] = payload as RulerFx;
          return next;
        });
      })
      .on('broadcast', { event: 'ping' }, ({ payload }) => {
        if (payload.map === mapId) showPing(payload);
      })
      .subscribe();
    channel.current = ch;
    return () => {
      channel.current = null;
      setRulers({});
      void supabase.removeChannel(ch);
    };
  }, [campaignId, mapId, showPing]);

  const last = useRef(0);
  const sendRuler = useCallback((line: { a: { x: number; y: number }; b: { x: number; y: number } } | null) => {
    const ch = channel.current;
    if (!ch) return;
    const m = meRef.current;
    if (!line) { void ch.send({ type: 'broadcast', event: 'ruler', payload: { map: mapId, uid: m.uid, clear: true } }); return; }
    // at most ~6 updates a second: each one reaches everyone at the table, and the free realtime
    // plan allows about 100 messages a second in total
    const now = Date.now();
    if (now - last.current < 160) return;
    last.current = now;
    void ch.send({ type: 'broadcast', event: 'ruler', payload: { map: mapId, uid: m.uid, name: m.name, color: m.color, ...line } });
  }, [mapId]);

  const sendPing = useCallback((x: number, y: number) => {
    const m = meRef.current;
    const p = { x, y, color: m.color, name: m.name };
    showPing(p);
    void channel.current?.send({ type: 'broadcast', event: 'ping', payload: { map: mapId, ...p } });
  }, [mapId, showPing]);

  return { rulers, pings, sendRuler, sendPing };
}

/** D&D grid distance: every square counts, diagonals included (1 square = 1.5 m). */
export function gridDistance(a: { x: number; y: number }, b: { x: number; y: number }, gridSize: number) {
  const squares = Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / gridSize);
  const meters = squares * 1.5;
  return { squares, label: `${squares} quadrado${squares === 1 ? "" : "s"} (${meters.toLocaleString("pt-BR")} m)` };
}

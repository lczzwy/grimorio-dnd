import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Box, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../cloud/client';
import { colorFor } from '../cloud/chatLogic';
import type { RollRow } from '../cloud/rollRow';
import { diceOfRoll, forcedNotation, inkFor } from './notation';
import { playDiceSound, unlockAudio } from './sound';

/* ---------------- preferences (per device) ---------------- */

const read = (k: string, d: boolean) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v === '1';
  } catch {
    return d;
  }
};
const write = (k: string, v: boolean) => {
  try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ }
};

interface DicePrefs { on: boolean; sound: boolean; toggle: () => void; toggleSound: () => void }
export const useDicePrefs = create<DicePrefs>((set, get) => ({
  on: read('dice3d', true),
  sound: read('dice3d-sound', true),
  toggle: () => { const on = !get().on; write('dice3d', on); set({ on }); },
  toggleSound: () => { const sound = !get().sound; write('dice3d-sound', sound); if (sound) unlockAudio(); set({ sound }); },
}));

/** Small switches for the 3D dice and their sound. */
export function DicePrefsButtons() {
  const { on, sound, toggle, toggleSound } = useDicePrefs();
  return (
    <>
      <button className={'btn ghost sm icon' + (on ? ' active' : '')} title={on ? 'Dados 3D ligados' : 'Dados 3D desligados'} onClick={toggle}><Box size={15} /></button>
      <button className="btn ghost sm icon" title={sound ? 'Som dos dados ligado' : 'Som dos dados desligado'} onClick={toggleSound} disabled={!on}>
        {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </button>
    </>
  );
}

/* ---------------- the table ---------------- */

// minimal surface of @3d-dice/dice-box-threejs that we use
interface DiceBoxLike {
  initialize(): Promise<void>;
  roll(notation: string): Promise<unknown>;
  clearDice(): void;
  updateConfig(c: Record<string, unknown>): Promise<void>;
  setDimensions(): void;
  desk?: { material: { opacity: number } };
}

const BADGE_MS = 2600;
const MAX_QUEUE = 4;

/**
 * Every roll made at the campaign table falls as 3D dice on everyone's screen, landing on the
 * numbers that were actually rolled (the result is decided first, the physics only performs it).
 */
export function TableDice({ campaignId }: { campaignId: string }) {
  const on = useDicePrefs((s) => s.on);
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<DiceBoxLike | null>(null);
  const queue = useRef<RollRow[]>([]);
  const busy = useRef(false);
  const colors = useRef(new Map<string, string | null>());
  const [badge, setBadge] = useState<{ row: RollRow; color: string } | null>(null);
  const [visible, setVisible] = useState(false);

  // player colours, kept fresh
  useEffect(() => {
    const load = () =>
      supabase.from('campaign_members').select('user_id, color').eq('campaign_id', campaignId)
        .then(({ data }) => { colors.current = new Map((data || []).map((m: { user_id: string; color: string | null }) => [m.user_id, m.color])); });
    void load();
    const ch = supabase
      .channel('dice-colors-' + campaignId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_members', filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [campaignId]);

  // new rolls at the table
  useEffect(() => {
    if (!on) return;
    const since = Date.now() - 5000;
    const ch = supabase
      .channel('dice3d-' + campaignId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rolls', filter: `campaign_id=eq.${campaignId}` }, (p) => {
        const row = p.new as RollRow;
        if (row.created_at && Date.parse(row.created_at) < since) return;
        queue.current.push(row);
        // a burst of rolls: keep the latest few so the table never lags behind the chat
        if (queue.current.length > MAX_QUEUE) queue.current.splice(0, queue.current.length - MAX_QUEUE);
        void pump();
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, on]);

  // the physics world is sized at creation: after a resize (phone rotated, window dragged) rebuild it
  // on the next roll instead of stretching the old one, which skews dice size and results
  useEffect(() => {
    if (!on) return;
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (busy.current || !box.current) return;
        box.current = null;
        host.current?.replaceChildren();
      }, 250);
    };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [on]);

  // development only: window.__dice(row) plays a fake roll without a live table
  useEffect(() => {
    if (!import.meta.env.DEV || !on) return;
    (window as unknown as { __dice?: (r: RollRow) => void }).__dice = (r) => { queue.current.push(r); void pump(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // unlock audio on the first tap anywhere (browser rule)
  useEffect(() => {
    const once = () => unlockAudio();
    window.addEventListener('pointerdown', once, { once: true });
    return () => window.removeEventListener('pointerdown', once);
  }, []);

  async function ensureBox() {
    if (box.current || !host.current) return box.current;
    const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');
    const b = new DiceBox('#' + host.current.id, { baseScale: 120, strength: 1.2, sounds: false, shadows: true, light_intensity: 0.85 }) as unknown as DiceBoxLike;
    await b.initialize();
    if (b.desk) b.desk.material.opacity = 0.28; // soft shadows over the page instead of a dark felt
    box.current = b;
    return b;
  }

  async function pump() {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const row = queue.current.shift()!;
        const color = colorFor(row.user_id, colors.current.get(row.user_id));
        const notation = forcedNotation(diceOfRoll(row.formula, row.rolls, row.dropped));
        if (!notation) continue;
        const b = await ensureBox();
        if (!b) break;
        await b.updateConfig({ theme_customColorset: { name: 'p' + color, foreground: inkFor(color), background: color, outline: inkFor(color) === '#ffffff' ? '#000000' : '#ffffff', texture: 'none', material: 'plastic' } });
        b.clearDice();
        setBadge(null);
        setVisible(true);
        if (useDicePrefs.getState().sound) playDiceSound(notation.split('@')[1].split(',').length);
        // never hang the queue if the physics misbehaves
        await Promise.race([b.roll(notation), new Promise((r) => setTimeout(r, 6000))]);
        setBadge({ row, color });
        await new Promise((r) => setTimeout(r, queue.current.length ? 1200 : BADGE_MS));
        setVisible(false);
        await new Promise((r) => setTimeout(r, 350));
        b.clearDice();
        setBadge(null);
      }
    } catch (e) {
      console.warn('dados 3D:', e);
    } finally {
      busy.current = false;
    }
  }

  if (!on) return null;
  return (
    <>
      <div id={'dice3d-' + campaignId} ref={host} className={'dice3d' + (visible ? ' show' : '')} aria-hidden />
      {badge && (
        <div className={'dice3d-badge' + (badge.row.kind === 'crit' ? ' crit' : badge.row.kind === 'fumble' ? ' fumble' : '')} style={{ borderColor: badge.color }}>
          <span className="who" style={{ color: badge.color }}>{badge.row.author}</span>
          <span className="what">{badge.row.label}</span>
          <b>{badge.row.total}</b>
        </div>
      )}
    </>
  );
}

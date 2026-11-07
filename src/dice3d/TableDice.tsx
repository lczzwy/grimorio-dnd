import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Box, ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../cloud/client';
import { colorFor } from '../cloud/chatLogic';
import type { RollRow } from '../cloud/rollRow';
import { diceOfRoll, forcedNotation, inkFor } from './notation';
import { playDiceSound, unlockAudio } from './sound';
import { useReveal } from './reveal';

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

interface DicePrefs {
  on: boolean;
  sound: boolean;
  trayOpen: boolean;
  toggle: () => void;
  toggleSound: () => void;
  toggleTray: () => void;
}
export const useDicePrefs = create<DicePrefs>((set, get) => ({
  on: read('dice3d', true),
  sound: read('dice3d-sound', true),
  trayOpen: read('dice3d-tray', true),
  toggle: () => { const on = !get().on; write('dice3d', on); set({ on }); },
  toggleSound: () => { const sound = !get().sound; write('dice3d-sound', sound); if (sound) unlockAudio(); set({ sound }); },
  toggleTray: () => { const trayOpen = !get().trayOpen; write('dice3d-tray', trayOpen); set({ trayOpen }); },
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
  desk?: { material: { opacity: number } };
}

/* After the dice settle, turn each one in place so its result face looks straight at the camera.
   A die resting near the edge of a wide table is seen at an angle, and its top face can read as
   the neighbouring number; this makes every result read flat, as if it stopped mid-table.
   Works on the library's three.js objects without importing three (classes come from the meshes). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
function faceCamera(b: DiceBoxLike, ms = 260): Promise<void> {
  const box = b as Any;
  const dice: Any[] = box.diceList || [];
  const cam = box.camera;
  if (!cam || !dice.length) return Promise.resolve();
  const moves = dice.map((d) => {
    const V = d.position.constructor;
    const Q = d.quaternion.constructor;
    const normals = d.geometry.getAttribute('normal').array as ArrayLike<number>;
    // same rule the library uses to read a die: the face whose normal is closest to world up
    // (a d4 is read by the face lying on the table, its top corner pointing up)
    const up = new V(0, 0, d.shape === 'd4' ? -1 : 1);
    let best: Any = null;
    let bestAngle = Infinity;
    d.geometry.groups.forEach((g: Any, i: number) => {
      if (g.materialIndex === 0) return;
      const n = new V(normals[i * 9], normals[i * 9 + 1], normals[i * 9 + 2]).applyQuaternion(d.quaternion);
      const a = n.angleTo(up);
      if (a < bestAngle) { bestAngle = a; best = n; }
    });
    if (!best) return null;
    const toCam = cam.position.clone().sub(d.position).normalize();
    const target = d.shape === 'd4' ? toCam.negate() : toCam;
    const turn = new Q().setFromUnitVectors(best.normalize(), target);
    return { d, from: d.quaternion.clone(), to: new Q().multiplyQuaternions(turn, d.quaternion) };
  }).filter(Boolean) as { d: Any; from: Any; to: Any }[];
  return new Promise((resolve) => {
    const t0 = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      for (const m of moves) m.d.quaternion.copy(m.to);
      box.renderer.render(box.scene, cam);
      resolve();
    };
    const step = () => {
      if (finished) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      for (const m of moves) m.d.quaternion.copy(m.from).slerp(m.to, e);
      box.renderer.render(box.scene, cam);
      if (k < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
    // a background tab pauses animation frames: land on the final pose anyway
    setTimeout(finish, ms + 150);
  });
}

const BADGE_MS = 2600;
/** how long settled dice stay on the felt before dissolving */
const LINGER_MS = 1500;
/** length of the dissolve (matches .dice-layer.fading in diceboard.css) */
const FADE_MS = 650;
/** rolls thrown at the same time on the tray; each has its own physics world, so they never
 *  knock each other off their predetermined faces */
const TRAY_LAYERS = 3;
const MAX_QUEUE = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Layer { box: DiceBoxLike | null; busy: boolean }

/**
 * Every roll made at the campaign table is thrown as 3D dice, landing on the numbers that were
 * actually rolled (the result is decided first, the physics only performs it).
 * - "tray": inside a framed dice table on the page. Up to three rolls tumble at once, the chat
 *   shows each roll the moment its dice settle, and the dice dissolve a moment later.
 * - "overlay": over the whole screen with a result badge (a sheet opened on its own).
 */
export function TableDice({ campaignId, variant = 'overlay' }: { campaignId: string; variant?: 'tray' | 'overlay' }) {
  const on = useDicePrefs((s) => s.on);
  const trayOpen = useDicePrefs((s) => s.trayOpen);
  const toggleTray = useDicePrefs((s) => s.toggleTray);
  const tray = variant === 'tray';
  const live = on && (!tray || trayOpen);
  const count = tray ? TRAY_LAYERS : 1;
  const host = useRef<HTMLDivElement>(null);
  const layers = useRef<Layer[]>(Array.from({ length: count }, () => ({ box: null, busy: false })));
  const queue = useRef<RollRow[]>([]);
  const colors = useRef(new Map<string, string | null>());
  const [badge, setBadge] = useState<{ row: RollRow; color: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState<boolean[]>(() => Array(count).fill(false));
  const [last, setLast] = useState<{ row: RollRow; color: string } | null>(null);
  const layerId = (i: number) => `dice3d-${campaignId}-${variant}-${i}`;
  const setFade = (i: number, v: boolean) => setFading((f) => f.map((x, j) => (j === i ? v : x)));

  // the chat waits for these dice only while a tray is actually animating
  useEffect(() => {
    if (!tray || !live) return;
    useReveal.getState().setActive(true);
    return () => useReveal.getState().setActive(false);
  }, [tray, live]);

  // player colours, kept fresh
  useEffect(() => {
    const load = () =>
      supabase.from('campaign_members').select('user_id, color').eq('campaign_id', campaignId)
        .then(({ data }) => { colors.current = new Map((data || []).map((m: { user_id: string; color: string | null }) => [m.user_id, m.color])); });
    void load();
    const ch = supabase
      .channel('dice-colors-' + campaignId + variant)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_members', filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [campaignId, variant]);

  const enqueue = (row: RollRow) => {
    queue.current.push(row);
    // a burst of rolls: keep the latest few so the table never lags behind; release the skipped ones
    while (queue.current.length > MAX_QUEUE) {
      const skipped = queue.current.shift()!;
      if (skipped.id) useReveal.getState().reveal(skipped.id);
    }
    pump();
  };

  // new rolls at the table
  useEffect(() => {
    if (!live) return;
    const since = Date.now() - 5000;
    const ch = supabase
      .channel('dice3d-' + campaignId + variant)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rolls', filter: `campaign_id=eq.${campaignId}` }, (p) => {
        const row = p.new as RollRow;
        if (row.created_at && Date.parse(row.created_at) < since) return;
        enqueue(row);
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, live, variant]);

  // the physics worlds are sized at creation: when the table changes size (window dragged, phone
  // rotated) rebuild them on the next roll instead of stretching them, which skews dice and results
  useEffect(() => {
    if (!live) return;
    let t: ReturnType<typeof setTimeout>;
    const measure = () => (host.current ? `${host.current.clientWidth}x${host.current.clientHeight}` : '');
    let size = measure();
    const rebuild = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const now = measure();
        if (now === size) return;
        size = now;
        layers.current.forEach((l, i) => {
          if (l.busy || !l.box) return;
          l.box = null;
          document.getElementById(layerId(i))?.replaceChildren();
        });
      }, 250);
    };
    const ro = new ResizeObserver(rebuild);
    if (host.current) ro.observe(host.current);
    window.addEventListener('resize', rebuild);
    return () => { clearTimeout(t); ro.disconnect(); window.removeEventListener('resize', rebuild); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // a collapsed tray loses its canvases: start fresh when it opens again
  useEffect(() => {
    if (!live) layers.current.forEach((l) => { l.box = null; l.busy = false; });
  }, [live]);

  // development only: window.__dice(row) plays a fake roll without a live table
  useEffect(() => {
    if (!import.meta.env.DEV || !live) return;
    (window as unknown as { __dice?: (r: RollRow) => void }).__dice = (r) => { if (r.id) useReveal.getState().hide(r.id); enqueue(r); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // unlock audio on the first tap anywhere (browser rule)
  useEffect(() => {
    const once = () => unlockAudio();
    window.addEventListener('pointerdown', once, { once: true });
    return () => window.removeEventListener('pointerdown', once);
  }, []);

  async function ensureBox(i: number) {
    const layer = layers.current[i];
    if (layer.box) return layer.box;
    if (!document.getElementById(layerId(i))) return null;
    const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');
    const b = new DiceBox('#' + layerId(i), { baseScale: tray ? 62 : 120, strength: tray ? 1.25 : 1.2, sounds: false, shadows: true, light_intensity: 0.85 }) as unknown as DiceBoxLike;
    await b.initialize();
    if (b.desk) b.desk.material.opacity = tray ? 0.4 : 0.28; // soft shadows on the felt / over the page
    layer.box = b;
    return b;
  }

  /** Starts queued rolls on every free layer. */
  function pump() {
    layers.current.forEach((layer, i) => {
      if (layer.busy || !queue.current.length) return;
      layer.busy = true;
      void play(i, queue.current.shift()!).finally(() => {
        layer.busy = false;
        pump();
      });
    });
  }

  async function play(i: number, row: RollRow) {
    const done = () => { if (row.id) useReveal.getState().reveal(row.id); };
    try {
      const color = colorFor(row.user_id, colors.current.get(row.user_id));
      const notation = forcedNotation(diceOfRoll(row.formula, row.rolls, row.dropped));
      const b = notation ? await ensureBox(i) : null;
      if (!notation || !b) return done();
      await b.updateConfig({ theme_customColorset: { name: 'p' + color, foreground: inkFor(color), background: color, outline: inkFor(color) === '#ffffff' ? '#000000' : '#ffffff', texture: 'none', material: 'plastic' } });
      b.clearDice();
      setFade(i, false);
      if (!tray) { setBadge(null); setVisible(true); }
      if (useDicePrefs.getState().sound) playDiceSound(notation.split('@')[1].split(',').length);
      // never hang the table if the physics misbehaves
      await Promise.race([b.roll(notation), sleep(6000)]);
      try { await faceCamera(b); } catch { /* cosmetic only */ }
      // the dice have settled: now the chat shows the roll
      done();
      if (tray) {
        setLast({ row, color });
        // a moment to read the dice, then they dissolve into the felt
        await sleep(LINGER_MS);
        setFade(i, true);
        await sleep(FADE_MS);
        b.clearDice();
        setFade(i, false);
        return;
      }
      setBadge({ row, color });
      await sleep(queue.current.length ? 1200 : BADGE_MS);
      setVisible(false);
      await sleep(350);
      b.clearDice();
      setBadge(null);
    } catch (e) {
      console.warn('dados 3D:', e);
      done();
    }
  }

  if (!on) return null;

  const layerEls = Array.from({ length: count }, (_, i) => (
    <div key={i} id={layerId(i)} className={'dice-layer' + (fading[i] ? ' fading' : '')} />
  ));

  if (tray) {
    return (
      <section className={'dice-board' + (trayOpen ? '' : ' closed')}>
        <header className="dice-board-head">
          <span className="dice-board-title">Mesa de dados</span>
          {last && trayOpen && (
            <span className="dice-board-last">
              <b style={{ color: last.color }}>{last.row.author}</b> <span className="muted">{last.row.label}</span> <b className="mono">{last.row.total}</b>
            </span>
          )}
          <span className="spacer" />
          <button className="btn ghost sm icon" onClick={toggleTray} title={trayOpen ? 'Recolher a mesa' : 'Abrir a mesa'}>
            {trayOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </header>
        {trayOpen && (
          <div className="dice-board-frame">
            <div className="dice-board-felt">
              <div ref={host} className="dice-board-host" aria-hidden>{layerEls}</div>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <div ref={host} className={'dice3d' + (visible ? ' show' : '')} aria-hidden>{layerEls}</div>
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


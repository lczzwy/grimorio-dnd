import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Box, ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../cloud/client';
import { colorFor } from '../cloud/chatLogic';
import type { RollRow } from '../cloud/rollRow';
import { diceOfRoll, droppedFlags, forcedNotation, inkFor, percentiles, percentileText } from './notation';
import { playCritSound, playDiceSound, playFumbleSound, unlockAudio } from './sound';
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

const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

interface DicePrefs {
  on: boolean;
  sound: boolean;
  trayOpen: boolean;
  toggle: () => void;
  toggleSound: () => void;
  toggleTray: () => void;
}
export const useDicePrefs = create<DicePrefs>((set, get) => ({
  // "reduzir movimento" no sistema desliga os dados 3D por padrão; quem ligar de novo no botão fica com a escolha
  on: read('dice3d', !reducedMotion()),
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
      <button className="btn ghost sm icon" title={sound ? 'Sons da mesa ligados (dados e mensagens)' : 'Sons da mesa desligados'} onClick={toggleSound} disabled={!on}>
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
/**
 * Rotation about the line of sight that turns the number on `group` upright on screen.
 * The number's "up" is read from the face's texture mapping: the 3D direction in which the
 * texture's v coordinate grows (the bitangent of the triangle).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function uprightTwist(d: Any, group: Any, orientation: Any, toCam: Any, cam: Any, V: Any, Q: Any): Any {
  const pos = d.geometry.getAttribute('position');
  const uv = d.geometry.getAttribute('uv');
  if (!pos || !uv || !group) return null;
  const s = group.start;
  const p = [0, 1, 2].map((k) => new V(pos.getX(s + k), pos.getY(s + k), pos.getZ(s + k)));
  const t = [0, 1, 2].map((k) => [uv.getX(s + k), uv.getY(s + k)]);
  const e1 = p[1].clone().sub(p[0]), e2 = p[2].clone().sub(p[0]);
  const du1 = t[1][0] - t[0][0], dv1 = t[1][1] - t[0][1];
  const du2 = t[2][0] - t[0][0], dv2 = t[2][1] - t[0][1];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-9) return null;
  // dP/dv: where the top of the printed number points, in the die's own space
  const textUp = e2.multiplyScalar(du1).sub(e1.multiplyScalar(du2)).divideScalar(det).applyQuaternion(orientation);
  const screenUp = new V(0, 1, 0).applyQuaternion(cam.quaternion);
  const a = textUp.projectOnPlane(toCam).normalize();
  const b = screenUp.projectOnPlane(toCam).normalize();
  if (!a.lengthSq() || !b.lengthSq()) return null;
  const angle = Math.atan2(toCam.dot(new V().crossVectors(a, b)), a.dot(b));
  return new Q().setFromAxisAngle(toCam, angle);
}

/**
 * Resolves when every die is at rest. The library's own "finished" check can miss small dice that
 * are already still, which would hold the result back for seconds; watching the physics bodies
 * directly answers the moment they stop. Then the library's loop is halted so it cannot undo the
 * final upright turn.
 */
function settled(b: DiceBoxLike, maxMs = 7000): Promise<boolean> {
  const box = b as Any;
  return new Promise((resolve) => {
    const t0 = performance.now();
    let calm = 0;
    // the library prepares textures before it throws (slow on the first roll): only a stop after
    // the dice were seen flying counts
    let moved = false;
    const tick = setInterval(() => {
      const dice: Any[] = box.diceList || [];
      if (dice.some((d) => d.body && d.body.velocity.length() > 50)) moved = true;
      const still = moved && dice.length > 0 && dice.every((d) => d.body && d.body.velocity.length() < 3 && d.body.angularVelocity.length() < 0.1);
      calm = still ? calm + 1 : 0;
      const elapsed = performance.now() - t0;
      if (calm >= 2 || elapsed > maxMs) {
        clearInterval(tick);
        box.running = false; // stops animateThrow on its next frame
        box.rolling = false;
        // false: the dice never flew (tab in the background pauses the animation)
        resolve(moved);
      }
    }, 100);
  });
}

/**
 * Copies a die's displayed pose onto its physics body and puts the body to sleep. If the library's
 * loop runs one more frame (a tab coming back from the background resumes it), it copies the body
 * onto the mesh: with the body matching, the die stays exactly as we left it.
 */
function pinBody(d: Any) {
  const body = d.body;
  if (!body) return;
  body.position.set(d.position.x, d.position.y, d.position.z);
  body.quaternion.set(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.mass = 0;
  body.type = 2; // cannon-es STATIC: gravity no longer moves it
  body.updateMassProperties?.();
  body.sleep?.();
}

/** Makes one die glow from within (natural 20 gold, natural 1 red): a flare that settles to a soft glow. */
function glowDie(b: DiceBoxLike, index: number, hex: number, ms = 1100): void {
  const box = b as Any;
  const d = box.diceList?.[index];
  if (!d) return;
  d.material = (Array.isArray(d.material) ? d.material : [d.material]).map((m: Any) => m.clone());
  const mats = d.material.filter((m: Any) => m.emissive);
  mats.forEach((m: Any) => m.emissive.setHex(hex));
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    // quick flare to full, then down to a steady 35%
    const v = k < 0.25 ? k / 0.25 : 1 - 0.65 * ((k - 0.25) / 0.75);
    mats.forEach((m: Any) => { m.emissiveIntensity = 0.9 * v; });
    box.renderer.render(box.scene, box.camera);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => { mats.forEach((m: Any) => { m.emissiveIntensity = 0.9 * 0.35; }); box.renderer.render(box.scene, box.camera); }, ms + 150);
}

/** Gives the tens die of each d100 a golden finish, so it is not mistaken for the units die. */
function tintTens(b: DiceBoxLike, indices: number[]) {
  const box = b as Any;
  for (const i of indices) {
    const d = box.diceList?.[i];
    if (!d || d.userData?.tensTinted) return;
    d.material = (Array.isArray(d.material) ? d.material : [d.material]).map((m: Any) => {
      const c = m.clone();
      c.color?.setHex(0xffe0a0);
      if (c.emissive) { c.emissive.setHex(0x6b4a00); c.emissiveIntensity = 0.55; }
      return c;
    });
    d.userData = { ...(d.userData || {}), tensTinted: true };
  }
}

/** Where a die sits on the layer, in CSS pixels. */
function screenPos(b: DiceBoxLike, index: number): { x: number; y: number } | null {
  const box = b as Any;
  const d = box.diceList?.[index];
  const canvas: HTMLCanvasElement | undefined = box.renderer?.domElement;
  if (!d || !canvas) return null;
  const v = d.position.clone().project(box.camera);
  return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
}

/** Fades and sinks the discarded dice of an advantage/disadvantage roll (flags in library order). */
function dimDropped(b: DiceBoxLike, flags: boolean[], ms = 500): Promise<void> {
  const box = b as Any;
  const dice: Any[] = (box.diceList || []).filter((_: Any, i: number) => flags[i]);
  if (!dice.length) return Promise.resolve();
  const start = dice.map((d) => {
    // materials are shared between dice: give this die its own copies before changing them
    d.material = (Array.isArray(d.material) ? d.material : [d.material]).map((m: Any) => { const c = m.clone(); c.transparent = true; return c; });
    return { d, z: d.position.z, s: d.scale.x };
  });
  return new Promise((resolve) => {
    const t0 = performance.now();
    let finished = false;
    const apply = (k: number) => {
      for (const { d, z, s } of start) {
        for (const m of d.material) m.opacity = 1 - 0.65 * k;
        d.position.z = z - k * s * 6;
        d.scale.setScalar(s * (1 - 0.15 * k));
      }
      box.renderer.render(box.scene, box.camera);
    };
    const finish = () => { if (finished) return; finished = true; apply(1); start.forEach(({ d }) => pinBody(d)); resolve(); };
    const step = () => {
      if (finished) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      apply(1 - Math.pow(1 - k, 2));
      if (k < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, ms + 150);
  });
}

function faceCamera(b: DiceBoxLike, ms = 420): Promise<void> {
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
    let bestGroup: Any = null;
    let bestAngle = Infinity;
    d.geometry.groups.forEach((g: Any, i: number) => {
      if (g.materialIndex === 0) return;
      const n = new V(normals[i * 9], normals[i * 9 + 1], normals[i * 9 + 2]).applyQuaternion(d.quaternion);
      const a = n.angleTo(up);
      if (a < bestAngle) { bestAngle = a; best = n; bestGroup = g; }
    });
    if (!best) return null;
    const toCam = cam.position.clone().sub(d.position).normalize();
    const target = d.shape === 'd4' ? toCam.negate() : toCam;
    const turn = new Q().setFromUnitVectors(best.normalize(), target);
    let to = new Q().multiplyQuaternions(turn, d.quaternion);
    // then spin around the line of sight so the number stands upright on screen
    // (a d4 shows its numbers on the corners, so it has no single "up" to align)
    if (d.shape !== 'd4') {
      const twist = uprightTwist(d, bestGroup, to, toCam, cam, V, Q);
      if (twist) to = new Q().multiplyQuaternions(twist, to);
    }
    return { d, from: d.quaternion.clone(), to };
  }).filter(Boolean) as { d: Any; from: Any; to: Any }[];
  return new Promise((resolve) => {
    const t0 = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      for (const m of moves) {
        m.d.quaternion.copy(m.to);
        pinBody(m.d);
      }
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

interface Layer { box: DiceBoxLike | null; busy: boolean; loading?: Promise<DiceBoxLike | null> }

/**
 * Every roll made at the campaign table is thrown as 3D dice, landing on the numbers that were
 * actually rolled (the result is decided first, the physics only performs it).
 * - "tray": inside a framed dice table on the page. Up to three rolls tumble at once, the chat
 *   shows each roll the moment its dice settle, and the dice dissolve a moment later.
 * - "overlay": over the whole screen with a result badge (a sheet opened on its own).
 */
export function TableDice({ campaignId, variant = 'overlay', background, headerExtra, title = 'Mesa de dados' }: {
  campaignId: string;
  variant?: 'tray' | 'overlay';
  /** drawn under the dice in the tray (the battle map); the felt shows when there is none */
  background?: ReactNode;
  headerExtra?: ReactNode;
  title?: string;
}) {
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
  const names = useRef(new Map<string, string>());
  const [effect, setEffect] = useState<(null | 'crit' | 'fumble')[]>(() => Array(count).fill(null));
  const [labels, setLabels] = useState<{ x: number; y: number; text: string }[][]>(() => Array.from({ length: count }, () => []));
  const setLayerLabels = (i: number, v: { x: number; y: number; text: string }[]) => setLabels((l) => l.map((x, j) => (j === i ? v : x)));
  const [badge, setBadge] = useState<{ row: RollRow; color: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState<boolean[]>(() => Array(count).fill(false));
  const [last, setLast] = useState<{ row: RollRow; color: string } | null>(null);
  const layerId = (i: number) => `dice3d-${campaignId}-${variant}-${i}`;
  const setFade = (i: number, v: boolean) => setFading((f) => f.map((x, j) => (j === i ? v : x)));
  const setFx = (i: number, v: null | 'crit' | 'fumble') => setEffect((f) => f.map((x, j) => (j === i ? v : x)));
  /** the character's name when the player has one at this table, else the account name */
  const who = (row: RollRow) => names.current.get(row.user_id) || row.author;

  // the chat waits for these dice only while a tray is actually animating
  useEffect(() => {
    if (!tray || !live) return;
    useReveal.getState().setActive(true);
    return () => useReveal.getState().setActive(false);
  }, [tray, live]);

  // player colours and character names, kept fresh
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('campaign_members').select('user_id, color, character_id').eq('campaign_id', campaignId);
      const rows = (data || []) as { user_id: string; color: string | null; character_id: string | null }[];
      colors.current = new Map(rows.map((m) => [m.user_id, m.color]));
      const ids = rows.map((m) => m.character_id).filter((x): x is string => !!x);
      if (!ids.length) return void (names.current = new Map());
      const { data: chars } = await supabase.from('characters').select('id, name').in('id', ids);
      const byId = new Map(((chars || []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
      names.current = new Map(rows.filter((m) => m.character_id && byId.get(m.character_id)).map((m) => [m.user_id, byId.get(m.character_id!)!]));
    };
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
    if (!live) layers.current.forEach((l) => { l.box = null; l.busy = false; l.loading = undefined; });
  }, [live]);

  // development only: window.__dice(row) plays a fake roll without a live table
  useEffect(() => {
    if (!import.meta.env.DEV || !live) return;
    (window as unknown as { __dice?: (r: RollRow) => void }).__dice = (r) => { if (r.id) useReveal.getState().hide(r.id); enqueue(r); };
    (window as unknown as { __layers?: Layer[] }).__layers = layers.current;
    (window as unknown as { __faceCamera?: typeof faceCamera }).__faceCamera = faceCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // unlock audio on the first tap anywhere (browser rule)
  useEffect(() => {
    const once = () => unlockAudio();
    window.addEventListener('pointerdown', once, { once: true });
    return () => window.removeEventListener('pointerdown', once);
  }, []);

  // build the 3D tables while the page is idle, so the first roll of the session is not the slow one
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => { layers.current.forEach((_, i) => { void ensureBox(i).catch(() => undefined); }); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  function ensureBox(i: number): Promise<DiceBoxLike | null> {
    const layer = layers.current[i];
    if (layer.box) return Promise.resolve(layer.box);
    if (layer.loading) return layer.loading; // a preload already under way: share it
    if (!document.getElementById(layerId(i))) return Promise.resolve(null);
    layer.loading = (async () => {
      const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');
      const b = new DiceBox('#' + layerId(i), { baseScale: tray ? 62 : 120, strength: tray ? 1.25 : 1.2, sounds: false, shadows: true, light_intensity: 0.85 }) as unknown as DiceBoxLike;
      await b.initialize();
      if (b.desk) b.desk.material.opacity = tray ? 0.4 : 0.28; // soft shadows on the felt / over the page
      layer.box = b;
      return b;
    })().finally(() => { layer.loading = undefined; });
    return layer.loading;
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
      // a hidden tab cannot animate: skip the dice, the roll joins the chat right away
      if (document.hidden) return done();
      const color = colorFor(row.user_id, colors.current.get(row.user_id));
      const notation = forcedNotation(diceOfRoll(row.formula, row.rolls, row.dropped));
      const b = notation ? await ensureBox(i) : null;
      if (!notation || !b) return done();
      await b.updateConfig({ theme_customColorset: { name: 'p' + color, foreground: inkFor(color), background: color, outline: inkFor(color) === '#ffffff' ? '#000000' : '#ffffff', texture: 'none', material: 'plastic' } });
      b.clearDice();
      setFade(i, false);
      if (!tray) { setBadge(null); setVisible(true); }
      if (useDicePrefs.getState().sound) playDiceSound(notation.split('@')[1].split(',').length);
      // the roll's own promise can lag behind the dice; whichever says "stopped" first wins
      void b.roll(notation).catch(() => undefined);
      const dice = diceOfRoll(row.formula, row.rolls, row.dropped);
      const pct = percentiles(dice);
      if (pct.length) {
        // the library builds its dice a moment after roll(): tint the tens dice as soon as they exist
        const want = droppedFlags(dice).length;
        const t0 = performance.now();
        const wait = setInterval(() => {
          const n = ((b as Any).diceList || []).length;
          if (n >= want) { clearInterval(wait); try { tintTens(b, pct.map((p) => p.tensIndex)); } catch { /* cosmetic only */ } }
          else if (performance.now() - t0 > 4000) clearInterval(wait);
        }, 30);
      }
      const animated = await settled(b);
      if (!animated) {
        // nobody saw them fly (background tab): no frozen dice, the roll goes straight to the chat
        b.clearDice();
        done();
        return;
      }
      try { await faceCamera(b); } catch { /* cosmetic only */ }
      // d100: "70 + 7 = 77" over each tens/units pair
      if (pct.length) {
        const marks = pct.map((p) => {
          const a = screenPos(b, p.tensIndex), c = screenPos(b, p.unitsIndex);
          return a && c ? { x: (a.x + c.x) / 2, y: Math.min(a.y, c.y), text: percentileText(p) } : null;
        }).filter((m): m is { x: number; y: number; text: string } => !!m);
        setLayerLabels(i, marks);
      }
      // advantage/disadvantage: the discarded d20 fades and sinks
      const flags = droppedFlags(dice);
      if (flags.some(Boolean)) { try { await dimDropped(b, flags); } catch { /* cosmetic only */ } }
      // natural 20 / natural 1
      const fx = row.kind === 'crit' ? 'crit' : row.kind === 'fumble' ? 'fumble' : null;
      if (fx) {
        // the natural d20 is the first die of the roll
        try { glowDie(b, 0, fx === 'crit' ? 0xffc54a : 0xd02818); } catch { /* cosmetic only */ }
        setFx(i, fx);
        if (useDicePrefs.getState().sound) (fx === 'crit' ? playCritSound : playFumbleSound)();
      }
      // the dice have settled: now the chat shows the roll
      done();
      if (tray) {
        setLast({ row, color });
        // a moment to read the dice, then they dissolve into the felt
        await sleep(import.meta.env.DEV ? ((window as unknown as { __linger?: number }).__linger ?? LINGER_MS) : LINGER_MS);
        setFade(i, true);
        await sleep(FADE_MS);
        b.clearDice();
        setFade(i, false);
        setFx(i, null);
        setLayerLabels(i, []);
        return;
      }
      setBadge({ row, color });
      await sleep(queue.current.length ? 1200 : BADGE_MS);
      setVisible(false);
      await sleep(350);
      b.clearDice();
      setBadge(null);
      setFx(i, null);
      setLayerLabels(i, []);
    } catch (e) {
      console.warn('dados 3D:', e);
      done();
    }
  }

  if (!on && !(tray && background)) return null;

  const layerEls = Array.from({ length: count }, (_, i) => (
    <div key={i} className={'dice-layer-wrap' + (fading[i] ? ' fading' : '')}>
      <div id={layerId(i)} className={'dice-layer' + (fading[i] ? ' fading' : '') + (effect[i] ? ' ' + effect[i] : '')} />
      {labels[i].map((m, k) => <span key={k} className="pct-label" style={{ left: m.x, top: m.y }}>{m.text}</span>)}
    </div>
  ));

  if (tray) {
    return (
      <section className={'dice-board' + (trayOpen ? '' : ' closed') + (background ? ' has-map' : '')}>
        <header className="dice-board-head">
          <span className="dice-board-title">{title}</span>
          {last && trayOpen && (
            <span className="dice-board-last">
              <b style={{ color: last.color }}>{who(last.row)}</b> <span className="muted">rolou {last.row.label}</span> <b className={'mono' + (last.row.kind === 'crit' ? ' crit' : last.row.kind === 'fumble' ? ' fumble' : '')}>{last.row.total}</b>
            </span>
          )}
          <span className="spacer" />
          {headerExtra}
          <button className="btn ghost sm icon dice-board-collapse" onClick={toggleTray} title={trayOpen ? 'Recolher a mesa' : 'Abrir a mesa'}>
            {trayOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </header>
        {trayOpen && (
          <div className="dice-board-frame">
            <div className={'dice-board-felt' + (background ? ' has-map' : '')}>
              {background}
              {on && <div ref={host} className="dice-board-host" aria-hidden>{layerEls}</div>}
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
          <span className="who" style={{ color: badge.color }}>{who(badge.row)}</span>
          <span className="what">{badge.row.label}</span>
          <b>{badge.row.total}</b>
        </div>
      )}
    </>
  );
}


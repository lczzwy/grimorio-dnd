import type { Character } from '../data/types';

/**
 * Debounced, retrying upload queue: one pending slot per character (latest state wins).
 * Network failures back off 1s, 2s, 4s… up to 30s and never drop the newest edit.
 */
export class Uploader {
  private queue = new Map<string, Character>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 0;
  private running = false;

  private send: (c: Character) => Promise<void>;
  private delay: number;

  constructor(send: (c: Character) => Promise<void>, delay = 800) {
    this.send = send;
    this.delay = delay;
  }

  /** Whether an edit of this character is still waiting to be sent. */
  has(id: string) {
    return this.queue.has(id);
  }

  schedule(c: Character) {
    this.queue.set(c.id, c);
    if (!this.backoff) this.arm(this.delay);
  }

  pending() {
    return this.queue.size;
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.run();
  }

  private arm(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      for (const [id, c] of [...this.queue]) {
        try {
          await this.send(c);
          // only clear if no newer edit arrived while sending
          if (this.queue.get(id) === c) this.queue.delete(id);
          this.backoff = 0;
        } catch {
          this.backoff = this.backoff ? Math.min(30000, this.backoff * 2) : 1000;
          this.arm(this.backoff);
          return;
        }
      }
      if (this.queue.size) this.arm(this.delay);
    } finally {
      this.running = false;
    }
  }
}

/**
 * Fields the GM changes on a player's sheet during play (gm_apply). When both sides changed one of
 * these since the last sync, the server copy wins: that is where the GM's damage lives.
 */
const TABLE_FIELDS = new Set(['hp.current', 'hp.temp', 'conditions', 'deathSaves', 'concentration']);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge of a character: `base` is the last copy both sides agreed on (may be unknown).
 * Field by field: changed on one side only → that side; changed on both → server for table fields
 * (HP, conditions, death saves, concentration), local for everything else. Without a base, table
 * fields come from the server and the rest from this device.
 */
export function mergeCharacter(base: Character | undefined, local: Character, remote: Character): Character {
  const out: Record<string, unknown> = {};
  const pick = (path: string, b: unknown, l: unknown, r: unknown) => {
    if (base === undefined) return TABLE_FIELDS.has(path) ? r : l;
    if (same(l, b)) return r;
    if (same(r, b)) return l;
    return TABLE_FIELDS.has(path) ? r : l;
  };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'cloud' || k === 'serverVersion' || k === 'syncedAt') continue;
    const b = (base as unknown as Record<string, unknown> | undefined)?.[k];
    const l = (local as unknown as Record<string, unknown>)[k];
    const r = (remote as unknown as Record<string, unknown>)[k];
    if (k === 'hp' && l && r) {
      const hp: Record<string, unknown> = {};
      for (const hk of new Set([...Object.keys(l as object), ...Object.keys(r as object)])) {
        hp[hk] = pick('hp.' + hk, (b as Record<string, unknown> | undefined)?.[hk], (l as Record<string, unknown>)[hk], (r as Record<string, unknown>)[hk]);
      }
      out.hp = hp;
      continue;
    }
    const v = pick(k, b, l, r);
    if (v !== undefined) out[k] = v;
  }
  return { ...(out as unknown as Character), updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0), cloud: true };
}

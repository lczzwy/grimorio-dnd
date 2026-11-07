import type { Character } from '../data/types';

/**
 * Decides what to do with a character copy received from the cloud.
 * Returns the copy to store locally, or null to keep the local one (it is as new or newer).
 */
export function mergeRemote(local: Character | undefined, remote: Character): Character | null {
  if (local && (local.updatedAt || 0) >= (remote.updatedAt || 0)) return null;
  return { ...remote, cloud: true };
}

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

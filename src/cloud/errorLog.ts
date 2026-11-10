import { supabase } from './client';

const MAX_PER_SESSION = 20;
const sent = new Set<string>();

/** Errors that are noise, not bugs of the site (browser quirks, extensions, the network). */
export function isNoise(message: string): boolean {
  return /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|Failed to fetch|NetworkError|Load failed|AbortError/i.test(message);
}

/** The row that goes to client_errors: trimmed to the limits the table accepts. */
export function errorRow(message: string, stack: string | undefined, url: string, agent: string) {
  return {
    message: message.slice(0, 2000) || 'erro sem mensagem',
    stack: stack ? stack.slice(0, 8000) : null,
    url: url.slice(0, 500),
    agent: agent.slice(0, 300),
  };
}

/**
 * Records an error that happened on someone's screen in the client_errors table, so problems
 * during a session do not go unnoticed. Each different message is sent once, at most 20 per visit.
 */
export function reportError(err: unknown) {
  if (import.meta.env.DEV) return;
  const e = err instanceof Error ? err : new Error(String(err));
  if (isNoise(e.message) || sent.has(e.message) || sent.size >= MAX_PER_SESSION) return;
  sent.add(e.message);
  void supabase.from('client_errors').insert(errorRow(e.message, e.stack, window.location.hash, navigator.userAgent)).then(() => undefined, () => undefined);
}

let wired = false;
/** Catches errors nobody handled. Call once at startup. */
export function initErrorLog() {
  if (wired) return;
  wired = true;
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
}

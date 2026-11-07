import { useEffect, useRef, useState } from 'react';
import { supabase } from './client';

const SHOW_MS = 3500; // how long a "typing" signal lasts without a new one
const PING_MS = 2000; // at most one signal every 2 s per person

/**
 * "Fulano está digitando…": a lightweight realtime broadcast (nothing is stored).
 * Returns who is typing right now (not counting yourself), plus functions to call while typing
 * and when the message is sent.
 */
export function useTyping(campaignId: string, uid: string, myName: string) {
  const [typers, setTypers] = useState<string[]>([]);
  const until = useRef(new Map<string, { name: string; at: number }>());
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastPing = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      for (const [k, v] of until.current) if (v.at < now) until.current.delete(k);
      const names = [...until.current.values()].map((v) => v.name);
      setTypers((old) => (old.join('|') === names.join('|') ? old : names));
    };
    const ch = supabase
      .channel('typing-' + campaignId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { uid: string; name: string; stop?: boolean };
        if (!p?.uid || p.uid === uid) return;
        if (p.stop) until.current.delete(p.uid);
        else until.current.set(p.uid, { name: p.name || 'Alguém', at: Date.now() + SHOW_MS });
        refresh();
      })
      .subscribe();
    channel.current = ch;
    const tick = setInterval(refresh, 1000);
    return () => {
      clearInterval(tick);
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [campaignId, uid]);

  const send = (stop: boolean) => {
    void channel.current?.send({ type: 'broadcast', event: 'typing', payload: { uid, name: myName, stop } });
  };
  return {
    typers,
    /** call on every keystroke; sends at most one signal every 2 s */
    typing: () => {
      const now = Date.now();
      if (now - lastPing.current < PING_MS) return;
      lastPing.current = now;
      send(false);
    },
    /** call when the message is sent or the box is emptied */
    stopped: () => {
      lastPing.current = 0;
      send(true);
    },
  };
}

/** "Ana está digitando…", "Ana e Bruno estão digitando…", "3 pessoas estão digitando…" */
export function typingText(names: string[]) {
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} está digitando…`;
  if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando…`;
  return `${names.length} pessoas estão digitando…`;
}

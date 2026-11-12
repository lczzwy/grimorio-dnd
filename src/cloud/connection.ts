import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase } from './client';
import { resetShared } from './shared';
import { CONN_START, connStep, type ConnState } from './connectionLogic';

/** `epoch` goes up each time the connection comes back: the campaign page remounts and reloads. */
export const useConnection = create<{ down: boolean; epoch: number; back: number }>(() => ({ down: false, epoch: 0, back: 0 }));

/**
 * Watches the live connection while a campaign is open (internet gone, Wi-Fi switched, laptop
 * woke up). The realtime client reconnects by itself; this shows it and, once back, reloads the
 * table, since whatever happened in between (damage, turns, messages) never arrived.
 */
export function useConnectionWatch(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let s: ConnState = CONN_START;
    // the socket opens a moment after the page; don't count the first seconds as a drop
    const since = Date.now();
    const check = () => {
      if (Date.now() - since < 4000) return;
      const ok = navigator.onLine && supabase.realtime.isConnected();
      const r = connStep(s, ok, Date.now());
      s = r.state;
      if (r.recovered) {
        resetShared();
        useConnection.setState((x) => ({ down: false, epoch: x.epoch + 1, back: Date.now() }));
      } else if (s.down !== useConnection.getState().down) {
        useConnection.setState({ down: s.down });
      }
    };
    const t = window.setInterval(check, 1000);
    // back online: try right away instead of waiting for the client's next retry
    const online = () => { if (!supabase.realtime.isConnected()) supabase.realtime.connect(); };
    window.addEventListener('online', online);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('online', online);
      useConnection.setState({ down: false });
    };
  }, [on]);
}

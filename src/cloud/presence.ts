import { useEffect, useState } from 'react';
import { supabase } from './client';

/**
 * Who has the campaign open right now (like the green dot in Discord). Uses realtime presence:
 * nothing is stored, and a closed tab disappears by itself after a few seconds.
 */
export function useOnline(campaignId: string, uid: string) {
  const [online, setOnline] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ch = supabase.channel('online-' + campaignId, { config: { presence: { key: uid } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe((status) => { if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() }); });
    return () => { void supabase.removeChannel(ch); };
  }, [campaignId, uid]);
  return online;
}

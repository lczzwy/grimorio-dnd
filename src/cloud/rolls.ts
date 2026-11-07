import { useEffect, useState } from 'react';
import { onTableRoll, useDice } from '../store';
import { supabase } from './client';
import { useAuth } from './auth';
import { useFlash } from '../ui/ui';
import { toRollRow, type RollRow } from './rollRow';

let wired = false;
/** Sends every roll made at an active campaign table to its feed. Call once at startup. */
export function initRollPublishing() {
  if (wired) return;
  wired = true;
  onTableRoll((entry, table) => {
    const { user, profile } = useAuth.getState();
    if (!user) return;
    void supabase.from('rolls').insert(toRollRow(entry, table.campaignId, user.id, profile?.display_name || 'Jogador', table.hidden)).then(({ error }) => {
      // surface the reason instead of failing silently
      if (error) useFlash.getState().show('A rolagem não chegou à mesa: ' + error.message);
    });
  });
}

/** Points the dice at a campaign while the component is mounted. */
export function useTable(campaignId: string | undefined, isGm = false) {
  useEffect(() => {
    if (!campaignId) return;
    // the GM rolls hidden by default (monster attacks); players roll in the open
    useDice.getState().setTable({ campaignId, hidden: isGm, isGm });
    return () => useDice.getState().setTable(undefined);
  }, [campaignId, isGm]);
}

/** Campaign of the signed-in user where this character is in play, if any. */
export function useCharacterCampaign(characterId: string | undefined, cloud: boolean | undefined) {
  const uid = useAuth((s) => s.user?.id);
  const [campaignId, setCampaignId] = useState<string>();
  useEffect(() => {
    if (!uid || !characterId || !cloud) return setCampaignId(undefined);
    supabase.from('campaign_members').select('campaign_id').eq('user_id', uid).eq('character_id', characterId).limit(1)
      .then(({ data }) => setCampaignId(data?.[0]?.campaign_id));
  }, [uid, characterId, cloud]);
  return campaignId;
}

/** Last 200 rolls of the campaign, live. */
export function useRollFeed(campaignId: string) {
  const [rows, setRows] = useState<RollRow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      supabase.from('rolls').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(200)
        .then(({ data }) => alive && setRows((data as RollRow[]) || []));
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const poll = setInterval(() => void load(), 15000);
    const ch = supabase
      .channel('rolls-' + campaignId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rolls', filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe();
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [campaignId]);
  return rows;
}

export async function revealRoll(id: string) {
  const { error } = await supabase.from('rolls').update({ hidden: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

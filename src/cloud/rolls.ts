import { useEffect, useState } from 'react';
import { setServerRoller, useDice, type ServerRoll } from '../store';
import { supabase } from './client';
import { useAuth } from './auth';
import { useFlash } from '../ui/ui';
import type { RollRow } from './rollRow';

let wired = false;
/** Plain-language reason for a failed roll. */
export function rollErrorPt(message: string) {
  if (/bad_formula/.test(message)) return 'Fórmula de dados inválida.';
  if (/forbidden/.test(message)) return 'Você não faz parte desta mesa.';
  return 'A rolagem não chegou à mesa. Confira a internet e tente de novo.';
}

/**
 * At a campaign table the dice are drawn by the server (roll_dice): the site sends only the formula,
 * the database draws, records and spreads the roll. Call once at startup.
 */
export function initRollPublishing() {
  if (wired) return;
  wired = true;
  setServerRoller(async (table, req) => {
    if (!useAuth.getState().user) {
      useFlash.getState().show('Entre na sua conta para rolar na mesa.');
      throw new Error('not_authenticated');
    }
    const { data, error } = await supabase.rpc('roll_dice', {
      campaign: table.campaignId,
      formula: req.formula,
      label: req.label,
      mode: req.mode,
      crit: req.crit,
      hidden: table.hidden,
    });
    if (error || !data) {
      const msg = error?.message || 'roll_failed';
      useFlash.getState().show(rollErrorPt(msg));
      throw new Error(msg);
    }
    return data as ServerRoll;
  });
}

/** Points the dice at a campaign while the component is mounted. */
export function useTable(campaignId: string | undefined, isGm = false) {
  useEffect(() => {
    if (!campaignId) return;
    // everyone rolls in the open; the GM can still hide a single roll from the dice tray
    useDice.getState().setTable({ campaignId, hidden: false, isGm });
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
    const poll = setInterval(() => void load(), 60000);
    const ch = supabase
      .channel('rolls-' + campaignId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rolls', filter: `campaign_id=eq.${campaignId}` }, (p) => {
        // a new roll goes on top; anything else (a revealed roll) reloads
        if (p.eventType === 'INSERT') setRows((r) => (r.some((x) => x.id === (p.new as RollRow).id) ? r : [p.new as RollRow, ...r].slice(0, 200)));
        else void load();
      })
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
  const { error } = await supabase.rpc('reveal_roll', { roll: id });
  if (error) throw new Error(error.message);
}

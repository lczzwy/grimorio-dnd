import { useEffect, useMemo, useState } from 'react';
import type { Edition, SrdData } from '../data/types';
import { useSrd } from '../data/srd';
import { HOMEBREW_KINDS, sanitizeHomebrew, type Homebrew, type HomebrewKind, type SanitizeResult } from '../data/homebrew';
import { supabase } from './client';
import { campaignErrorPt } from './campaignText';

interface Row { kind: HomebrewKind; id: string; item: { id: string; name: string } }

const toHomebrew = (rows: Row[]): Homebrew => {
  const out: Record<string, unknown[]> = {};
  for (const r of rows) if (HOMEBREW_KINDS.includes(r.kind)) (out[r.kind] ||= []).push(r.item);
  return sanitizeHomebrew(out).homebrew;
};

/** Homebrew published to a campaign, kept live. */
export function useCampaignHomebrew(campaignId: string | undefined): { homebrew: Homebrew; rows: Row[] } {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!campaignId) return setRows([]);
    let alive = true;
    const load = () =>
      supabase.from('campaign_homebrew').select('kind, id, item').eq('campaign_id', campaignId).then(({ data }) => alive && setRows((data as Row[]) || []));
    void load();
    const ch = supabase
      .channel('hb-' + campaignId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_homebrew', filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [campaignId]);
  return { homebrew: useMemo(() => toHomebrew(rows), [rows]), rows };
}

/** Pure merge: campaign items replace same-id items of the base data. */
export function mergeCampaignHomebrew(base: SrdData, hb: Homebrew): SrdData {
  const merged = { ...base } as unknown as Record<string, { id: string }[]>;
  for (const [k, list] of Object.entries(hb) as [string, { id: string }[]][]) {
    const ids = new Set(list.map((x) => x.id));
    merged[k] = [...(merged[k] || []).filter((x) => !ids.has(x.id)), ...list];
  }
  return merged as unknown as SrdData;
}

/** SRD of the campaign's edition + this browser's homebrew + the campaign's homebrew. */
export function useCampaignSrd(campaignId: string | undefined, edition: Edition): SrdData | null {
  const base = useSrd(edition);
  const { homebrew } = useCampaignHomebrew(campaignId);
  return useMemo(() => (base ? mergeCampaignHomebrew(base, homebrew) : null), [base, homebrew]);
}

export async function publishPack(campaignId: string, raw: unknown): Promise<SanitizeResult> {
  const r = sanitizeHomebrew(raw);
  const rows = (Object.entries(r.homebrew) as [HomebrewKind, { id: string }[]][]).flatMap(([kind, list]) => list.map((item) => ({ campaign_id: campaignId, kind, id: item.id, item })));
  if (rows.length) {
    const { error } = await supabase.from('campaign_homebrew').upsert(rows);
    if (error) throw new Error(campaignErrorPt(error.message));
  }
  return r;
}

export async function removeItem(campaignId: string, kind: HomebrewKind, id: string) {
  const { error } = await supabase.from('campaign_homebrew').delete().eq('campaign_id', campaignId).eq('kind', kind).eq('id', id);
  if (error) throw new Error(campaignErrorPt(error.message));
}

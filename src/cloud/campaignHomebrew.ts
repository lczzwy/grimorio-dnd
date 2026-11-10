import { useEffect, useMemo, useState } from 'react';
import type { Edition, SrdData } from '../data/types';
import { useSrd } from '../data/srd';
import { HOMEBREW_KINDS, sanitizeHomebrew, type Homebrew, type HomebrewKind, type SanitizeResult } from '../data/homebrew';
import { supabase } from './client';
import { campaignErrorPt } from './campaignText';

interface Row { kind: HomebrewKind; id: string; item: { id: string; name: string }; created_by?: string }

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
      supabase.from('campaign_homebrew').select('kind, id, item, created_by').eq('campaign_id', campaignId).then(({ data }) => alive && setRows((data as Row[]) || []));
    void load();
    const ch = supabase
      // unique name: several parts of the campaign page read the homebrew at once
      .channel('hb-' + campaignId + '-' + Math.random().toString(36).slice(2, 8))
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

/**
 * Publishes a homebrew pack to the campaign. Items someone else created are left as they are
 * (only their author or the GM may change them) and counted in `skipped`.
 */
export async function publishPack(campaignId: string, raw: unknown, who: { uid: string; isGm: boolean }): Promise<SanitizeResult & { skipped: number }> {
  const r = sanitizeHomebrew(raw);
  let rows = (Object.entries(r.homebrew) as [HomebrewKind, { id: string }[]][]).flatMap(([kind, list]) => list.map((item) => ({ campaign_id: campaignId, kind, id: item.id, item, updated_by: who.uid })));
  let skipped = 0;
  if (rows.length && !who.isGm) {
    const { data } = await supabase.from('campaign_homebrew').select('kind, id, created_by').eq('campaign_id', campaignId);
    const others = new Set(((data as { kind: string; id: string; created_by: string }[]) || []).filter((x) => x.created_by !== who.uid).map((x) => x.kind + '/' + x.id));
    const before = rows.length;
    rows = rows.filter((x) => !others.has(x.kind + '/' + x.id));
    skipped = before - rows.length;
  }
  if (rows.length) {
    const { error } = await supabase.from('campaign_homebrew').upsert(rows);
    if (error) throw new Error(campaignErrorPt(error.message));
  }
  return { ...r, kept: rows.length, skipped };
}

export async function removeItem(campaignId: string, kind: HomebrewKind, id: string) {
  const { data, error } = await supabase.from('campaign_homebrew').delete().eq('campaign_id', campaignId).eq('kind', kind).eq('id', id).select('id');
  if (error) throw new Error(campaignErrorPt(error.message));
  // the rules silently skip rows you may not delete: say so instead of pretending it worked
  if (!data?.length) throw new Error(campaignErrorPt('row-level security'));
}

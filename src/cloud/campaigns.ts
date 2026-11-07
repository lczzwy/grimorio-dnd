import { useEffect, useState } from 'react';
import type { Edition } from '../data/types';
import { supabase } from './client';
import { useAuth } from './auth';
import { campaignErrorPt } from './campaignText';

export interface Campaign { id: string; name: string; edition: Edition; gm: string; invite_code: string; created_at?: string }
export interface Member { user_id: string; role: 'gm' | 'player'; character_id: string | null; display_name: string }

const check = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(campaignErrorPt(r.error.message));
  return r.data;
};

export async function listCampaigns(): Promise<Campaign[]> {
  return check(await supabase.from('campaigns').select('*').order('created_at', { ascending: false })) as Campaign[];
}

export async function createCampaign(name: string, edition: Edition): Promise<Campaign> {
  const gm = useAuth.getState().user?.id;
  return check(await supabase.from('campaigns').insert({ name, edition, gm }).select().single()) as Campaign;
}

export async function joinCampaign(code: string): Promise<string> {
  return check(await supabase.rpc('join_campaign', { code })) as string;
}

export async function setMyCharacter(campaignId: string, characterId: string | null) {
  check(await supabase.rpc('set_member_character', { campaign: campaignId, ch: characterId }));
}

export async function listMembers(campaignId: string): Promise<Member[]> {
  const rows = check(await supabase.from('campaign_members').select('user_id, role, character_id').eq('campaign_id', campaignId)) as Omit<Member, 'display_name'>[];
  const ids = rows.map((r) => r.user_id);
  const profiles = ids.length ? (check(await supabase.from('profiles').select('id, display_name').in('id', ids)) as { id: string; display_name: string }[]) : [];
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  return rows
    .map((r) => ({ ...r, display_name: names.get(r.user_id) || 'Jogador' }))
    .sort((a, b) => (a.role === b.role ? a.display_name.localeCompare(b.display_name) : a.role === 'gm' ? -1 : 1));
}

export async function removeMember(campaignId: string, userId: string) {
  check(await supabase.from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', userId));
}

export async function regenerateInvite(campaignId: string): Promise<string> {
  return check(await supabase.rpc('new_invite_code', { campaign: campaignId })) as string;
}

export async function renameCampaign(campaignId: string, name: string) {
  check(await supabase.from('campaigns').update({ name }).eq('id', campaignId));
}

export async function deleteCampaign(campaignId: string) {
  check(await supabase.from('campaigns').delete().eq('id', campaignId));
}

/** GM applies damage / healing / temp HP / conditions to a player character (server-side, see gm_apply). */
export async function gmApply(characterId: string, campaignId: string, o: { deltaHp?: number; tempHp?: number; add?: string[]; remove?: string[]; maxHp?: number }) {
  check(await supabase.rpc('gm_apply', {
    ch: characterId,
    campaign: campaignId,
    delta_hp: o.deltaHp ?? null,
    temp_hp: o.tempHp ?? null,
    add_conditions: o.add ?? null,
    remove_conditions: o.remove ?? null,
    max_hp: o.maxHp ?? null,
  }));
}

const campaignCache = new Map<string, { campaign: Campaign; members: Member[] }>();

/** Campaign + members, kept live through realtime. Cached so reopening is instant. */
export function useCampaign(id: string) {
  const uid = useAuth((s) => s.user?.id);
  const cached = campaignCache.get(id);
  const [campaign, setCampaign] = useState<Campaign | null>(cached?.campaign ?? null);
  const [members, setMembers] = useState<Member[]>(cached?.members ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const load = async () => {
      try {
        const c = check(await supabase.from('campaigns').select('*').eq('id', id).maybeSingle()) as Campaign | null;
        if (!alive) return;
        if (!c) {
          setError('Campanha não encontrada, ou você não faz parte dela.');
          setLoading(false);
          return;
        }
        setCampaign(c);
        const m = await listMembers(id);
        if (alive) setMembers(m);
        campaignCache.set(id, { campaign: c, members: m });
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const channel = supabase
      .channel('campaign-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_members', filter: `campaign_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [id, uid]);

  return { campaign, members, isGm: !!campaign && campaign.gm === uid, loading, error, setCampaign };
}

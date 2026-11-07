import { useEffect, useState } from 'react';
import { supabase } from './client';
import { useAuth } from './auth';
import type { RollRow } from './rollRow';
import type { ChatRow } from './chatLogic';
import { useReveal } from '../dice3d/reveal';

const LIMIT = 150;

/** Chat messages and rolls of a campaign, live. New rows arrive by realtime push (no reload). */
export function useTableFeed(campaignId: string) {
  const [msgs, setMsgs] = useState<ChatRow[]>([]);
  const [rolls, setRolls] = useState<RollRow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [m, r] = await Promise.all([
        supabase.from('chat_messages').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('rolls').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(LIMIT),
      ]);
      if (!alive) return;
      if (m.data) setMsgs((m.data as ChatRow[]).reverse());
      if (r.data) setRolls((r.data as RollRow[]).reverse());
    };
    void load();
    const add = <T extends { id?: string }>(set: (fn: (s: T[]) => T[]) => void, row: T) =>
      set((s) => (s.some((x) => x.id === row.id) ? s : [...s, row].slice(-LIMIT)));
    const filter = `campaign_id=eq.${campaignId}`;
    const ch = supabase
      .channel('feed-' + campaignId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (p) => add(setMsgs, p.new as ChatRow))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rolls', filter }, (p) => {
        const row = p.new as RollRow;
        // with a dice table on screen the roll joins the chat when the dice stop (see TableDice)
        if (row.id) useReveal.getState().hide(row.id);
        add(setRolls, row);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rolls', filter }, (p) => {
        // a revealed roll was invisible to players until now, so it may be new to them
        const row = p.new as RollRow;
        setRolls((s) => (s.some((x) => x.id === row.id) ? s.map((x) => (x.id === row.id ? row : x)) : [...s, row].sort((a, b) => ((a.created_at || '') < (b.created_at || '') ? -1 : 1)).slice(-LIMIT)));
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void load(); });
    // safety net if the realtime socket drops (phone asleep, bad wifi)
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const poll = setInterval(() => void load(), 20000);
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }, [campaignId]);
  return { msgs, rolls, addLocal: (row: ChatRow) => setMsgs((s) => (s.some((x) => x.id === row.id) ? s : [...s, row])) };
}

export async function sendChat(campaignId: string, body: string): Promise<ChatRow> {
  const { user, profile } = useAuth.getState();
  if (!user) throw new Error('Entre na sua conta para conversar.');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ campaign_id: campaignId, user_id: user.id, author: profile?.display_name || 'Jogador', body })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ChatRow;
}

export async function deleteChat(id: string) {
  const { error } = await supabase.from('chat_messages').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

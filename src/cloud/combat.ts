import { useEffect, useState } from 'react';
import { supabase } from './client';
import { campaignErrorPt } from './campaignText';
import { MANUAL_ORDER, nextTurnState, reorder, sortCombatants, tickEffects, type Effect } from './combatLogic';
import type { MonsterDef, MonsterAction } from '../data/monsters';

export interface Combatant {
  id: string; campaign_id: string; kind: 'player' | 'monster' | 'npc'; character_id: string | null; name: string; image: string | null;
  initiative: number | null; hp_band: string; conditions: string[]; effects: Effect[]; visible: boolean; sort: number;
}
export interface Secrets { combatant_id: string; campaign_id: string; hp_current: number; hp_max: number; hp_temp: number; ac: number | null; stat: MonsterDef | null; attacks: MonsterAction[]; notes: string }
export interface Encounter { campaign_id: string; active: boolean; round: number; turn: number; init_call?: boolean }

const ok = <T,>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(campaignErrorPt(r.error.message));
  return r.data;
};

/** Encounter state, combatants (ordered) and — for the GM — their secrets, all live. */
export function useEncounter(campaignId: string, isGm: boolean) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [list, setList] = useState<Combatant[]>([]);
  const [secrets, setSecrets] = useState<Record<string, Secrets>>({});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [e, c] = await Promise.all([
        supabase.from('encounters').select('*').eq('campaign_id', campaignId).maybeSingle(),
        supabase.from('combatants').select('*').eq('campaign_id', campaignId),
      ]);
      if (!alive) return;
      setEncounter((e.data as Encounter) ?? { campaign_id: campaignId, active: false, round: 1, turn: 0 });
      setList(sortCombatants((c.data as Combatant[]) || []));
      if (isGm) {
        const s = await supabase.from('combatant_secrets').select('*').eq('campaign_id', campaignId);
        if (alive) setSecrets(Object.fromEntries(((s.data as Secrets[]) || []).map((x) => [x.combatant_id, x])));
      }
    };
    void load();
    let ch = supabase
      // unique name: the turn order and the Combat tab can watch the same fight at once
      .channel('combat-' + campaignId + '-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combatants', filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encounters', filter: `campaign_id=eq.${campaignId}` }, () => void load());
    // secrets aren't in the realtime publication: the GM reloads them after own writes
    ch = ch.subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [campaignId, isGm]);
  const reload = async () => {
    const s = await supabase.from('combatant_secrets').select('*').eq('campaign_id', campaignId);
    setSecrets(Object.fromEntries(((s.data as Secrets[]) || []).map((x) => [x.combatant_id, x])));
  };
  return { encounter, list, secrets, reloadSecrets: reload };
}

export async function addPlayerCombatant(campaignId: string, characterId: string, name: string, image?: string) {
  ok(await supabase.from('combatants').insert({ campaign_id: campaignId, kind: 'player', character_id: characterId, name, image: image ?? null }));
}

/** Adds an enemy (from an SRD monster or from scratch). Hidden enemies only the GM sees. */
export async function addEnemy(campaignId: string, o: { name: string; hp: number; ac?: number; image?: string | null; stat?: MonsterDef | null; visible?: boolean; kind?: 'monster' | 'npc' }) {
  const c = ok(await supabase.from('combatants').insert({ campaign_id: campaignId, kind: o.kind ?? 'monster', name: o.name, image: o.image ?? null, visible: o.visible ?? true }).select().single()) as Combatant;
  ok(await supabase.from('combatant_secrets').insert({ combatant_id: c.id, campaign_id: campaignId, hp_current: o.hp, hp_max: o.hp, ac: o.ac ?? null, stat: o.stat ?? null, attacks: o.stat?.actions ?? [] }));
  return c;
}

export async function updateCombatant(id: string, patch: Partial<Omit<Combatant, 'id' | 'campaign_id'>>) {
  ok(await supabase.from('combatants').update(patch).eq('id', id));
}
export async function updateSecrets(id: string, patch: Partial<Omit<Secrets, 'combatant_id' | 'campaign_id'>>) {
  ok(await supabase.from('combatant_secrets').update(patch).eq('combatant_id', id));
}
export async function removeCombatant(id: string) {
  ok(await supabase.from('combatants').delete().eq('id', id));
}

export async function setEncounter(campaignId: string, patch: Partial<Omit<Encounter, 'campaign_id'>>) {
  ok(await supabase.from('encounters').upsert({ campaign_id: campaignId, ...patch }));
}

/** Next turn; on a new round, duration effects tick down. */
export async function nextTurn(e: Encounter, list: Combatant[]) {
  const s = nextTurnState(e, list.length);
  if (s.newRound) await Promise.all(list.filter((c) => c.effects.some((x) => x.rounds != null)).map((c) => updateCombatant(c.id, { effects: tickEffects(c.effects) })));
  await setEncounter(e.campaign_id, { round: s.round, turn: s.turn });
}

/** Player: records the initiative from the d20 roll the server just made for them (joins the fight if needed). */
export async function rollMyInitiative(campaignId: string, rollId: string) {
  ok(await supabase.rpc('roll_my_initiative', { campaign: campaignId, roll: rollId }));
}

/** GM: brings every player with a character into the fight, clears their old initiative and asks them to roll. */
export async function callInitiative(campaignId: string, list: Combatant[], players: { character_id: string; name: string; image?: string }[]) {
  for (const p of players) {
    const c = list.find((x) => x.character_id === p.character_id);
    if (c) await updateCombatant(c.id, { initiative: null, sort: 0 });
    else await addPlayerCombatant(campaignId, p.character_id, p.name, p.image);
  }
  // a new call for initiative goes back to ordering by the numbers
  await Promise.all(list.filter((c) => c.sort >= MANUAL_ORDER && !players.some((p) => p.character_id === c.character_id)).map((c) => updateCombatant(c.id, { sort: 0 })));
  await setEncounter(campaignId, { init_call: true });
}

/** GM: puts the fight in a new order (dragged by hand), keeping the turn on whoever is acting now. */
export async function reorderCombatants(e: Encounter, list: Combatant[], from: number, to: number) {
  if (from === to) return;
  const acting = e.active ? list[e.turn]?.id : undefined;
  const { order, sorts } = reorder(list, from, to);
  await Promise.all(list.filter((c) => c.sort !== sorts[c.id]).map((c) => updateCombatant(c.id, { sort: sorts[c.id] })));
  if (acting) await setEncounter(e.campaign_id, { turn: order.findIndex((c) => c.id === acting) });
}

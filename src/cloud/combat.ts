import { updateShared, useShared } from './shared';
import { supabase } from './client';
import { campaignErrorPt } from './campaignText';
import { MANUAL_ORDER, nextTurnState, reorder, sortCombatants, tickEffects, turnIndex, type Effect } from './combatLogic';
import type { MonsterDef, MonsterAction } from '../data/monsters';

export interface Combatant {
  id: string; campaign_id: string; kind: 'player' | 'monster' | 'npc'; character_id: string | null; name: string; image: string | null;
  initiative: number | null; hp_band: string; conditions: string[]; effects: Effect[]; visible: boolean; sort: number;
}
export interface Secrets { combatant_id: string; campaign_id: string; hp_current: number; hp_max: number; hp_temp: number; ac: number | null; stat: MonsterDef | null; attacks: MonsterAction[]; notes: string }
export interface Encounter { campaign_id: string; active: boolean; round: number; turn: number; turn_id?: string | null; init_call?: boolean }

const ok = <T,>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(campaignErrorPt(r.error.message));
  return r.data;
};

interface FightState { encounter: Encounter | null; list: Combatant[]; secrets: Record<string, Secrets> }
const EMPTY_FIGHT: FightState = { encounter: null, list: [], secrets: {} };
const fightKey = (campaignId: string, isGm: boolean) => `fight:${campaignId}:${isGm ? 'gm' : 'p'}`;

async function loadSecrets(campaignId: string) {
  const s = await supabase.from('combatant_secrets').select('*').eq('campaign_id', campaignId);
  return Object.fromEntries(((s.data as Secrets[]) || []).map((x) => [x.combatant_id, x]));
}

/**
 * Encounter state, combatants (ordered) and — for the GM — their secrets, all live.
 * Shared: the turn order, the map and the Combat tab read one subscription per campaign.
 */
export function useEncounter(campaignId: string, isGm: boolean) {
  // no campaign (a sheet played alone): nothing to watch
  const key = campaignId ? fightKey(campaignId, isGm) : null;
  const state = useShared<FightState>(key, EMPTY_FIGHT, (set) => {
    let alive = true;
    let timer: number | undefined;
    const load = async () => {
      const [e, c] = await Promise.all([
        supabase.from('encounters').select('*').eq('campaign_id', campaignId).maybeSingle(),
        supabase.from('combatants').select('*').eq('campaign_id', campaignId),
      ]);
      if (!alive) return;
      const secrets = isGm ? await loadSecrets(campaignId) : {};
      if (!alive) return;
      set(() => ({
        encounter: (e.data as Encounter) ?? { campaign_id: campaignId, active: false, round: 1, turn: 0 },
        list: sortCombatants((c.data as Combatant[]) || []),
        secrets,
      }));
    };
    // a calm full reload after a burst of changes keeps everything exact (the GM's life numbers too)
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 600); };
    void load();
    const ch = supabase
      .channel('combat-' + campaignId + (isGm ? '-gm-' : '-') + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combatants', filter: `campaign_id=eq.${campaignId}` }, (p) => {
        if (p.eventType === 'UPDATE') {
          const row = p.new as Combatant;
          set((s) => ({ ...s, list: sortCombatants(s.list.map((x) => (x.id === row.id ? row : x))) }));
        }
        later();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encounters', filter: `campaign_id=eq.${campaignId}` }, (p) => {
        if (p.eventType !== 'DELETE') set((s) => ({ ...s, encounter: p.new as Encounter }));
      })
      .subscribe();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  });
  // secrets aren't in the realtime publication: the GM reloads them after own writes
  const reload = async () => {
    const secrets = await loadSecrets(campaignId);
    if (key) updateShared<FightState>(key, (s) => ({ ...s, secrets }));
  };
  return { encounter: state.encounter, list: state.list, secrets: state.secrets, reloadSecrets: reload };
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

/** GM: starts the fight on whoever is first in the order. */
export async function startFight(campaignId: string, list: Combatant[]) {
  await setEncounter(campaignId, { active: true, round: 1, turn: 0, turn_id: list[0]?.id ?? null, init_call: false });
}

/** Next turn (GM, full list); on a new round, duration effects tick down. */
export async function nextTurn(e: Encounter, list: Combatant[]) {
  const s = nextTurnState({ round: e.round, turn: Math.max(0, turnIndex(e, list, true)) }, list.length);
  if (s.newRound) await Promise.all(list.filter((c) => c.effects.some((x) => x.rounds != null)).map((c) => updateCombatant(c.id, { effects: tickEffects(c.effects) })));
  await setEncounter(e.campaign_id, { round: s.round, turn: s.turn, turn_id: list[s.turn]?.id ?? null });
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
  const acting = e.active ? list[turnIndex(e, list, true)]?.id : undefined;
  const { order, sorts } = reorder(list, from, to);
  await Promise.all(list.filter((c) => c.sort !== sorts[c.id]).map((c) => updateCombatant(c.id, { sort: sorts[c.id] })));
  if (acting) await setEncounter(e.campaign_id, { turn: order.findIndex((c) => c.id === acting), turn_id: acting });
}

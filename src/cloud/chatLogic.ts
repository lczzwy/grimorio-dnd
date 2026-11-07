import { parseDice } from '../engine/dice';
import type { RollRow } from './rollRow';

/** Colours a player can pick at the table (chat name, dice). */
export const PLAYER_COLORS = ['#c8423a', '#d98a2b', '#d9c25f', '#6fa84f', '#3fa39a', '#4f8fd9', '#7a68d9', '#c25fb0', '#e0e0e0', '#8a8f99'] as const;

/** Stored colour, or a stable one picked from the user id so everyone sees the same default. */
export function colorFor(userId: string, stored?: string | null) {
  if (stored && /^#[0-9a-f]{6}$/.test(stored)) return stored;
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export type ChatInput =
  | { kind: 'msg'; body: string }
  | { kind: 'roll'; formula: string; label: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty' };

const ROLL_CMD = /^\/(r|roll|rolar)\b\s*/i;

/** "/r 2d6+3 dano" → roll; anything else → message. */
export function parseChatInput(raw: string): ChatInput {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };
  if (!ROLL_CMD.test(text)) return { kind: 'msg', body: text.slice(0, 1000) };
  const rest = text.replace(ROLL_CMD, '');
  // the formula is the leading run of dice characters; whatever follows is the label
  const m = /^([\dd+\-\s]+?)(?:\s+([^\d+\-\s].*))?$/i.exec(rest);
  const formula = (m?.[1] ?? '').replace(/\s+/g, '');
  if (!formula || !parseDice(formula) || !/d/i.test(formula)) return { kind: 'error', message: 'Use /r e uma fórmula, ex.: /r 1d20+5 ataque ou /r 2d6' };
  return { kind: 'roll', formula: formula.toLowerCase(), label: (m?.[2] ?? '').trim() || 'Rolagem' };
}

export interface ChatRow { id: string; campaign_id: string; user_id: string; author: string; body: string; created_at: string }

export type FeedItem = { type: 'msg'; at: string; row: ChatRow } | { type: 'roll'; at: string; row: RollRow };

/** Chat messages and rolls in one timeline, oldest first, de-duplicated by id. */
export function mergeFeed(msgs: ChatRow[], rolls: RollRow[]): FeedItem[] {
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const row of msgs) if (!seen.has('m' + row.id)) { seen.add('m' + row.id); items.push({ type: 'msg', at: row.created_at, row }); }
  for (const row of rolls) if (row.id && !seen.has('r' + row.id)) { seen.add('r' + row.id); items.push({ type: 'roll', at: row.created_at || '', row }); }
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

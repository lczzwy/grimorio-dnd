import type { ActiveRoll } from '../store';

export interface RollRow {
  id?: string;
  campaign_id: string;
  user_id: string;
  author: string;
  label: string;
  formula: string;
  rolls: number[];
  dropped: number[] | null;
  total: number;
  kind: string | null;
  hidden: boolean;
  created_at?: string;
}

/** Local dice result → row of the campaign roll feed. kind: crit/fumble, else adv/dis, else null. */
export function toRollRow(e: ActiveRoll, campaignId: string, userId: string, author: string, hidden: boolean): RollRow {
  return {
    campaign_id: campaignId,
    user_id: userId,
    author,
    label: e.label,
    formula: e.formula,
    rolls: e.rolls,
    dropped: e.dropped ?? null,
    total: e.total,
    kind: e.kind ?? (e.mode && e.mode !== 'normal' ? e.mode : null),
    hidden,
  };
}

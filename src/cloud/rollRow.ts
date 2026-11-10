/** A row of the campaign roll feed. Rows are created only by the server (roll_dice). */
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

import { useApp } from '../../store';
import { go } from '../../ui/ui';
import { Sheet } from '../Sheet';
import type { CampaignProps } from '../Campaign';

/** The player's own sheet, editable, inside the campaign: every roll goes to the table. */
export function MySheetTab({ campaign, members, uid }: CampaignProps) {
  const me = members.find((m) => m.user_id === uid);
  const has = useApp((s) => s.characters.some((c) => c.id === me?.character_id));
  if (!me?.character_id) return <div className="panel empty">Você ainda não escolheu um personagem. <button className="btn sm" onClick={() => go(`campanha/${campaign.id}/ajustes`)}>Escolher em Ajustes</button></div>;
  if (!has) return <div className="panel empty">A ficha está sendo baixada da sua conta…</div>;
  return <Sheet edition={campaign.edition} id={me.character_id} campaignId={campaign.id} />;
}

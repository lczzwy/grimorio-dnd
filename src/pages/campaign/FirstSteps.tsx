import { useState } from 'react';
import { Copy, Plus, Upload, Stamp } from 'lucide-react';
import { useApp } from '../../store';
import { bringCharacter } from '../../cloud/campaignCharacter';
import { inviteLink } from '../../cloud/campaignText';
import { classSummary } from '../../engine/rules';
import { go, useFlash } from '../../ui/ui';
import { Avatar } from '../Roster';
import type { CampaignProps } from '../Campaign';

/**
 * The one thing someone must do before playing, shown on the table itself (not hidden in Ajustes):
 * a player picks the character they bring; a GM with an empty table invites the group.
 * Disappears as soon as it is done.
 */
export function FirstSteps({ campaign, members, isGm, uid }: CampaignProps) {
  const chars = useApp((s) => s.characters);
  const flash = useFlash((s) => s.show);
  const [busy, setBusy] = useState<string | null>(null);
  const me = members.find((m) => m.user_id === uid);
  const players = members.filter((m) => m.role === 'player');

  if (isGm) {
    if (players.length) return null;
    const link = inviteLink(campaign.invite_code);
    return (
      <section className="summons">
        <Stamp className="summons-seal" size={22} aria-hidden />
        <div className="summons-body">
          <h2>Chame o grupo</h2>
          <p>Mande este link no Discord. Quem abrir entra na mesa como jogador.</p>
          <div className="row">
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Link de convite" />
            <button className="btn primary" onClick={() => { void navigator.clipboard.writeText(link); flash('Link copiado'); }}><Copy size={15} /> Copiar link</button>
          </div>
        </div>
      </section>
    );
  }

  if (!me || me.character_id) return null;
  const mine = chars.filter((c) => c.edition === campaign.edition);
  const pick = async (id: string) => {
    setBusy(id);
    try {
      await bringCharacter(campaign.id, id);
      flash('Personagem na mesa');
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="summons">
      <Stamp className="summons-seal" size={22} aria-hidden />
      <div className="summons-body">
        <h2>Escolha quem você leva para esta mesa</h2>
        {mine.length ? (
          <>
            <p>O mestre passa a ver a ficha ao vivo, e você rola iniciativa e aparece na mesa com o nome do personagem.</p>
            <div className="summons-picks">
              {mine.map((c) => (
                <button key={c.id} className="summons-pick" disabled={!!busy} onClick={() => pick(c.id)}>
                  <Avatar name={c.name} portrait={c.portrait} />
                  <span className="summons-pick-text">
                    <b>{c.name || 'Sem nome'}</b>
                    <span>{busy === c.id ? 'Levando para a mesa…' : classSummary(c)}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>Esta campanha usa D&amp;D {campaign.edition} e você ainda não tem personagem dessa edição neste aparelho. Crie ou importe um e volte aqui pelo menu Campanhas.</p>
            <div className="row wrap">
              <button className="btn primary" onClick={() => go(`${campaign.edition}/novo`)}><Plus size={15} /> Criar personagem</button>
              <button className="btn" onClick={() => go(campaign.edition)}><Upload size={15} /> Importar ficha</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

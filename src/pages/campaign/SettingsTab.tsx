import { useState } from 'react';
import { Copy, RefreshCw, UserMinus, LogOut, Trash2, Crown, Cloud } from 'lucide-react';
import { useApp } from '../../store';
import { deleteCampaign, regenerateInvite, removeMember, renameCampaign } from '../../cloud/campaigns';
import { bringCharacter } from '../../cloud/campaignCharacter';
import { inviteLink } from '../../cloud/campaignText';
import { classSummary } from '../../engine/rules';
import { go, useFlash } from '../../ui/ui';
import type { CampaignProps } from '../Campaign';
import { confirmBox, showError } from '../../ui/dialogs';

export function SettingsTab({ campaign, members, isGm, uid }: CampaignProps) {
  const flash = useFlash((s) => s.show);
  const chars = useApp((s) => s.characters);
  const [code, setCode] = useState(campaign.invite_code);
  const [name, setName] = useState(campaign.name);
  const me = members.find((m) => m.user_id === uid);
  const mine = chars.filter((c) => c.edition === campaign.edition);
  const link = inviteLink(code);

  const choose = async (characterId: string | null) => {
    try {
      await bringCharacter(campaign.id, characterId);
      flash(characterId ? 'Personagem escolhido!' : 'Personagem removido da campanha');
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div className="sheet-grid cols2">
      <div className="col g16">
        {!isGm && (
          <div className="panel col">
            <h3>Seu personagem nesta campanha</h3>
            {mine.length === 0 && <div className="small muted">Você não tem personagens de D&D {campaign.edition} neste navegador. <a href={'#/' + campaign.edition + '/novo'}>Criar um</a> ou importar na mesa {campaign.edition}.</div>}
            <div className="col g6">
              {mine.map((c) => (
                <button key={c.id} className={'pick-item' + (me?.character_id === c.id ? ' sel' : '')} onClick={() => choose(me?.character_id === c.id ? null : c.id)}>
                  <span className="grow" style={{ textAlign: 'left' }}><b>{c.name || 'Sem nome'}</b> <span className="small muted">{classSummary(c)}</span></span>
                  {c.cloud && <Cloud size={14} color="var(--accent-2)" />}
                  {me?.character_id === c.id && <span className="tag accent">em jogo</span>}
                </button>
              ))}
            </div>
            <div className="small faint">Ao escolher, o mestre passa a ver sua ficha ao vivo.</div>
          </div>
        )}
        <div className="panel col">
          <h3>Convite</h3>
          <div className="small muted">Mande este link no Discord. Quem abrir entra na campanha como jogador.</div>
          <div className="row">
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => { void navigator.clipboard.writeText(link); flash('Link copiado!'); }}><Copy size={15} /> Copiar</button>
          </div>
          {isGm && (
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              if (!(await confirmBox('Gerar um link novo? O link antigo deixa de funcionar (quem já entrou continua na campanha).', { ok: 'Gerar link novo' }))) return;
              try { setCode(await regenerateInvite(campaign.id)); flash('Link novo gerado'); } catch (e) { showError(e); }
            }}><RefreshCw size={14} /> Gerar link novo</button>
          )}
        </div>
      </div>
      <div className="col g16">
        <div className="panel col">
          <h3>Membros ({members.length})</h3>
          {members.map((m) => {
            const ch = m.character_id ? chars.find((c) => c.id === m.character_id) : undefined;
            return (
              <div key={m.user_id} className="row" style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-2)' }}>
                <span className="grow"><b>{m.display_name}</b>{m.user_id === uid && <span className="faint"> (você)</span>} <span className="small muted">{m.role === 'gm' ? '' : m.character_id ? `· ${ch?.name ?? 'personagem escolhido'}` : '· sem personagem'}</span></span>
                {m.role === 'gm' ? <span className="tag gold"><Crown size={12} /> Mestre</span> : isGm && (
                  <button className="btn icon sm ghost danger" title="Remover da campanha" onClick={async () => { if ((await confirmBox(`Remover ${m.display_name} da campanha?`, { danger: true, ok: 'Remover' }))) try { await removeMember(campaign.id, m.user_id); } catch (e) { showError(e); } }}><UserMinus size={14} /></button>
                )}
              </div>
            );
          })}
          {!isGm && (
            <button className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              if (!(await confirmBox('Sair desta campanha? Sua ficha continua sua.', { danger: true, ok: 'Sair' }))) return;
              try { await removeMember(campaign.id, uid); go('campanhas'); } catch (e) { showError(e); }
            }}><LogOut size={14} /> Sair da campanha</button>
          )}
        </div>
        {isGm && (
          <div className="panel col">
            <h3>Campanha</h3>
            <div className="row">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn" disabled={!name.trim() || name === campaign.name} onClick={async () => { try { await renameCampaign(campaign.id, name.trim()); flash('Nome salvo'); } catch (e) { showError(e); } }}>Salvar</button>
            </div>
            <button className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              if (!(await confirmBox(`Apagar a campanha "${campaign.name}" para todos? As fichas dos jogadores continuam deles. Não dá para desfazer.`, { danger: true, ok: 'Apagar' }))) return;
              try { await deleteCampaign(campaign.id); go('campanhas'); } catch (e) { showError(e); }
            }}><Trash2 size={14} /> Apagar campanha</button>
          </div>
        )}
      </div>
    </div>
  );
}

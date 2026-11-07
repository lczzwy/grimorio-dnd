import { useState } from 'react';
import { Copy, RefreshCw, UserMinus, LogOut, Trash2, Crown, Cloud } from 'lucide-react';
import { useApp } from '../../store';
import { deleteCampaign, regenerateInvite, removeMember, renameCampaign, setMyCharacter } from '../../cloud/campaigns';
import { inviteLink } from '../../cloud/campaignText';
import { uploader } from '../../cloud/sync';
import { classSummary } from '../../engine/rules';
import { go, useFlash } from '../../ui/ui';
import type { CampaignProps } from '../Campaign';

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
      if (characterId) {
        const c = chars.find((x) => x.id === characterId)!;
        // the campaign reads the online copy: make sure it exists first
        if (!c.cloud) useApp.getState().updateCharacter(c.id, (d) => (d.cloud = true));
        uploader.schedule({ ...useApp.getState().characters.find((x) => x.id === characterId)!, cloud: true });
        await uploader.flush();
      }
      await setMyCharacter(campaign.id, characterId);
      flash(characterId ? 'Personagem escolhido!' : 'Personagem removido da campanha');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="sheet-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="col" style={{ gap: 16 }}>
        {!isGm && (
          <div className="panel col">
            <h3>Seu personagem nesta campanha</h3>
            {mine.length === 0 && <div className="small muted">Você não tem personagens de D&D {campaign.edition} neste navegador. <a href={'#/' + campaign.edition + '/novo'}>Criar um</a> ou importar na mesa {campaign.edition}.</div>}
            <div className="col" style={{ gap: 6 }}>
              {mine.map((c) => (
                <button key={c.id} className={'pick-item' + (me?.character_id === c.id ? ' sel' : '')} onClick={() => choose(me?.character_id === c.id ? null : c.id)}>
                  <span className="grow" style={{ textAlign: 'left' }}><b>{c.name || 'Sem nome'}</b> <span className="small muted">{classSummary(c)}</span></span>
                  {c.cloud && <Cloud size={14} color="var(--accent-2)" />}
                  {me?.character_id === c.id && <span className="tag accent">em jogo</span>}
                </button>
              ))}
            </div>
            <div className="small faint">Ao escolher, a ficha vai para a nuvem e o mestre passa a ver ela ao vivo.</div>
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
              if (!confirm('Gerar um link novo? O link antigo deixa de funcionar (quem já entrou continua na campanha).')) return;
              try { setCode(await regenerateInvite(campaign.id)); flash('Link novo gerado'); } catch (e) { alert((e as Error).message); }
            }}><RefreshCw size={14} /> Gerar link novo</button>
          )}
        </div>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <div className="panel col">
          <h3>Membros ({members.length})</h3>
          {members.map((m) => {
            const ch = m.character_id ? chars.find((c) => c.id === m.character_id) : undefined;
            return (
              <div key={m.user_id} className="row" style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-2)' }}>
                <span className="grow"><b>{m.display_name}</b>{m.user_id === uid && <span className="faint"> (você)</span>} <span className="small muted">{m.role === 'gm' ? '' : m.character_id ? `· ${ch?.name ?? 'personagem escolhido'}` : '· sem personagem'}</span></span>
                {m.role === 'gm' ? <span className="tag gold"><Crown size={12} /> Mestre</span> : isGm && (
                  <button className="btn icon sm ghost danger" title="Remover da campanha" onClick={async () => { if (confirm(`Remover ${m.display_name} da campanha?`)) try { await removeMember(campaign.id, m.user_id); } catch (e) { alert((e as Error).message); } }}><UserMinus size={14} /></button>
                )}
              </div>
            );
          })}
          {!isGm && (
            <button className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              if (!confirm('Sair desta campanha? Sua ficha continua sua.')) return;
              try { await removeMember(campaign.id, uid); go('campanhas'); } catch (e) { alert((e as Error).message); }
            }}><LogOut size={14} /> Sair da campanha</button>
          )}
        </div>
        {isGm && (
          <div className="panel col">
            <h3>Campanha</h3>
            <div className="row">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn" disabled={!name.trim() || name === campaign.name} onClick={async () => { try { await renameCampaign(campaign.id, name.trim()); flash('Nome salvo'); } catch (e) { alert((e as Error).message); } }}>Salvar</button>
            </div>
            <button className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              if (!confirm(`Apagar a campanha "${campaign.name}" para todos? As fichas dos jogadores continuam deles. Não dá para desfazer.`)) return;
              try { await deleteCampaign(campaign.id); go('campanhas'); } catch (e) { alert((e as Error).message); }
            }}><Trash2 size={14} /> Apagar campanha</button>
          </div>
        )}
      </div>
    </div>
  );
}

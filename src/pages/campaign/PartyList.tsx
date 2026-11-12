import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Crown } from 'lucide-react';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { partySummary } from '../../cloud/party';
import { useOnline } from '../../cloud/presence';
import { CONDITION_PT } from '../../engine/rules';
import { useParty } from './TableTab';
import type { CampaignProps } from '../Campaign';

/**
 * The people at the table, as a list beside the chat (the way Discord shows members): portrait,
 * character and player, a life bar, conditions, and a dot for who has the table open right now.
 * A click opens that character's sheet.
 */
export function PartyList({ campaign, members, uid, onOpen }: CampaignProps & { onOpen: (characterId: string, mine: boolean) => void }) {
  const srd = useCampaignSrd(campaign.id, campaign.edition);
  const chars = useParty(members.map((m) => m.character_id).filter((x): x is string => !!x));
  const online = useOnline(campaign.id, uid);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('party-list') !== '0'; } catch { return true; } });
  const toggle = () => setOpen((v) => { try { localStorage.setItem('party-list', v ? '0' : '1'); } catch { /* private mode */ } return !v; });

  const gm = members.find((m) => m.role === 'gm');
  const players = members.filter((m) => m.role === 'player');
  const here = members.filter((m) => online.has(m.user_id)).length;

  return (
    <section className={'plist' + (open ? '' : ' folded')}>
      <button className="plist-head" onClick={toggle} aria-expanded={open}>
        <b>Grupo</b>
        <span className="plist-count">{here} de {members.length} na mesa</span>
        <span className="spacer" />
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <ul className="plist-rows">
          {gm && (
            <li className="plist-row gm">
              <span className={'plist-av' + (online.has(gm.user_id) ? ' on' : '')}><Crown size={14} /></span>
              <span className="plist-text"><b>{gm.display_name}</b><span>Mestre</span></span>
            </li>
          )}
          {players.map((m) => {
            const c = m.character_id ? chars[m.character_id] : undefined;
            const s = c && srd ? partySummary(c, srd) : null;
            const pct = s && s.maxHp > 0 ? Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100)) : 0;
            const tone = pct > 50 ? 'ok' : pct > 25 ? 'mid' : 'low';
            const body = (
              <>
                <span className={'plist-av' + (online.has(m.user_id) ? ' on' : '')} style={c?.portrait ? { backgroundImage: `url(${c.portrait})` } : undefined}>
                  {!c?.portrait && (s?.name || m.display_name).charAt(0).toUpperCase()}
                </span>
                <span className="plist-text">
                  <b>{s?.name || m.display_name}</b>
                  <span>{s ? `${m.display_name}${m.user_id === uid ? ' (você)' : ''}` : m.character_id ? 'carregando a ficha…' : 'ainda sem personagem'}</span>
                  {s && <span className={'plist-hp ' + tone} title={`${s.hp}/${s.maxHp} PV${s.temp ? ` +${s.temp} temporários` : ''}`}><i style={{ width: pct + '%' }} /></span>}
                </span>
                {s && (
                  <span className="plist-badges">
                    {s.concentration && <Brain size={12} className="gold" aria-label={'Concentrando: ' + s.concentration} />}
                    {s.conditions.length > 0 && <span className="tag bad" title={s.conditions.map((x) => CONDITION_PT[x] || x).join(', ')}>{s.conditions.length}</span>}
                    <span className="plist-num">{s.hp}</span>
                  </span>
                )}
              </>
            );
            return (
              <li key={m.user_id}>
                {c ? (
                  <button className="plist-row" onClick={() => onOpen(c.id, m.user_id === uid)} title={m.user_id === uid ? 'Abrir a sua ficha' : `Ver a ficha de ${s?.name}`}>{body}</button>
                ) : (
                  <div className="plist-row idle">{body}</div>
                )}
              </li>
            );
          })}
          {players.length === 0 && <li className="plist-empty">Ninguém entrou ainda. O link de convite está em Ajustes.</li>}
        </ul>
      )}
    </section>
  );
}

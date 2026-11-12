import { useEffect, useRef, useState } from 'react';
import { Brain, Crown, List } from 'lucide-react';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { partySummary, type PartySummary } from '../../cloud/party';
import { useOnline } from '../../cloud/presence';
import { CONDITION_PT } from '../../engine/rules';
import { useParty } from './TableTab';
import type { CampaignProps } from '../Campaign';
import type { Character } from '../../data/types';
import type { Member } from '../../cloud/campaigns';

interface Seat { m: Member; c?: Character; s: PartySummary | null; on: boolean }

const pctOf = (s: PartySummary | null) => (s && s.maxHp > 0 ? Math.max(0, Math.min(1, s.hp / s.maxHp)) : 0);
const toneOf = (f: number) => (f > 0.5 ? '#4fbf6a' : f > 0.25 ? '#e0b341' : '#e5484d');

/**
 * The people at the table, as one fixed-height row of portraits above the chat (like the avatars
 * of a Discord call): a life ring, a dot for who has the table open, the name on hover, the sheet
 * on click. It never grows with the group, so the chat keeps its room; the full list with life
 * bars and conditions opens on top of the chat instead of pushing it.
 */
export function PartyList({ campaign, members, uid, onOpen }: CampaignProps & { onOpen: (characterId: string, mine: boolean) => void }) {
  const srd = useCampaignSrd(campaign.id, campaign.edition);
  const chars = useParty(members.map((m) => m.character_id).filter((x): x is string => !!x));
  const online = useOnline(campaign.id, uid);
  const [list, setList] = useState(false);
  const box = useRef<HTMLElement>(null);

  // the full list closes on a click elsewhere or Esc
  useEffect(() => {
    if (!list) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setList(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setList(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [list]);

  const gm = members.find((m) => m.role === 'gm');
  const seats: Seat[] = members.filter((m) => m.role === 'player').map((m) => {
    const c = m.character_id ? chars[m.character_id] : undefined;
    return { m, c, s: c && srd ? partySummary(c, srd) : null, on: online.has(m.user_id) };
  });
  const here = members.filter((m) => online.has(m.user_id)).length;
  const open = (x: Seat) => x.c && onOpen(x.c.id, x.m.user_id === uid);
  const hint = (x: Seat) => (x.s ? `${x.s.name} (${x.m.display_name}) · ${x.s.hp}/${x.s.maxHp} PV${x.s.conditions.length ? ' · ' + x.s.conditions.map((k) => CONDITION_PT[k] || k).join(', ') : ''}` : `${x.m.display_name}: ${x.m.character_id ? 'carregando a ficha' : 'ainda sem personagem'}`) + (x.on ? '' : ' · fora da mesa');

  return (
    <section ref={box} className="pbar" aria-label="Grupo">
      <div className="pbar-row">
        <div className="pbar-seats" onWheel={(e) => { if (e.deltaY && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) e.currentTarget.scrollLeft += e.deltaY; }}>
        {gm && (
          <span className={'pbar-seat gm' + (online.has(gm.user_id) ? ' on' : '')} title={`${gm.display_name} (mestre)${online.has(gm.user_id) ? '' : ' · fora da mesa'}`}>
            <span className="pbar-face"><Crown size={15} /></span>
          </span>
        )}
        {seats.map((x) => {
          const f = pctOf(x.s);
          return (
            <button key={x.m.user_id} className={'pbar-seat' + (x.on ? ' on' : '') + (x.c ? '' : ' idle')} title={hint(x)} aria-label={hint(x)} disabled={!x.c} onClick={() => open(x)}>
              <span className="pbar-face" style={x.c?.portrait ? { backgroundImage: `url(${x.c.portrait})` } : undefined}>
                {!x.c?.portrait && (x.s?.name || x.m.display_name).charAt(0).toUpperCase()}
              </span>
              {x.s && (
                <svg className="pbar-ring" viewBox="0 0 40 40" aria-hidden>
                  <circle cx="20" cy="20" r="18.5" className="bg" />
                  <circle cx="20" cy="20" r="18.5" pathLength={100} strokeDasharray={`${f * 100} 100`} style={{ stroke: toneOf(f) }} />
                </svg>
              )}
              {x.s && x.s.conditions.length > 0 && <span className="pbar-cond">{x.s.conditions.length}</span>}
            </button>
          );
        })}
        {seats.length === 0 && <span className="pbar-empty">Ninguém entrou ainda</span>}
        </div>
        <button className={'btn ghost sm pbar-more' + (list ? ' active' : '')} onClick={() => setList((v) => !v)} aria-expanded={list} title="Ver o grupo em lista">
          <List size={14} /> {here}/{members.length}
        </button>
      </div>

      {list && (
        <div className="pbar-pop" role="dialog" aria-label="Grupo">
          <div className="pbar-pop-head"><b>Grupo</b><span>{here} de {members.length} na mesa</span></div>
          <ul>
            {gm && (
              <li className="pbar-li">
                <span className={'pbar-dot' + (online.has(gm.user_id) ? ' on' : '')} />
                <span className="pbar-li-text"><b>{gm.display_name}</b><span>Mestre</span></span>
              </li>
            )}
            {seats.map((x) => {
              const f = pctOf(x.s);
              const row = (
                <>
                  <span className={'pbar-dot' + (x.on ? ' on' : '')} />
                  <span className="pbar-li-text">
                    <b>{x.s?.name || x.m.display_name}</b>
                    <span>{x.s ? `${x.m.display_name}${x.m.user_id === uid ? ' (você)' : ''}` : x.m.character_id ? 'carregando a ficha…' : 'ainda sem personagem'}</span>
                    {x.s && <span className="pbar-hp"><i style={{ width: f * 100 + '%', background: toneOf(f) }} /></span>}
                  </span>
                  {x.s && (
                    <span className="pbar-li-side">
                      {x.s.concentration && <Brain size={12} className="gold" aria-label={'Concentrando: ' + x.s.concentration} />}
                      {x.s.conditions.length > 0 && <span className="tag bad" title={x.s.conditions.map((k) => CONDITION_PT[k] || k).join(', ')}>{x.s.conditions.length}</span>}
                      <span className="pbar-num">{x.s.hp}/{x.s.maxHp}</span>
                    </span>
                  )}
                </>
              );
              return (
                <li key={x.m.user_id}>
                  {x.c ? <button className="pbar-li" onClick={() => { setList(false); open(x); }}>{row}</button> : <div className="pbar-li idle">{row}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

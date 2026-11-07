import { useEffect, useMemo, useState } from 'react';
import { HeartCrack, Heart, Shield, Eye, Brain, Skull } from 'lucide-react';
import type { Character } from '../../data/types';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { watchCharacters } from '../../cloud/sync';
import { gmApply } from '../../cloud/campaigns';
import { partySummary } from '../../cloud/party';
import { BAND_COLOR } from '../../engine/hpBand';
import { CONDITION_PT } from '../../engine/rules';
import { Modal, NumInput, useFlash } from '../../ui/ui';
import { Avatar } from '../Roster';
import { Sheet } from '../Sheet';
import type { CampaignProps } from '../Campaign';

/** Characters in play in a campaign, kept live. */
export function useParty(characterIds: string[]) {
  const [chars, setChars] = useState<Record<string, Character>>({});
  const key = characterIds.slice().sort().join(',');
  useEffect(() => {
    setChars({});
    return watchCharacters(key ? key.split(',') : [], (c) => setChars((s) => ({ ...s, [c.id]: c })));
  }, [key]);
  return chars;
}

export function TableTab({ campaign, members, isGm }: CampaignProps) {
  const srd = useCampaignSrd(campaign.id, campaign.edition);
  const flash = useFlash((s) => s.show);
  const players = members.filter((m) => m.role === 'player');
  const chars = useParty(players.map((m) => m.character_id).filter((x): x is string => !!x));
  const [amount, setAmount] = useState<Record<string, number | undefined>>({});
  const [view, setView] = useState<string | null>(null);
  const [conds, setConds] = useState<string | null>(null);
  const conditionIds = useMemo(() => srd?.conditions.filter((c) => c.id !== 'exhaustion').map((c) => c.id) ?? [], [srd]);

  if (!srd) return <div className="empty">Carregando regras…</div>;

  const act = async (c: Character, o: Parameters<typeof gmApply>[2], msg: string) => {
    try {
      await gmApply(c.id, campaign.id, { ...o, maxHp: partySummary(c, srd).maxHp });
      flash(msg);
      setAmount((a) => ({ ...a, [c.id]: undefined }));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      {players.length === 0 && <div className="panel empty">Nenhum jogador ainda. Mande o link de convite (aba Ajustes).</div>}
      <div className="cards">
        {players.map((m) => {
          const c = m.character_id ? chars[m.character_id] : undefined;
          if (!c) return (
            <div key={m.user_id} className="char-card" style={{ cursor: 'default' }}>
              <b>{m.display_name}</b>
              <div className="small muted">{m.character_id ? 'Carregando ficha…' : 'Ainda não escolheu personagem.'}</div>
            </div>
          );
          const s = partySummary(c, srd);
          const pct = Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100));
          return (
            <div key={m.user_id} className="char-card" style={{ cursor: 'default', borderColor: s.dying ? 'var(--bad)' : undefined }}>
              <div className="top">
                <Avatar name={s.name} portrait={c.portrait} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>{s.name}</div>
                  <div className="small muted">{s.summary} · {m.display_name}</div>
                </div>
                <button className="btn icon sm ghost" title="Ver ficha" onClick={() => setView(c.id)}><Eye size={15} /></button>
              </div>
              <div className="row small wrap">
                <span className="tag" style={{ color: BAND_COLOR[s.band] }}>{s.dying ? <><Skull size={12} /> Caído</> : <>PV {s.hp}/{s.maxHp}</>}{s.temp ? ` +${s.temp}` : ''}</span>
                <span className="tag"><Shield size={12} /> CA {s.ac}</span>
                <span className="tag"><Eye size={12} /> {s.passive}</span>
                {s.concentration && <span className="tag gold"><Brain size={12} /> {s.concentration}</span>}
                {s.dying && <span className="tag bad">TR morte {c.deathSaves.success}✓ {c.deathSaves.fail}✗</span>}
              </div>
              <div className={'hpbar' + (pct < 30 ? ' low' : pct < 60 ? ' mid' : '')}><span style={{ width: pct + '%' }} /></div>
              {s.conditions.length > 0 && <div className="cond-grid">{s.conditions.map((x) => <span key={x} className="cond on">{CONDITION_PT[x] || x}</span>)}</div>}
              {isGm && (
                <div className="col" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <NumInput value={amount[c.id]} min={0} placeholder="Valor" onChange={(n) => setAmount((a) => ({ ...a, [c.id]: n }))} style={{ width: 80 }} />
                    <button className="btn sm hurt" disabled={!amount[c.id]} onClick={() => act(c, { deltaHp: -amount[c.id]! }, `${s.name}: −${amount[c.id]} PV`)}><HeartCrack size={13} /> Dano</button>
                    <button className="btn sm heal" disabled={!amount[c.id]} onClick={() => act(c, { deltaHp: amount[c.id]! }, `${s.name}: +${amount[c.id]} PV`)}><Heart size={13} /> Cura</button>
                    <button className="btn sm" disabled={!amount[c.id]} onClick={() => act(c, { tempHp: amount[c.id]! }, `${s.name}: ${amount[c.id]} PV temporários`)}>Temp</button>
                  </div>
                  <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setConds(c.id)}>Condições…</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {view && chars[view] && (
        <Modal wide title={chars[view].name} onClose={() => setView(null)}>
          <Sheet edition={campaign.edition} id={view} character={chars[view]} readOnly />
        </Modal>
      )}
      {conds && chars[conds] && (
        <Modal title={`Condições · ${chars[conds].name}`} onClose={() => setConds(null)}>
          <div className="cond-grid">
            {conditionIds.map((id) => {
              const on = chars[conds].conditions.includes(id);
              return <button key={id} className={'cond' + (on ? ' on' : '')} onClick={() => act(chars[conds], on ? { remove: [id] } : { add: [id] }, `${CONDITION_PT[id] || id} ${on ? 'removida' : 'aplicada'}`)}>{CONDITION_PT[id] || id}</button>;
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

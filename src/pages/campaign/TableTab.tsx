import { useMemo, useState } from 'react';
import { HeartCrack, Heart, Shield, Brain, Skull } from 'lucide-react';
import type { Character } from '../../data/types';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { watchCharacters } from '../../cloud/sync';
import { useShared } from '../../cloud/shared';
import { gmApply } from '../../cloud/campaigns';
import { partySummary } from '../../cloud/party';
import { CONDITION_PT } from '../../engine/rules';
import { Modal, NumInput, go, useFlash } from '../../ui/ui';
import { Sheet } from '../Sheet';
import type { CampaignProps } from '../Campaign';
import { showError } from '../../ui/dialogs';

/** Characters in play in a campaign, kept live (one shared subscription for the whole page). */
export function useParty(characterIds: string[]) {
  const key = characterIds.slice().sort().join(',');
  return useShared<Record<string, Character>>(key ? 'party:' + key : null, {}, (set) =>
    watchCharacters(key.split(','), (c) => set((s) => ({ ...s, [c.id]: c }))),
  );
}

export function TableTab({ campaign, members, isGm, uid }: CampaignProps) {
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
      showError(e);
    }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      {players.length === 0 && !isGm && <div className="panel empty">Os outros jogadores aparecem aqui quando entrarem.</div>}
      <div className="party-tokens">
        {players.map((m) => {
          const c = m.character_id ? chars[m.character_id] : undefined;
          if (!c) {
            return (
              <div key={m.user_id} className="token empty-token" title={m.character_id ? 'Carregando ficha…' : 'Ainda não escolheu personagem'}>
                <div className="token-ring"><span className="token-face">?</span></div>
                <div className="token-name">{m.display_name}</div>
                <div className="token-sub">{m.character_id ? 'carregando…' : 'sem personagem'}</div>
              </div>
            );
          }
          const s = partySummary(c, srd);
          return (
            <button
              key={m.user_id}
              className={'token' + (s.dying ? ' dying' : '')}
              onClick={() => (m.user_id === uid ? go(`campanha/${campaign.id}/ficha`) : setView(c.id))}
              title={`${s.name} · ${s.summary} · ${m.display_name}`}
            >
              <HpRing hp={s.hp} max={s.maxHp} temp={s.temp} portrait={c.portrait} name={s.name} dying={s.dying} />
              <div className="token-name">{s.name}</div>
              <div className="token-sub">{m.display_name}</div>
              <div className="token-badges">
                <span title="Classe de Armadura"><Shield size={11} /> {s.ac}</span>
                {s.concentration && <span className="gold" title={'Concentrando: ' + s.concentration}><Brain size={11} /></span>}
                {s.conditions.length > 0 && <span className="bad" title={s.conditions.map((x) => CONDITION_PT[x] || x).join(', ')}>{s.conditions.length} cond.</span>}
              </div>
            </button>
          );
        })}
      </div>
      {isGm && players.some((m) => m.character_id && chars[m.character_id]) && <div className="tiny muted">Clique num personagem para ver a ficha e aplicar dano, cura ou condições.</div>}

      {view && chars[view] && (
        <Modal wide title={chars[view].name} onClose={() => setView(null)}>
          {isGm && <GmBar c={chars[view]} amount={amount[view]} setAmount={(n) => setAmount((x) => ({ ...x, [view]: n }))} act={act} onConds={() => setConds(view)} name={partySummary(chars[view], srd).name} />}
          <Sheet edition={campaign.edition} id={view} character={chars[view]} readOnly campaignId={campaign.id} />
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

/** Portrait with a circular HP ring; hovering shows the exact HP. */
function HpRing({ hp, max, temp, portrait, name, dying }: { hp: number; max: number; temp: number; portrait?: string; name: string; dying: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const color = dying ? 'var(--bad)' : pct > 0.6 ? 'var(--good)' : pct > 0.3 ? 'var(--warn)' : 'var(--bad)';
  const R = 44, C = 2 * Math.PI * R;
  return (
    <div className="token-ring">
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={R} className="ring-bg" />
        <circle cx="50" cy="50" r={R} className="ring-hp" style={{ stroke: color, strokeDasharray: `${C * pct} ${C}`, strokeOpacity: pct > 0 ? 1 : 0 }} />
      </svg>
      <span className="token-face" style={portrait ? { backgroundImage: `url(${portrait})` } : undefined}>{!portrait && (name.trim()[0]?.toUpperCase() || '?')}</span>
      <span className="token-hp">{dying ? <Skull size={20} /> : <>{hp}<small>/{max}</small></>}{temp ? <i>+{temp}</i> : null}</span>
    </div>
  );
}

function GmBar({ c, amount, setAmount, act, onConds, name }: { c: Character; amount?: number; setAmount: (n: number | undefined) => void; act: (c: Character, o: Parameters<typeof gmApply>[2], msg: string) => Promise<void>; onConds: () => void; name: string }) {
  return (
    <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
      <NumInput value={amount} min={0} placeholder="Valor" onChange={setAmount} style={{ width: 80 }} />
      <button className="btn sm hurt" disabled={!amount} onClick={() => act(c, { deltaHp: -amount! }, `${name}: −${amount} PV`)}><HeartCrack size={13} /> Dano</button>
      <button className="btn sm heal" disabled={!amount} onClick={() => act(c, { deltaHp: amount! }, `${name}: +${amount} PV`)}><Heart size={13} /> Cura</button>
      <button className="btn sm" disabled={!amount} onClick={() => act(c, { tempHp: amount! }, `${name}: ${amount} PV temporários`)}>Temp</button>
      <button className="btn sm ghost" onClick={onConds}>Condições…</button>
    </div>
  );
}

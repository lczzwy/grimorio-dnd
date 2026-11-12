import { useEffect, useRef, useState } from 'react';
import { Brain, Dices, X } from 'lucide-react';
import type { Edition } from '../../data/types';
import { useApp, useDice } from '../../store';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { concentrationDc, saveMod } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { useFlash } from '../../ui/ui';
import { changedHereRecently } from '../../ui/localHp';

/**
 * Damage from the GM while concentrating: the player gets the Constitution save to roll, with
 * the DC already worked out (half the damage, at least 10). Watches the player's own sheet, so it
 * works with the sheet closed. Damage the player typed in themselves is asked about by the sheet.
 */
export function ConcentrationAlert({ characterId, campaignId, edition }: { characterId: string; campaignId?: string; edition: Edition }) {
  const c = useApp((s) => s.characters.find((x) => x.id === characterId));
  const update = useApp((s) => s.updateCharacter);
  const srd = useCampaignSrd(campaignId, edition);
  const roll = useDice((s) => s.roll);
  const flash = useFlash((s) => s.show);
  const [ask, setAsk] = useState<{ dc: number; dmg: number; name: string } | null>(null);
  const prev = useRef<{ hp: number; id: string } | null>(null);

  const hp = c ? c.hp.current + c.hp.temp : 0;
  useEffect(() => {
    if (!c) return;
    const was = prev.current;
    prev.current = { hp, id: c.id };
    if (!was || was.id !== c.id) return;
    const dmg = was.hp - hp;
    if (dmg <= 0 || !c.concentration || c.hp.current <= 0 || changedHereRecently()) return;
    const name = srd?.spells.find((s) => s.id === c.concentration)?.name ?? c.concentration;
    setAsk({ dc: concentrationDc(dmg, c.edition), dmg, name });
    // only the life total matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hp, c?.id]);

  // concentration ended some other way: nothing to ask
  useEffect(() => { if (ask && !c?.concentration) setAsk(null); }, [ask, c?.concentration]);

  if (!ask || !c || !srd) return null;
  const con = saveMod(c, srd, 'con');
  const go = async () => {
    const r = await roll(`${c.name || 'Personagem'}: concentração em ${ask.name} (CD ${ask.dc})`, `1d20${fmtMod(con)}`);
    if (!r) return;
    const keep = r.total >= ask.dc;
    if (!keep) update(c.id, (d) => (d.concentration = undefined));
    setTimeout(() => flash(keep ? `Passou (${r.total} vs CD ${ask.dc}): continua concentrado.` : `Falhou (${r.total} vs CD ${ask.dc}): concentração em ${ask.name} perdida.`), 900);
    setAsk(null);
  };
  return (
    <div className="conc-alert" role="alert">
      <Brain size={18} />
      <span className="grow">Você levou <b>{ask.dmg}</b> de dano concentrado em <b>{ask.name}</b>. Teste de Constituição, CD <b>{ask.dc}</b>.</span>
      <button className="btn sm primary" onClick={go}><Dices size={14} /> Rolar {fmtMod(con)}</button>
      <button className="btn icon sm ghost" onClick={() => setAsk(null)} aria-label="Fechar sem rolar" title="Fechar sem rolar"><X size={14} /></button>
    </div>
  );
}

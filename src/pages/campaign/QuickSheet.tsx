import { useState } from 'react';
import { Brain, Dices, Heart, HeartCrack, Minus, Plus, Skull, Sparkles } from 'lucide-react';
import { useApp, useDice } from '../../store';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { ABILITIES, type Character, type SrdData } from '../../data/types';
import { ABILITY_PT, CONDITION_PT, SKILL_PT, armorClass, concentrationDc, initiative, maxHp, saveMod, skillMod, speed, spellSlots } from '../../engine/rules';
import { applyDamage, applyDeathSave, applyHeal, dropsToZero } from '../../engine/hp';
import { feetToMeters } from '../../engine/units';
import { fmtMod } from '../../engine/dice';
import { NumInput, useFlash } from '../../ui/ui';
import { AdvToggle } from '../../ui/Dice';
import { TurnPanel } from '../sheet/TurnPanel';
import { useSheetMigration } from '../sheet/useSheetMigration';

/**
 * The sheet in a fight, on one screen: life (damage and healing), defence, conditions, the turn's
 * options, spell slots, resources, saves and skills. Everything rolls to the table with a click.
 * The whole sheet is one button away for anything else.
 */
export function QuickSheet({ id, campaignId, edition }: { id: string; campaignId: string; edition: Character['edition'] }) {
  const c = useApp((s) => s.characters.find((x) => x.id === id));
  const update = useApp((s) => s.updateCharacter);
  const srd = useCampaignSrd(campaignId, edition);
  useSheetMigration(c, srd, c ? (fn) => update(c.id, fn) : undefined);
  if (!c) return <div className="empty">A ficha está sendo baixada da sua conta…</div>;
  if (!srd) return <div className="empty">Abrindo a ficha…</div>;
  return <Quick c={c} srd={srd} upd={(fn) => update(c.id, fn)} />;
}

function Quick({ c, srd, upd }: { c: Character; srd: SrdData; upd: (fn: (d: Character) => void) => void }) {
  const roll = useDice((s) => s.roll);
  const flash = useFlash((s) => s.show);
  const [amt, setAmt] = useState<number | undefined>();
  const [conc, setConc] = useState<number | null>(null);
  const who = c.name || 'Personagem';
  const max = maxHp(c, srd);
  const dying = c.hp.current <= 0;
  const concName = c.concentration ? srd.spells.find((s) => s.id === c.concentration)?.name ?? c.concentration : '';
  const conSave = saveMod(c, srd, 'con');
  const { slots, pact } = spellSlots(c, srd);
  const pct = max > 0 ? Math.max(0, Math.min(1, c.hp.current / max)) : 0;
  const tone = pct > 0.5 ? 'good' : pct > 0.25 ? 'mid' : 'low';

  const damage = () => {
    const n = amt || 0;
    if (!n) return;
    const down = dropsToZero(c, n);
    upd((d) => applyDamage(d, n));
    if (c.concentration) {
      if (down || dying) { setConc(null); flash(`Concentração em ${concName} perdida (0 PV).`); }
      else setConc(concentrationDc(n, c.edition));
    }
    setAmt(undefined);
  };
  const heal = () => {
    const n = amt || 0;
    if (!n) return;
    upd((d) => applyHeal(d, n, max));
    setAmt(undefined);
  };
  const rollConc = async () => {
    if (conc == null) return;
    const dc = conc;
    setConc(null);
    const r = await roll(`${who}: concentração em ${concName} (CD ${dc})`, `1d20${fmtMod(conSave)}`);
    if (!r) return;
    if (r.total < dc) {
      upd((d) => (d.concentration = undefined));
      setTimeout(() => flash(`Falhou (${r.total} vs CD ${dc}): concentração em ${concName} perdida.`), 900);
    } else setTimeout(() => flash(`Passou (${r.total} vs CD ${dc}): continua concentrado.`), 900);
  };
  const deathSave = async () => {
    const r = await roll(`${who}: salvaguarda contra a morte`, '1d20');
    if (r) upd((d) => applyDeathSave(d, r.rolls[0]));
  };

  const skills = [...srd.skills].sort((a, b) => (SKILL_PT[a.key] || a.name).localeCompare(SKILL_PT[b.key] || b.name));
  const resources = c.resources.filter((r) => r.max > 0);

  return (
    <div className="qs">
      {/* life and defence */}
      <section className={'qs-vitals' + (dying ? ' dying' : '')}>
        <div className="qs-hp">
          <div className="qs-hp-num"><b>{c.hp.current}</b><span>/ {max}</span>{c.hp.temp > 0 && <em title="PV temporários">+{c.hp.temp}</em>}</div>
          <div className={'qs-hp-bar ' + tone}><i style={{ width: pct * 100 + '%' }} /></div>
        </div>
        <div className="qs-hp-ctl">
          <NumInput value={amt} onChange={setAmt} min={0} placeholder="PV" className="input num qs-amt" />
          <button className="btn sm hurt" onClick={damage} title="Tirar PV (os temporários saem primeiro)"><HeartCrack size={14} /> Dano</button>
          <button className="btn sm heal" onClick={heal}><Heart size={14} /> Curar</button>
        </div>
        <div className="qs-stats">
          <span title={armorClass(c, srd).breakdown}><b>{armorClass(c, srd).value}</b>CA</span>
          <button className="qs-stat" onClick={() => roll(`${who}: Iniciativa`, `1d20${fmtMod(initiative(c, srd))}`)} title="Rolar iniciativa"><b>{fmtMod(initiative(c, srd))}</b>Inic.</button>
          <span title={`${speed(c, srd)} pés`}><b>{feetToMeters(speed(c, srd))}</b>m</span>
        </div>
      </section>

      {conc != null && c.concentration && (
        <button className="qs-alert" onClick={rollConc}><Brain size={15} /> Você levou dano: rolar concentração em <b>{concName}</b> (CD {conc}, CON {fmtMod(conSave)})</button>
      )}

      {dying && (
        <section className="qs-death">
          <Skull size={16} />
          <span className="grow"><b>Caído.</b> Sucessos {'◆'.repeat(c.deathSaves.success)}{'◇'.repeat(3 - c.deathSaves.success)} · Falhas {'◆'.repeat(c.deathSaves.fail)}{'◇'.repeat(3 - c.deathSaves.fail)}
            {c.deathSaves.success >= 3 && ' · estável'}{c.deathSaves.fail >= 3 && ' · morto'}</span>
          <button className="btn sm" onClick={deathSave} disabled={c.deathSaves.success >= 3 || c.deathSaves.fail >= 3}><Dices size={14} /> Salvaguarda</button>
        </section>
      )}

      {(c.concentration || c.conditions.length > 0 || c.exhaustion > 0) && (
        <section className="qs-tags">
          {c.concentration && (
            <span className="tag gold"><Brain size={12} /> {concName} <button className="qs-x" onClick={() => upd((d) => (d.concentration = undefined))} aria-label="Encerrar concentração" title="Encerrar concentração">×</button></span>
          )}
          {c.conditions.map((k) => (
            <span key={k} className="tag bad">{CONDITION_PT[k] || k} <button className="qs-x" onClick={() => upd((d) => (d.conditions = d.conditions.filter((x) => x !== k)))} aria-label={'Tirar ' + (CONDITION_PT[k] || k)} title="Tirar">×</button></span>
          ))}
          {c.exhaustion > 0 && <span className="tag bad">Exaustão {c.exhaustion}</span>}
        </section>
      )}

      <TurnPanel c={c} srd={srd} upd={upd} />

      {(slots.some((n) => n > 0) || pact || resources.length > 0) && (
        <section className="qs-row">
          {slots.map((n, i) => n > 0 && (
            <span key={i} className="qs-pips" title={`Espaços de ${i + 1}º círculo: clique para gastar ou devolver`}>
              <Sparkles size={12} /> {i + 1}º
              {Array.from({ length: n }, (_, j) => {
                const avail = j < n - c.slotsUsed[i];
                return <button key={j} className={'box' + (avail ? ' on' : ' used')} aria-label={`${i + 1}º círculo, espaço ${j + 1}${avail ? '' : ' (gasto)'}`} onClick={() => upd((d) => (d.slotsUsed[i] = avail ? d.slotsUsed[i] + 1 : Math.max(0, d.slotsUsed[i] - 1)))} />;
              })}
            </span>
          ))}
          {pact && (
            <span className="qs-pips" title="Magia de pacto">
              Pacto {pact.level}º
              {Array.from({ length: pact.count }, (_, j) => {
                const avail = j < pact.count - c.pactUsed;
                return <button key={j} className={'box diamond' + (avail ? ' on' : ' used')} aria-label={`Pacto, espaço ${j + 1}${avail ? '' : ' (gasto)'}`} onClick={() => upd((d) => (d.pactUsed = avail ? d.pactUsed + 1 : Math.max(0, d.pactUsed - 1)))} />;
              })}
            </span>
          )}
          {resources.map((r) => (
            <span key={r.uid} className="qs-res">
              {r.name}
              <button className="btn icon sm ghost" onClick={() => upd((d) => { const x = d.resources.find((y) => y.uid === r.uid); if (x) x.used = Math.min(x.max, x.used + 1); })} disabled={r.used >= r.max} aria-label={'Gastar ' + r.name}><Minus size={12} /></button>
              <b>{r.max - r.used}/{r.max}</b>
              <button className="btn icon sm ghost" onClick={() => upd((d) => { const x = d.resources.find((y) => y.uid === r.uid); if (x) x.used = Math.max(0, x.used - 1); })} disabled={r.used <= 0} aria-label={'Recuperar ' + r.name}><Plus size={12} /></button>
            </span>
          ))}
        </section>
      )}

      <section className="qs-rolls">
        <div className="qs-rolls-head"><b>Salvaguardas</b><span className="spacer" /><AdvToggle /></div>
        <div className="qs-saves">
          {ABILITIES.map((a) => {
            const v = saveMod(c, srd, a);
            return <button key={a} className={'qs-chip' + (c.saveProfs.includes(a) ? ' prof' : '')} onClick={() => roll(`${who}: salvaguarda de ${ABILITY_PT[a].name}`, `1d20${fmtMod(v)}`)} title={'Rolar salvaguarda de ' + ABILITY_PT[a].name}>{ABILITY_PT[a].short} <b>{fmtMod(v)}</b></button>;
          })}
        </div>
        <div className="qs-rolls-head"><b>Perícias</b></div>
        <div className="qs-skills">
          {skills.map((s) => {
            const v = skillMod(c, srd, s.key);
            const label = SKILL_PT[s.key] || s.name;
            return <button key={s.key} className={'qs-chip' + ((c.skills[s.key] || 0) >= 1 ? ' prof' : '')} onClick={() => roll(`${who}: ${label}`, `1d20${fmtMod(v)}`)} title={'Rolar ' + label}><span>{label}</span> <b>{fmtMod(v)}</b></button>;
          })}
        </div>
      </section>
    </div>
  );
}

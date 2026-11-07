import type { Ability, ProfLevel } from '../../data/types';
import { ABILITIES } from '../../data/types';
import { useDice } from '../../store';
import { ABILITY_PT, SKILL_PT, computeScores, hasJack, mods, passiveInsight, passiveInvestigation, passivePerception, saveMod, skillMod } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { NumInput } from '../../ui/ui';
import { AdvToggle } from '../../ui/Dice';
import type { SheetProps } from '../Sheet';
import { useState } from 'react';
import { Pencil } from 'lucide-react';

const NEXT: Record<string, ProfLevel> = { '0': 1, '1': 2, '2': 0, '0.5': 1 };

export function MainTab({ c, srd, upd }: SheetProps) {
  const roll = useDice((s) => s.roll);
  const scores = computeScores(c, srd);
  const m = mods(c, srd);
  const [edit, setEdit] = useState(false);
  const who = c.name || 'Personagem';

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="tiny muted grow roll-hint">Clique para rolar · bolinha = proficiente</span>
        <AdvToggle />
        <button className={'btn sm edit-only' + (edit ? ' active' : '')} onClick={() => setEdit(!edit)}><Pencil size={13} /> Editar atributos</button>
      </div>
      <div className="abilities">
        {ABILITIES.map((a) => (
          <div key={a} className="ability" onClick={() => !edit && roll(`${who}: teste de ${ABILITY_PT[a].name}`, `1d20${fmtMod(m[a])}`)}>
            <span className={'save' + (c.saveProfs.includes(a) ? ' on' : '')} title="Proficiente em salvaguarda" />
            <div className="an">{ABILITY_PT[a].short}</div>
            <div className="am">{fmtMod(m[a])}</div>
            {edit ? (
              <div className="col" style={{ gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                <label className="tiny faint">base</label>
                <NumInput value={c.base[a]} min={1} max={30} onChange={(n) => upd((d) => (d.base[a] = n))} style={{ width: 56 }} />
                <label className="tiny faint">bônus extra</label>
                <NumInput value={c.extra[a] || 0} min={-10} max={10} onChange={(n) => upd((d) => (d.extra[a] = n))} style={{ width: 56 }} />
              </div>
            ) : null}
            <div className="as">{scores[a]}</div>
          </div>
        ))}
      </div>

      <div className="sheet-grid">
        <div className="col" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-title"><h3>Salvaguardas</h3></div>
            <div className="list saves-list">
              {ABILITIES.map((a: Ability) => {
                const v = saveMod(c, srd, a);
                const on = c.saveProfs.includes(a);
                return (
                  <div key={a} className="li" onClick={() => roll(`${who}: salvaguarda de ${ABILITY_PT[a].name}`, `1d20${fmtMod(v)}`)}>
                    <button className={'pip' + (on ? ' p1' : '')} onClick={(e) => { e.stopPropagation(); upd((d) => (d.saveProfs = on ? d.saveProfs.filter((x) => x !== a) : [...d.saveProfs, a])); }} />
                    <span className="val">{fmtMod(v)}</span>
                    <span className="sv-name" data-s={ABILITY_PT[a].short}>{ABILITY_PT[a].name}</span>
                    <span />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel">
            <div className="panel-title"><h3>Sentidos passivos</h3></div>
            <div className="list small">
              <div className="row"><span className="grow">Percepção (Sabedoria)</span><b>{passivePerception(c, srd)}</b></div>
              <div className="row"><span className="grow">Investigação (Inteligência)</span><b>{passiveInvestigation(c, srd)}</b></div>
              <div className="row"><span className="grow">Intuição (Sabedoria)</span><b>{passiveInsight(c, srd)}</b></div>
            </div>
          </div>
          <div className="panel col edit-only">
            <div className="panel-title" style={{ marginBottom: 0 }}><h3>Proficiências</h3></div>
            <textarea className="textarea" style={{ minHeight: 80, fontSize: 14 }} value={c.proficienciesText} onChange={(e) => upd((d) => (d.proficienciesText = e.target.value))} placeholder="Armaduras, armas, ferramentas…" />
            <div className="panel-title" style={{ marginBottom: 0 }}><h3>Idiomas</h3></div>
            <textarea className="textarea" style={{ minHeight: 50, fontSize: 14 }} value={c.languagesText} onChange={(e) => upd((d) => (d.languagesText = e.target.value))} placeholder="Comum, Élfico…" />
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <h3>Perícias</h3>
            <span className="spacer" />
            <label className="row small muted" style={{ gap: 6, cursor: 'pointer' }} title="Metade da proficiência em perícias sem proficiência">
              <input type="checkbox" checked={hasJack(c)} onChange={(e) => upd((d) => (d.jackOfAllTrades = e.target.checked))} /> Pau para toda obra
            </label>
          </div>
          <div className="list" style={{ columns: '2 260px', columnGap: 18, display: 'block' }}>
            {[...srd.skills].sort((a, b) => (SKILL_PT[a.key] || a.name).localeCompare(SKILL_PT[b.key] || b.name)).map((s) => {
              const lvl = c.skills[s.key] || 0;
              const v = skillMod(c, srd, s.key);
              const label = SKILL_PT[s.key] || s.name;
              return (
                <div key={s.key} className="li" style={{ breakInside: 'avoid' }} onClick={() => roll(`${who}: ${label}`, `1d20${fmtMod(v)}`)} title={s.desc}>
                  <button
                    className={'pip' + (lvl === 2 ? ' p2' : lvl === 1 ? ' p1' : lvl === 0.5 ? ' p05' : '')}
                    title="Clique: proficiente → especialista → nenhum"
                    onClick={(e) => { e.stopPropagation(); upd((d) => { const n = NEXT[String(lvl)]; if (n) d.skills[s.key] = n; else delete d.skills[s.key]; }); }}
                  />
                  <span className="val">{fmtMod(v)}</span>
                  <span>{label} <span className="ab">({ABILITY_PT[s.ability].short})</span></span>
                  <span>{lvl === 2 && <span className="tag gold">esp.</span>}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

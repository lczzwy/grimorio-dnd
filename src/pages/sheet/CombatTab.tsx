import { useState } from 'react';
import { Heart, HeartCrack, Shield, Plus, Trash2, Skull, Dices, Zap, Minus, Brain } from 'lucide-react';
import type { CustomAttack } from '../../data/types';
import { ABILITIES } from '../../data/types';
import { useDice } from '../../store';
import { uid } from '../../engine/character';
import { type AttackLine, ABILITY_PT, CONDITION_PT, armorClass, concentrationDc, hitDice, maxHp, mods, saveMod, weaponAttacks, syncResources } from '../../engine/rules';
import { fmtMod, rollFormula } from '../../engine/dice';
import { Modal, NumInput, Markdown, useFlash } from '../../ui/ui';
import { AdvToggle } from '../../ui/Dice';
import type { SheetProps } from '../Sheet';
import { fullAttack as sharedFullAttack } from './attack';
import { TurnPanel } from './TurnPanel';

function HpRing({ cur, max, temp }: { cur: number; max: number; temp: number }) {
  const r = 56;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, cur / max));
  const tpct = Math.min(1, temp / max);
  const col = pct < 0.3 ? 'var(--bad)' : pct < 0.6 ? '#e2b33b' : 'var(--good)';
  return (
    <div className="hp-ring">
      <svg viewBox="0 0 132 132" width="100%" height="100%">
        <circle cx="66" cy="66" r={r} stroke="var(--bg)" strokeWidth="12" fill="none" />
        <circle cx="66" cy="66" r={r} stroke={col} strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} style={{ transition: 'stroke-dasharray .5s cubic-bezier(.2,.8,.2,1), stroke .3s' }} />
        {temp > 0 && <circle cx="66" cy="66" r={r - 12} stroke="var(--accent-2)" strokeWidth="5" fill="none" strokeDasharray={`${2 * Math.PI * (r - 12) * tpct} 999`} />}
      </svg>
      <div className="inner">
        <div>
          <div className="big">{cur}</div>
          <div className="max">/ {max}</div>
        </div>
      </div>
    </div>
  );
}

export function CombatTab({ c, srd, upd }: SheetProps) {
  const roll = useDice((s) => s.roll);
  const [amt, setAmt] = useState<number | undefined>();
  const [fx, setFx] = useState<'' | 'flash-dmg shake' | 'flash-heal'>('');
  const [atkEdit, setAtkEdit] = useState<CustomAttack | null>(null);
  const [condInfo, setCondInfo] = useState<string | null>(null);
  const [concCheck, setConcCheck] = useState<{ dc: number; dmg: number } | null>(null);
  const flash = useFlash((s) => s.show);
  const concName = c.concentration ? srd.spells.find((s) => s.id === c.concentration)?.name ?? c.concentration : '';
  const conSave = saveMod(c, srd, 'con');
  const rollConcentration = () => {
    if (!concCheck) return;
    const r = roll(`${who}: concentração em ${concName} (CD ${concCheck.dc})`, `1d20${fmtMod(conSave)}`);
    if (r.total < concCheck.dc) {
      upd((d) => (d.concentration = undefined));
      setTimeout(() => flash(`Falhou (${r.total} vs CD ${concCheck.dc}): concentração em ${concName} perdida.`), 900);
    } else setTimeout(() => flash(`Passou (${r.total} vs CD ${concCheck.dc}): continua concentrado.`), 900);
    setConcCheck(null);
  };
  const max = maxHp(c, srd);
  const who = c.name || 'Personagem';
  const attacks = weaponAttacks(c, srd);
  const m = mods(c, srd);
  const dying = c.hp.current <= 0;

  const pulse = (k: typeof fx) => { setFx(''); requestAnimationFrame(() => setFx(k)); setTimeout(() => setFx(''), 650); };

  const damage = (n: number) => {
    if (!n) return;
    pulse('flash-dmg shake');
    // concentration: dropping to 0 HP ends it; otherwise a CON save is required
    const tempAbsorbs = Math.min(c.hp.temp, n);
    const dropsTo0 = c.hp.current > 0 && c.hp.current - (n - tempAbsorbs) <= 0;
    upd((d) => {
      let left = n;
      const t = Math.min(d.hp.temp, left);
      d.hp.temp -= t;
      left -= t;
      if (d.hp.current <= 0 && left > 0) { d.deathSaves.fail = Math.min(3, d.deathSaves.fail + 1); return; }
      d.hp.current = Math.max(0, d.hp.current - left);
      if (d.hp.current <= 0) d.concentration = undefined;
    });
    if (c.concentration) {
      if (dropsTo0 || c.hp.current <= 0) flash(`Concentração em ${concName} perdida (0 PV).`);
      else setConcCheck({ dc: concentrationDc(n, c.edition), dmg: n });
    }
    setAmt(undefined);
  };
  const heal = (n: number) => {
    if (!n) return;
    pulse('flash-heal');
    upd((d) => {
      if (d.hp.current <= 0) d.deathSaves = { success: 0, fail: 0 };
      d.hp.current = Math.min(max, d.hp.current + n);
    });
    setAmt(undefined);
  };

  const fullAttack = (a: AttackLine, attackOnly = false) => sharedFullAttack(who, a, attackOnly);

  const deathSave = () => {
    const r = roll(`${who}: salvaguarda contra a morte`, '1d20');
    const n = r.rolls[0];
    upd((d) => {
      if (n === 20) { d.hp.current = 1; d.deathSaves = { success: 0, fail: 0 }; return; }
      if (n === 1) d.deathSaves.fail = Math.min(3, d.deathSaves.fail + 2);
      else if (n >= 10) d.deathSaves.success = Math.min(3, d.deathSaves.success + 1);
      else d.deathSaves.fail = Math.min(3, d.deathSaves.fail + 1);
    });
  };

  const resources = c.resources;

  return (
    <>
    <TurnPanel c={c} srd={srd} upd={upd} />
    <div className="sheet-grid-3">
      <div className="col" style={{ gap: 16 }}>
        {c.concentration && (
          <div className="panel row" style={{ borderColor: 'var(--gold)', padding: '10px 14px' }}>
            <Brain size={18} color="var(--gold)" />
            <span className="grow">Concentrado em <b>{concName}</b> <span className="small muted">· salvaguarda de CON {fmtMod(conSave)}</span></span>
            <button className="btn sm" onClick={() => upd((d) => (d.concentration = undefined))}>Encerrar</button>
          </div>
        )}
        {c.psychicFocus && (
          <div className="panel row" style={{ borderColor: 'var(--accent-2)', padding: '10px 14px' }}>
            <Brain size={18} color="var(--accent-2)" />
            <span className="grow">Foco psíquico: <b>{c.psychicFocus}</b></span>
            <button className="btn sm" onClick={() => upd((d) => (d.psychicFocus = undefined))}>Encerrar</button>
          </div>
        )}
        {/* HP */}
        <div className={'panel hp-panel ' + fx}>
          <div className="panel-title"><h3>Pontos de Vida</h3><span className="spacer" />
            <span className="small muted edit-only">Máx. bônus</span>
            <NumInput className="input num edit-only" value={c.hp.maxBonus} onChange={(n) => upd((d) => (d.hp.maxBonus = n))} style={{ width: 54 }} />
          </div>
          <div className="row" style={{ gap: 18, alignItems: 'center' }}>
            <HpRing cur={c.hp.current} max={max} temp={c.hp.temp} />
            <div className="col grow">
              <NumInput value={amt} onChange={setAmt} min={0} placeholder="Quantidade" />
              <div className="hp-controls">
                <button className="btn hurt" onClick={() => damage(amt || 0)}><HeartCrack size={16} /> Dano</button>
                <button className="btn heal" onClick={() => heal(amt || 0)}><Heart size={16} /> Curar</button>
              </div>
              <div className="row">
                <span className="small muted grow">PV temporários</span>
                <button className="btn icon sm" onClick={() => upd((d) => (d.hp.temp = Math.max(0, d.hp.temp - 1)))}><Minus size={13} /></button>
                <NumInput value={c.hp.temp} min={0} onChange={(n) => upd((d) => (d.hp.temp = n))} style={{ width: 54 }} />
                <button className="btn icon sm" onClick={() => upd((d) => (d.hp.temp = d.hp.temp + 1))}><Plus size={13} /></button>
              </div>
              <div className="row">
                <span className="small muted grow">PV atuais</span>
                <NumInput value={c.hp.current} min={0} max={max} onChange={(n) => upd((d) => (d.hp.current = n))} style={{ width: 54 }} />
              </div>
            </div>
          </div>
        </div>

        {/* death saves */}
        <div className="panel" style={dying ? { borderColor: 'var(--bad)', boxShadow: '0 0 30px rgba(239,91,91,.2)' } : undefined}>
          <div className="panel-title"><Skull size={15} /><h3>Salvaguardas contra a morte</h3><span className="spacer" />
            <button className="btn sm" onClick={deathSave} disabled={!dying}><Dices size={14} /> Rolar</button>
          </div>
          <div className="row" style={{ gap: 24 }}>
            <div className="row"><span className="small muted">Sucessos</span>
              <div className="boxes">{[0, 1, 2].map((i) => <button key={i} className={'box good diamond' + (c.deathSaves.success > i ? ' on' : '')} onClick={() => upd((d) => (d.deathSaves.success = d.deathSaves.success > i ? i : i + 1))} />)}</div>
            </div>
            <div className="row"><span className="small muted">Falhas</span>
              <div className="boxes">{[0, 1, 2].map((i) => <button key={i} className={'box bad diamond' + (c.deathSaves.fail > i ? ' on' : '')} onClick={() => upd((d) => (d.deathSaves.fail = d.deathSaves.fail > i ? i : i + 1))} />)}</div>
            </div>
          </div>
          {c.deathSaves.success >= 3 && <div className="tag good" style={{ marginTop: 10 }}>Estável</div>}
          {c.deathSaves.fail >= 3 && <div className="tag bad" style={{ marginTop: 10 }}>Morto… 💀</div>}
        </div>

        {/* hit dice */}
        <div className="panel">
          <div className="panel-title"><h3>Dados de Vida</h3></div>
          {hitDice(c, srd).map((h) => (
            <div key={h.die} className="row" style={{ marginBottom: 8 }}>
              <b style={{ width: 40 }}>{h.die}</b>
              <div className="boxes grow">
                {Array.from({ length: h.total }, (_, i) => (
                  <button key={i} className={'box' + (i < h.total - h.used ? ' on' : ' used')} title={i < h.total - h.used ? 'disponível' : 'gasto'}
                    onClick={() => upd((d) => (d.hitDiceUsed[h.die] = i < h.total - h.used ? h.used + 1 : Math.max(0, h.used - 1)))} />
                ))}
              </div>
              <button className="btn sm" disabled={h.used >= h.total} onClick={() => {
                const r = roll(`${who}: Dado de Vida`, `1${h.die}${fmtMod(m.con)}`);
                const gain = Math.max(0, r.total);
                upd((d) => { d.hitDiceUsed[h.die] = (d.hitDiceUsed[h.die] || 0) + 1; d.hp.current = Math.min(max, d.hp.current + gain); });
              }}>Gastar</button>
            </div>
          ))}
        </div>

        {/* conditions */}
        <div className="panel">
          <div className="panel-title"><h3>Condições</h3><span className="spacer" />
            <span className="small muted">Exaustão</span>
            <div className="boxes">{Array.from({ length: c.edition === '2024' ? 6 : 6 }, (_, i) => (
              <button key={i} className={'box bad' + (c.exhaustion > i ? ' on' : '')} style={{ width: 18, height: 18 }} onClick={() => upd((d) => (d.exhaustion = d.exhaustion > i ? i : i + 1))} title={`Nível ${i + 1}`} />
            ))}</div>
          </div>
          <div className="cond-grid">
            {srd.conditions.filter((x) => x.id !== 'exhaustion').map((k) => {
              const on = c.conditions.includes(k.id);
              return (
                <button key={k.id} className={'cond' + (on ? ' on' : '')}
                  onClick={() => upd((d) => (d.conditions = on ? d.conditions.filter((x) => x !== k.id) : [...d.conditions, k.id]))}
                  onContextMenu={(e) => { e.preventDefault(); setCondInfo(k.id); }}
                  title="Clique: ativar · botão direito: regras">
                  {CONDITION_PT[k.id] || k.name}
                </button>
              );
            })}
          </div>
          {c.conditions.length > 0 && (
            <div className="col small" style={{ marginTop: 10, gap: 6 }}>
              {c.conditions.map((id) => <button key={id} className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setCondInfo(id)}>ⓘ Ver regras: {CONDITION_PT[id] || id}</button>)}
            </div>
          )}
          {c.exhaustion > 0 && <div className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>
            Exaustão {c.exhaustion}: {c.edition === '2024' ? `−${c.exhaustion * 2} em testes de d20, −${c.exhaustion * 5} ft de deslocamento.` : ['Desvantagem em testes de atributo', 'Deslocamento pela metade', 'Desvantagem em ataques e salvaguardas', 'PV máximo pela metade', 'Deslocamento 0', 'Morte'].slice(0, c.exhaustion).join(' · ')}
          </div>}
        </div>
      </div>

      <div className="col" style={{ gap: 16 }}>
        {/* attacks */}
        <div className="panel">
          <div className="panel-title"><h3>Ataques</h3><span className="spacer" /><AdvToggle />
            <button className="btn sm" onClick={() => setAtkEdit({ uid: uid(), name: '', ability: 'str', proficient: true, bonus: 0, damage: '1d6', damageBonus: 0, addMod: true, type: '' })}><Plus size={14} /> Ataque</button>
          </div>
          {attacks.map((a) => (
            <div key={a.uid} className="attack">
              <div style={{ minWidth: 0 }}>
                <div className="an">{a.name}</div>
                <div className="small muted">{[a.type, a.range, a.mastery && `Maestria: ${a.mastery}`, a.notes].filter(Boolean).join(' · ')}</div>
              </div>
              <button className="roll-chip" onClick={(e) => fullAttack(a, e.shiftKey)} title="Ataque completo: rola o acerto e depois o dano (20 natural = crítico automático). Shift+clique: só o acerto.">
                <Zap size={14} /> {fmtMod(a.toHit)}
              </button>
              <div className="row" style={{ gap: 4 }}>
                <button className="roll-chip" onClick={(e) => roll(`${who}: ${a.name} (dano${e.shiftKey ? ', crítico' : ''})`, a.damage, { crit: e.shiftKey })} title="Rolar dano (Shift = crítico)">
                  {a.damage}
                </button>
                {a.altDamage && <button className="roll-chip" title="Duas mãos" onClick={() => roll(`${who}: ${a.name} (2 mãos)`, a.altDamage!)}>{a.altDamage}</button>}
                <button className="btn icon sm ghost" title="Crítico" onClick={() => roll(`${who}: ${a.name} CRÍTICO`, a.damage, { crit: true })}>💥</button>
                {a.custom && <button className="btn icon sm ghost" onClick={() => setAtkEdit(c.attacks.find((x) => x.uid === a.uid) || null)}>✎</button>}
              </div>
            </div>
          ))}
          <p className="small faint" style={{ margin: '6px 0 0' }}>⚡ rola o acerto e já rola o dano (no 20 natural, dano crítico automático; Shift+clique rola só o acerto). Armas equipadas no Inventário aparecem aqui sozinhas.</p>
        </div>

        {/* resources */}
        <div className="panel">
          <div className="panel-title"><h3>Recursos de classe</h3><span className="spacer" />
            <button className="btn sm ghost" onClick={() => upd((d) => (d.resources = syncResources(d, srd, uid)))} title="Recalcular com base na classe e nível">↻</button>
            <button className="btn sm" onClick={() => {
              const name = prompt('Nome do recurso (ex.: Usos de Varinha)');
              if (!name) return;
              const max = parseInt(prompt('Quantidade máxima?') || '1', 10) || 1;
              upd((d) => d.resources.push({ uid: uid(), name, max, used: 0, reset: 'long' }));
            }}><Plus size={14} /> Recurso</button>
          </div>
          {resources.length === 0 && <div className="empty small">Nenhum recurso. Clique em ↻ para gerar os da sua classe.</div>}
          {resources.map((r) => (
            <div key={r.uid} className="row" style={{ marginBottom: 10, alignItems: 'center' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                <div className="tiny faint">{r.reset === 'short' ? 'descanso curto' : r.reset === 'long' ? 'descanso longo' : 'manual'} · {r.max - r.used}/{r.max}</div>
              </div>
              {r.max <= 12 ? (
                <div className="boxes" style={{ maxWidth: 220, justifyContent: 'flex-end' }}>
                  {Array.from({ length: r.max }, (_, i) => (
                    <button key={i} className={'box' + (i < r.max - r.used ? ' on' : ' used')} onClick={() => upd((d) => { const x = d.resources.find((y) => y.uid === r.uid)!; x.used = i < r.max - r.used ? x.used + 1 : Math.max(0, x.used - 1); })} />
                  ))}
                </div>
              ) : (
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn icon sm" onClick={() => upd((d) => { const x = d.resources.find((y) => y.uid === r.uid)!; x.used = Math.min(x.max, x.used + 1); })}><Minus size={13} /></button>
                  <b className="mono" style={{ width: 54, textAlign: 'center' }}>{r.max - r.used}</b>
                  <button className="btn icon sm" onClick={() => upd((d) => { const x = d.resources.find((y) => y.uid === r.uid)!; x.used = Math.max(0, x.used - 1); })}><Plus size={13} /></button>
                </div>
              )}
              {!r.auto && <button className="btn icon sm ghost danger" onClick={() => upd((d) => (d.resources = d.resources.filter((y) => y.uid !== r.uid)))}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>

        <div className="panel edit-only">
          <div className="panel-title"><Shield size={15} /><h3>Defesa</h3></div>
          <div className="small muted" style={{ marginBottom: 8 }}>{armorClass(c, srd).breakdown}</div>
          <div className="row wrap">
            <label className="field" style={{ width: 110 }}>Bônus de CA<NumInput value={c.acBonus} onChange={(n) => upd((d) => (d.acBonus = n))} /></label>
            <label className="field" style={{ width: 110 }}>CA manual<NumInput value={c.acOverride || 0} min={0} onChange={(n) => upd((d) => (d.acOverride = n || undefined))} /></label>
            <label className="field" style={{ width: 110 }}>Bônus inic.<NumInput value={c.initBonus} onChange={(n) => upd((d) => (d.initBonus = n))} /></label>
            <label className="field" style={{ width: 110 }}>Bônus desloc.<NumInput value={c.speedBonus} onChange={(n) => upd((d) => (d.speedBonus = n))} /></label>
          </div>
          <p className="small faint" style={{ marginBottom: 0 }}>Ex.: Estilo de Luta Defesa = +1 de CA. CA manual 0 = automático.</p>
        </div>
      </div>

      {atkEdit && (
        <Modal title={atkEdit.name || 'Novo ataque'} onClose={() => setAtkEdit(null)} footer={<>
          {c.attacks.some((a) => a.uid === atkEdit.uid) && <button className="btn danger" onClick={() => { upd((d) => (d.attacks = d.attacks.filter((a) => a.uid !== atkEdit.uid))); setAtkEdit(null); }}><Trash2 size={14} /> Excluir</button>}
          <span className="spacer" />
          <button className="btn primary" disabled={!atkEdit.name || !rollFormula(atkEdit.damage).rolls.length} onClick={() => { upd((d) => { d.attacks = [...d.attacks.filter((a) => a.uid !== atkEdit.uid), atkEdit]; }); setAtkEdit(null); }}>Salvar</button>
        </>}>
          <div className="col">
            <label className="field">Nome<input className="input" value={atkEdit.name} onChange={(e) => setAtkEdit({ ...atkEdit, name: e.target.value })} placeholder="Ex.: Mordida, Raio de Fogo…" /></label>
            <div className="row wrap">
              <label className="field">Atributo
                <select className="select" value={atkEdit.ability} onChange={(e) => setAtkEdit({ ...atkEdit, ability: e.target.value as CustomAttack['ability'] })}>
                  {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_PT[a].name}</option>)}<option value="none">Nenhum</option>
                </select>
              </label>
              <label className="field">Bônus extra de acerto<NumInput value={atkEdit.bonus} onChange={(n) => setAtkEdit({ ...atkEdit, bonus: n })} /></label>
              <label className="row small" style={{ gap: 6, marginTop: 18 }}><input type="checkbox" checked={atkEdit.proficient} onChange={(e) => setAtkEdit({ ...atkEdit, proficient: e.target.checked })} /> Proficiente</label>
            </div>
            <div className="row wrap">
              <label className="field">Dano (dados)<input className="input" value={atkEdit.damage} onChange={(e) => setAtkEdit({ ...atkEdit, damage: e.target.value })} /></label>
              <label className="field">Bônus de dano<NumInput value={atkEdit.damageBonus} onChange={(n) => setAtkEdit({ ...atkEdit, damageBonus: n })} /></label>
              <label className="field">Tipo<input className="input" value={atkEdit.type} onChange={(e) => setAtkEdit({ ...atkEdit, type: e.target.value })} placeholder="Cortante, Fogo…" /></label>
              <label className="row small" style={{ gap: 6, marginTop: 18 }}><input type="checkbox" checked={atkEdit.addMod} onChange={(e) => setAtkEdit({ ...atkEdit, addMod: e.target.checked })} /> Somar modificador no dano</label>
            </div>
            <label className="field">Notas<input className="input" value={atkEdit.notes || ''} onChange={(e) => setAtkEdit({ ...atkEdit, notes: e.target.value })} /></label>
          </div>
        </Modal>
      )}
      {concCheck && (
        <Modal title="Teste de concentração" icon={<Brain color="var(--gold)" />} onClose={() => setConcCheck(null)}
          footer={<>
            <button className="btn danger" onClick={() => { upd((d) => (d.concentration = undefined)); setConcCheck(null); }}>Perdi a concentração</button>
            <button className="btn" onClick={() => setConcCheck(null)}>Mantive</button>
            <button className="btn primary" onClick={rollConcentration}><Dices size={15} /> Rolar CON {fmtMod(conSave)}</button>
          </>}>
          <p style={{ margin: 0 }}>Você levou <b>{concCheck.dmg}</b> de dano concentrado em <b>{concName}</b>.</p>
          <div className="row" style={{ margin: '14px 0 4px', gap: 18 }}>
            <div className="center"><div className="display" style={{ fontSize: 38, fontWeight: 900 }}>{concCheck.dc}</div><div className="tiny muted">CD</div></div>
            <div className="small muted">CD = o maior entre 10 e metade do dano{c.edition === '2024' ? ' (máximo 30)' : ''}. Se falhar, a magia termina.</div>
          </div>
        </Modal>
      )}
      {condInfo && (
        <Modal title={CONDITION_PT[condInfo] || condInfo} onClose={() => setCondInfo(null)}>
          <Markdown text={srd.conditions.find((x) => x.id === condInfo)?.desc} />
        </Modal>
      )}
    </div>
    </>
  );
}

/* ---------------- rests ---------------- */

export function RestModal({ c, srd, upd, kind, onClose, onDone }: SheetProps & { kind: 'short' | 'long'; onClose: () => void; onDone: (msg: string) => void }) {
  const roll = useDice((s) => s.roll);
  const [spend, setSpend] = useState<Record<string, number>>({});
  const max = maxHp(c, srd);
  const con = mods(c, srd).con;
  const hd = hitDice(c, srd);
  const recovering = c.resources.filter((r) => r.used > 0 && (kind === 'long' ? r.reset !== 'none' : r.reset === 'short'));

  const doRest = () => {
    if (kind === 'short') {
      let healed = 0;
      for (const [die, n] of Object.entries(spend)) for (let i = 0; i < n; i++) healed += Math.max(0, roll(`${c.name}: Dado de Vida`, `1${die}${fmtMod(con)}`).total);
      upd((d) => {
        for (const [die, n] of Object.entries(spend)) d.hitDiceUsed[die] = (d.hitDiceUsed[die] || 0) + n;
        d.hp.current = Math.min(max, d.hp.current + healed);
        d.resources.forEach((r) => r.reset === 'short' && (r.used = 0));
        d.pactUsed = 0;
      });
      onDone(`Descanso curto concluído${healed ? `: +${healed} PV` : ''}.`);
    } else {
      upd((d) => {
        d.hp.current = max;
        d.hp.temp = 0;
        d.deathSaves = { success: 0, fail: 0 };
        // regain half of total hit dice (min 1) — 2024 regains all
        const total = hd.reduce((s, h) => s + h.total, 0);
        let regain = d.edition === '2024' ? total : Math.max(1, Math.floor(total / 2));
        for (const h of hd) { const back = Math.min(regain, d.hitDiceUsed[h.die] || 0); d.hitDiceUsed[h.die] = (d.hitDiceUsed[h.die] || 0) - back; regain -= back; }
        d.slotsUsed = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        d.pactUsed = 0;
        d.resources.forEach((r) => r.reset !== 'none' && (r.used = 0));
        if (d.exhaustion > 0) d.exhaustion -= 1;
        d.concentration = undefined;
      });
      onDone('Descanso longo concluído: PV, espaços de magia e recursos restaurados.');
    }
  };

  return (
    <Modal title={kind === 'short' ? '☕ Descanso curto' : '🌙 Descanso longo'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={doRest}>Descansar</button></>}>
      {kind === 'short' ? (
        <div className="col">
          <p className="muted" style={{ margin: 0 }}>Gaste Dados de Vida para recuperar PV (cada um rola o dado + CON {fmtMod(con)}). PV: {c.hp.current}/{max}</p>
          {hd.map((h) => (
            <div key={h.die} className="row">
              <b style={{ width: 40 }}>{h.die}</b><span className="small muted grow">{h.total - h.used} disponíveis</span>
              <button className="btn icon sm" onClick={() => setSpend((s) => ({ ...s, [h.die]: Math.max(0, (s[h.die] || 0) - 1) }))}><Minus size={13} /></button>
              <b style={{ width: 24, textAlign: 'center' }}>{spend[h.die] || 0}</b>
              <button className="btn icon sm" onClick={() => setSpend((s) => ({ ...s, [h.die]: Math.min(h.total - h.used, (s[h.die] || 0) + 1) }))}><Plus size={13} /></button>
            </div>
          ))}
        </div>
      ) : (
        <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>PV voltam ao máximo ({max})</li>
          <li>{c.edition === '2024' ? 'Todos os Dados de Vida recuperados' : 'Recupera metade dos Dados de Vida'}</li>
          <li>Todos os espaços de magia restaurados</li>
          {c.exhaustion > 0 && <li>Exaustão reduzida em 1</li>}
        </ul>
      )}
      {recovering.length > 0 && <p className="small" style={{ marginBottom: 0 }}>Também recupera: {recovering.map((r) => r.name).join(', ')}{kind === 'short' && c.classes.some((x) => x.classId === 'warlock') ? ', espaços de Pacto' : ''}.</p>}
    </Modal>
  );
}

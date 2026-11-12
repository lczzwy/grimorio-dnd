import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpCircle, Check, ChevronRight, Dices, Sparkles, Star, TriangleAlert } from 'lucide-react';
import type { Ability } from '../../data/types';
import { ABILITIES } from '../../data/types';
import { useDice } from '../../store';
import { uid } from '../../engine/character';
import { choiceOptions, levelGains, powerLists } from '../../engine/classData';
import { applyLevel, hpAverage, multiclassBlocks, type LevelPlan } from '../../engine/levelUp';
import { ABILITY_PT, className, computeScores, maxHp, mods, totalLevel } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { Markdown, Modal } from '../../ui/ui';
import type { SheetProps } from '../Sheet';

const STEPS = ['Classe', 'Vida', 'O que você ganhou', 'Confirmar'];

/**
 * Leveling up in four short windows (like the 5e Companion): pick the class (or a new one, with
 * its requirements checked), the hit points, the picks of the level, then a summary to confirm.
 * Everything a level gives comes from the class data.
 */
export function LevelUpWizard({ c, srd, upd, onClose, onDone }: SheetProps & { onClose: () => void; onDone: (m: string) => void }) {
  const roll = useDice((s) => s.roll);
  const [step, setStep] = useState(0);
  const [classId, setClassId] = useState(c.classes[0]?.classId || srd.classes[0].id);
  const [override, setOverride] = useState(false);
  const [sub, setSub] = useState('');
  const [hp, setHp] = useState<LevelPlan['hp']>({ mode: 'avg' });
  const [rolling, setRolling] = useState(false);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [asi, setAsi] = useState<NonNullable<LevelPlan['asi']>>({ mode: 'plus2', a: 'str', b: 'dex' });

  const g = levelGains(c, srd, classId, sub || undefined);
  const blocks = multiclassBlocks(c, srd, classId);
  const con = mods(c, srd).con;
  const scores = computeScores(c, srd);
  const total = totalLevel(c) + (c.classes.length ? 1 : 0);
  const subs = srd.subclasses.filter((s) => s.class === classId);
  const lists = powerLists({ ...c, classes: [...c.classes.filter((e) => e.classId !== classId), { classId, level: g?.level || 1, subclassId: sub || c.classes.find((e) => e.classId === classId)?.subclassId }] }, srd);
  const plan: LevelPlan = { classId, subclassId: sub || undefined, hp, picks, asi: g?.asi ? asi : undefined };
  const preview = useMemo(() => {
    try { return g ? applyLevel(c, srd, plan, () => 'preview') : null; } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, srd, classId, sub, hp, picks, asi]);

  if (!g) return null;
  const avg = hpAverage(g.cls.hitDie);
  const die = hp.mode === 'roll' ? hp.rolled : avg;
  const needSub = g.subclass && subs.length > 0;
  const missing = g.choices.filter((ch) => (picks[ch.key] || []).length < Math.min(ch.choice.count, choiceOptions(c, srd, ch.choice, g.level).length + (picks[ch.key] || []).length));
  const asiReady = !g.asi || asi.mode === 'later' || (asi.mode === 'feat' ? !!asi.feat : asi.mode === 'split' ? asi.a !== asi.b : true);
  const can = [
    blocks.length === 0 || override,
    hp.mode === 'avg' || hp.rolled != null,
    (!needSub || !!sub) && missing.length === 0 && asiReady,
    true,
  ];

  const doRoll = async () => {
    setRolling(true);
    const r = await roll(`${c.name || 'Personagem'}: PV do nível ${total}`, `1d${g.cls.hitDie}`);
    setRolling(false);
    if (r) setHp({ mode: 'roll', rolled: r.total });
  };
  const toggle = (key: string, id: string, max: number) => setPicks((p) => {
    const cur = p[key] || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : max === 1 ? [id] : cur.length >= max ? cur : [...cur, id];
    return { ...p, [key]: next };
  });
  const confirm = () => {
    if (!preview) return;
    const { next, summary } = applyLevel(c, srd, plan, uid);
    upd((d) => Object.assign(d, next));
    onDone(`${c.name} subiu: ${summary}`);
  };

  const footer = (
    <>
      {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Voltar</button> : <button className="btn" onClick={onClose}>Cancelar</button>}
      <span className="spacer" />
      {step < 3 ? (
        <button className="btn primary" disabled={!can[step]} onClick={() => setStep(step + 1)}>Avançar <ArrowRight size={14} /></button>
      ) : (
        <button className="btn primary" disabled={!preview} onClick={confirm}><Check size={14} /> Confirmar e subir</button>
      )}
    </>
  );

  return (
    <Modal title={`Subir para o nível ${total}`} icon={<ArrowUpCircle color="var(--accent-2)" />} onClose={onClose} footer={footer}>
      <ol className="lu-steps" aria-label="Etapas">
        {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>{i < step ? <Check size={12} /> : i + 1}<span>{s}</span></li>)}
      </ol>

      {step === 0 && (
        <div className="col g10">
          <div className="tiny muted">Em qual classe você ganha o nível?</div>
          {c.classes.map((e) => (
            <button key={e.classId} className={'lu-option' + (classId === e.classId ? ' on' : '')} onClick={() => { setClassId(e.classId); setSub(''); setPicks({}); }}>
              <b>{className(e.classId, srd)}</b><span>nível {e.level} → <b>{e.level + 1}</b></span>
            </button>
          ))}
          <label className="field">Ou uma classe nova (multiclasse)
            <select className="select" value={c.classes.some((e) => e.classId === classId) ? '' : classId} onChange={(e) => { if (e.target.value) { setClassId(e.target.value); setSub(''); setPicks({}); setOverride(false); } }}>
              <option value="">—</option>
              {srd.classes.filter((k) => !c.classes.some((e) => e.classId === k.id)).map((k) => <option key={k.id} value={k.id}>{className(k.id, srd)}{k.custom ? ' (homebrew)' : ''}</option>)}
            </select>
          </label>
          {blocks.length > 0 && (
            <div className="lu-warn">
              <TriangleAlert size={16} />
              <div className="grow">
                <b>Requisito de multiclasse não cumprido.</b>
                <div className="small">{blocks.map((b) => `${className(b.cls.id, srd)} pede ${ABILITY_PT[b.ability].name} ${b.min} (você tem ${scores[b.ability]})`).join(' · ')}</div>
                <label className="row small g6" style={{ marginTop: 6 }}><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> O mestre liberou mesmo assim</label>
              </div>
            </div>
          )}
          {g.multiclass && <div className="small muted">Entrando por multiclasse você ganha o nível 1 da classe{g.cls.multiclass?.gains?.length ? ' e o que ela dá para quem chega por multiclasse' : ''}, mas não as salvaguardas dela.</div>}
        </div>
      )}

      {step === 1 && (
        <div className="col g10">
          <p className="small muted" style={{ margin: 0 }}>Cada nível dá mais pontos de vida: o dado de vida da classe (d{g.cls.hitDie}) mais o seu modificador de Constituição ({fmtMod(con)}). Pode rolar ou usar a média, que é segura.</p>
          <div className="seg lu-seg">
            <button className={hp.mode === 'avg' ? 'on' : ''} onClick={() => setHp({ mode: 'avg' })}>Média automática ({avg})</button>
            <button className={hp.mode === 'roll' ? 'on' : ''} onClick={() => setHp({ mode: 'roll', rolled: hp.mode === 'roll' ? hp.rolled : undefined })}>Rolar o dado</button>
          </div>
          {hp.mode === 'roll' && (
            <button className={'lu-die' + (rolling ? ' rolling' : '')} onClick={doRoll} disabled={rolling} aria-label={`Rolar d${g.cls.hitDie}`}>
              <Dices size={22} /> <span>{hp.rolled ?? `d${g.cls.hitDie}`}</span> <small>{hp.rolled == null ? 'clique para rolar' : 'rolar de novo'}</small>
            </button>
          )}
          <div className="lu-sum">
            <span>{die ?? '?'}</span><small>{hp.mode === 'roll' ? 'dado' : 'média'}</small>
            <span>{fmtMod(con)}</span><small>CON</small>
            <span>=</span>
            <b>+{die != null ? Math.max(1, die + con) : '?'} PV</b>
          </div>
          {preview && <div className="small muted">Vida máxima: {maxHp(c, srd)} → <b>{maxHp(preview.next, srd)}</b></div>}
        </div>
      )}

      {step === 2 && (
        <div className="col g12">
          <div className="tiny muted">{className(classId, srd)} nível {g.level}</div>
          {g.counters.length > 0 && (
            <div className="lu-counters">
              {g.counters.map((x) => <span key={x.def.id} className="tag" title={x.def.desc}>{x.def.name}: {x.from} → <b>{x.to}</b></span>)}
            </div>
          )}
          {needSub && (
            <label className="field">Escolha a subclasse <span className="small muted">(obrigatório)</span>
              <select className="select" value={sub} onChange={(e) => { setSub(e.target.value); setPicks({}); }}>
                <option value="">—</option>
                {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {g.features.filter((f) => !f.choice).map((f, i) => (
            <details key={f.name + i} className="feature">
              <summary><ChevronRight className="chev" size={16} /><span className="grow">{f.name}</span></summary>
              <div className="body"><Markdown text={f.desc} /></div>
            </details>
          ))}
          {g.choices.map((ch) => {
            const opts = choiceOptions(c, srd, ch.choice, g.level);
            const mine = picks[ch.key] || [];
            const listName = ch.choice.list === 'feats' ? 'talentos' : lists.find((l) => l.id === ch.choice.list)?.name || ch.choice.list;
            const feature = g.features.find((f) => f.name === ch.source);
            return (
              <div key={ch.key} className="panel col g8 lu-choice">
                <div className="row wrap g6">
                  <Sparkles size={15} color="var(--accent-2)" />
                  <b className="grow">{ch.choice.label || `${ch.source}: escolha ${ch.choice.count} (${listName})`}</b>
                  <span className={'tag' + (mine.length >= ch.choice.count ? ' good' : ' gold')}>{mine.length}/{ch.choice.count}</span>
                </div>
                {feature?.desc && <details className="feature"><summary><ChevronRight className="chev" size={16} />Sobre: {ch.source}</summary><div className="body"><Markdown text={feature.desc} /></div></details>}
                {!opts.length && !mine.length && <div className="small faint">Não há opções para escolher nesta lista (cadastre no Homebrew). Pode avançar.</div>}
                <div className="lu-picks">
                  {[...opts, ...mine.filter((id) => !opts.some((o) => o.id === id)).map((id) => ({ id, name: srd.powers?.find((p) => p.id === id)?.name || id, desc: srd.powers?.find((p) => p.id === id)?.desc || '' }))].map((o) => (
                    <details key={o.id} className={'lu-pick' + (mine.includes(o.id) ? ' on' : '')}>
                      <summary>
                        <input type={ch.choice.count === 1 ? 'radio' : 'checkbox'} name={ch.key} checked={mine.includes(o.id)} onChange={() => toggle(ch.key, o.id, ch.choice.count)} onClick={(e) => e.stopPropagation()} aria-label={'Escolher ' + o.name} />
                        <span className="grow">{o.name}</span>
                        <ChevronRight className="chev" size={14} />
                      </summary>
                      <div className="body small"><Markdown text={o.desc} /></div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })}
          {g.asi && (
            <div className="panel col g8" style={{ borderColor: 'var(--gold)' }}>
              <div className="row wrap g6"><Star size={14} /><b className="grow">Aumento de atributo</b>
                <div className="seg">
                  <button className={asi.mode === 'plus2' ? 'on' : ''} onClick={() => setAsi({ ...asi, mode: 'plus2' })}>+2 em um</button>
                  <button className={asi.mode === 'split' ? 'on' : ''} onClick={() => setAsi({ ...asi, mode: 'split' })}>+1 em dois</button>
                  <button className={asi.mode === 'feat' ? 'on' : ''} onClick={() => setAsi({ ...asi, mode: 'feat' })}>Talento</button>
                  <button className={asi.mode === 'later' ? 'on' : ''} onClick={() => setAsi({ ...asi, mode: 'later' })}>Depois</button>
                </div>
              </div>
              {(asi.mode === 'plus2' || asi.mode === 'split') && (
                <div className="row wrap g6">
                  {(['a', ...(asi.mode === 'split' ? ['b'] : [])] as ('a' | 'b')[]).map((k) => (
                    <select key={k} className="select" style={{ width: 'auto' }} value={asi[k]} onChange={(e) => setAsi({ ...asi, [k]: e.target.value as Ability })}>
                      {ABILITIES.map((a) => <option key={a} value={a} disabled={scores[a] >= 20}>{ABILITY_PT[a].name} ({scores[a]}{scores[a] >= 20 ? ', máximo' : ` → ${Math.min(20, scores[a] + (asi.mode === 'plus2' ? 2 : 1))}`})</option>)}
                    </select>
                  ))}
                  {asi.mode === 'split' && asi.a === asi.b && <span className="tag bad">Escolha dois atributos diferentes</span>}
                </div>
              )}
              {asi.mode === 'feat' && (
                <select className="select" value={asi.feat || ''} onChange={(e) => setAsi({ ...asi, feat: e.target.value || undefined })}>
                  <option value="">Escolha o talento…</option>
                  {srd.feats.filter((f) => f.type !== 'origin' || c.edition === '2014').map((f) => <option key={f.id} value={f.id}>{f.name}{f.prereq ? ` · requer ${f.prereq}` : ''}</option>)}
                </select>
              )}
              {asi.mode === 'later' && <div className="small muted">Você pode ajustar os atributos depois, em Editar ficha.</div>}
            </div>
          )}
          {!g.features.length && !g.counters.length && !g.asi && <div className="small faint">Este nível não lista nada novo na classe. Os números que dependem do nível sobem sozinhos.</div>}
          {!can[2] && <div className="small" style={{ color: 'var(--warn)' }}>{needSub && !sub ? 'Escolha a subclasse. ' : ''}{missing.length ? 'Faltam escolhas acima. ' : ''}{!asiReady ? 'Complete o aumento de atributo.' : ''}</div>}
        </div>
      )}

      {step === 3 && preview && (
        <div className="col g10">
          <div className="tiny muted">O que vai mudar na ficha</div>
          <ul className="lu-summary">
            <li><b>{className(classId, srd)}</b> passa para o nível {g.level}{g.multiclass ? ' (multiclasse)' : ''}; nível total {total}</li>
            <li>+{preview.hpGain} pontos de vida máximos</li>
            {sub && <li>Subclasse: {subs.find((s) => s.id === sub)?.name}</li>}
            {g.counters.map((x) => <li key={x.def.id}>{x.def.name}: {x.from} → {x.to}</li>)}
            {g.features.filter((f) => !f.choice).map((f, i) => <li key={f.name + i}>Nova característica: {f.name}</li>)}
            {g.choices.flatMap((ch) => (picks[ch.key] || []).map((id) => <li key={ch.key + id}>Escolha: {srd.powers?.find((p) => p.id === id)?.name || srd.feats.find((f) => f.id === id)?.name || id}</li>))}
            {g.asi && asi.mode !== 'later' && <li>{asi.mode === 'feat' ? `Talento: ${srd.feats.find((f) => f.id === asi.feat)?.name}` : asi.mode === 'plus2' ? `${ABILITY_PT[asi.a!].name} +2` : `${ABILITY_PT[asi.a!].name} +1 e ${ABILITY_PT[asi.b!].name} +1`}</li>}
          </ul>
          <div className="small muted">Se algo sair errado, dá para desfazer este nível na aba Classe.</div>
        </div>
      )}
    </Modal>
  );
}

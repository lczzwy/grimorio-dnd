import { useMemo, useState } from 'react';
import { storePortrait } from '../cloud/portraits';
import { Check, ChevronLeft, ChevronRight, Dices, Sparkles, ImagePlus, Axe, Music, Sun, Leaf, Swords, Hand, Shield, Crosshair, Sword, Flame, Eye, BookOpen, Star, type LucideIcon } from 'lucide-react';
import type { Ability, Character, Edition, SrdData } from '../data/types';
import { ABILITIES } from '../data/types';
import { useSrd } from '../data/srd';
import { newCharacter, uid } from '../engine/character';
import {
  ABILITY_PT, ALIGNMENTS, SKILL_PT, abilityMod, className, computeScores, findBackground, findClass, findSpecies,
  maxHp, speciesBonuses, speciesName, syncResources,
} from '../engine/rules';
import { fmtMod, rollFormula } from '../engine/dice';
import { useApp } from '../store';
import { Markdown, go, useFlash } from '../ui/ui';

const STEPS = ['Raça', 'Classe', 'Antecedente', 'Atributos', 'Perícias', 'Detalhes', 'Revisão'];
const STANDARD = [15, 14, 13, 12, 10, 8];
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

const CLASS_ICON: Record<string, LucideIcon> = {
  barbarian: Axe, bard: Music, cleric: Sun, druid: Leaf, fighter: Swords, monk: Hand,
  paladin: Shield, ranger: Crosshair, rogue: Sword, sorcerer: Flame, warlock: Eye, wizard: BookOpen,
};

/** Engraved line icon of a class (homebrew classes get a star). */
function ClassIcon({ id, size }: { id: string; size: number }) {
  const Ic = CLASS_ICON[id] || Star;
  return <Ic size={size} strokeWidth={1.5} style={{ verticalAlign: '-3px' }} aria-hidden />;
}

export async function fileToPortrait(file: File): Promise<string> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const r = Math.max(s / img.width, s / img.height);
  ctx.drawImage(img, (s - img.width * r) / 2, (s - img.height * r) / 2, img.width * r, img.height * r);
  // signed in: the picture goes to Supabase Storage and only its address is kept
  return storePortrait(cv.toDataURL('image/jpeg', 0.85));
}

/** Puts fixed starting gear (e.g. "1× Leather Armor") into the inventory when the item exists in the data. */
function grantEquipment(c: Character, srd: SrdData, lines: string[] = []) {
  for (const line of lines) {
    const m = /^(\d+)× (.+)$/.exec(line);
    if (!m) continue;
    const eq = srd.equipment.find((e) => e.name.toLowerCase() === m[2].toLowerCase());
    if (!eq) continue;
    c.inventory.push({ uid: uid(), refId: eq.id, name: eq.name, qty: +m[1], weight: eq.weight, weapon: eq.weapon, armor: eq.armor, equipped: !!(eq.weapon || eq.armor) });
  }
}

export function Creator({ edition }: { edition: Edition }) {
  const srd = useSrd(edition);
  const add = useApp((s) => s.addCharacter);
  const flash = useFlash((s) => s.show);
  const [step, setStep] = useState(0);
  const [c, setC] = useState<Character>(() => {
    const d = newCharacter(edition);
    ABILITIES.forEach((a) => (d.base[a] = 8));
    return d;
  });
  const [method, setMethod] = useState<'standard' | 'points' | 'roll' | 'manual'>('standard');
  const [assign, setAssign] = useState<Partial<Record<Ability, number>>>({});
  const [rolled, setRolled] = useState<number[]>([]);
  const [bgMode, setBgMode] = useState<'2-1' | '1-1-1'>('2-1');
  const [startLevel, setStartLevel] = useState(1);

  const upd = (fn: (d: Character) => void) => setC((prev) => { const d = structuredClone(prev); fn(d); return d; });

  const species = srd ? findSpecies(srd, c.speciesId) : undefined;
  const cls = srd ? findClass(srd, c.classes[0]?.classId) : undefined;
  const bg = srd ? findBackground(srd, c.backgroundId) : undefined;

  const pool = method === 'standard' ? STANDARD : method === 'roll' ? rolled : [];
  const spent = ABILITIES.reduce((s, a) => s + (POINT_COST[c.base[a]] ?? 0), 0);

  const bgSkills = bg?.skills || [];
  const classSkillPicks = Object.entries(c.skills).filter(([k, v]) => v && !bgSkills.includes(k)).map(([k]) => k);
  // the class picks N from its list; a custom background (2014) adds 2 skills of any kind
  const skillNeed = cls?.skillChoice?.choose ?? 0;
  const skillFrom = cls?.skillChoice?.from ?? [];
  const freeSkills = edition === '2014' && !c.backgroundId ? 2 : 0;
  const offList = classSkillPicks.filter((k) => !skillFrom.includes(k)).length;
  const skillsOk = !cls?.skillChoice || (classSkillPicks.length >= skillNeed && classSkillPicks.length <= skillNeed + freeSkills && offList <= freeSkills);

  const valid = useMemo(() => {
    if (!srd) return [false];
    return [
      !!c.speciesId && (!species?.bonusChoice || c.speciesChoice.length === species.bonusChoice.choose),
      !!c.classes[0],
      edition === '2014' ? true : !!c.backgroundId && Object.values(c.backgroundBonus).reduce((s, n) => s + (n || 0), 0) === 3,
      method === 'manual' || method === 'points' ? (method === 'points' ? spent <= 27 : true) : ABILITIES.every((a) => assign[a] != null),
      skillsOk,
      c.name.trim().length > 0,
      true,
    ];
  }, [srd, c, species, method, assign, spent, skillsOk, edition]);
  // why a step can't be left yet (shown under the buttons)
  const STEP_HINT = ['Escolha a raça e os atributos que ela pede.', 'Escolha a classe.', edition === '2024' ? 'Escolha o antecedente e distribua os 3 pontos de atributo dele.' : '', method === 'points' ? 'Use no máximo 27 pontos.' : 'Distribua todos os valores nos atributos.', `Escolha ${skillNeed} perícia(s) da lista da classe${freeSkills ? ` (e até ${freeSkills} livres do antecedente personalizado)` : ''}.`, 'Dê um nome ao personagem.', ''];

  if (!srd) return <main className="page"><div className="empty">Abrindo o grimório…</div></main>;

  const applyPool = (a: Ability, idx: number | undefined) => {
    const next = { ...assign };
    for (const k of ABILITIES) if (idx != null && next[k] === idx) delete next[k];
    if (idx == null) delete next[a];
    else next[a] = idx;
    setAssign(next);
    upd((d) => ABILITIES.forEach((k) => (d.base[k] = next[k] != null ? pool[next[k]!] : 8)));
  };
  const usedIdx = new Set(Object.values(assign) as number[]);

  const finish = () => {
    const d = structuredClone(c);
    d.classes[0].level = startLevel;
    if (cls) d.saveProfs = [...cls.saves];
    if (bg) {
      bg.skills?.forEach((s) => (d.skills[s] = 1));
      if (bg.tools?.length) d.proficienciesText = bg.tools.join(', ');
      if (bg.feat && srd.feats.some((f) => f.id === bg.feat!.id)) d.feats.push(bg.feat.id);
    }
    if (cls) {
      d.proficienciesText = [...cls.profs, d.proficienciesText].filter(Boolean).join(', ');
      grantEquipment(d, srd, cls.equipment);
    }
    if (bg) grantEquipment(d, srd, bg.equipment);
    d.languagesText = species?.languages || 'Comum';
    d.hp.current = maxHp(d, srd);
    d.resources = syncResources(d, srd, uid);
    d.createdAt = d.updatedAt = Date.now();
    add(d);
    flash(`${d.name} entrou na mesa!`);
    go(`${edition}/c/${d.id}`);
  };

  const scores = computeScores(c, srd);
  const sb = speciesBonuses(c, srd);

  return (
    <main className="page">
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn ghost sm" onClick={() => go(edition)}><ChevronLeft size={16} /> Voltar</button>
        <h1 className="grow" style={{ fontSize: 26 }}>Novo personagem</h1>
      </div>
      <div className="steps">
        {STEPS.map((s, i) => (
          <button key={s} className={'step' + (i === step ? ' on' : '') + (i < step && valid[i] ? ' done' : '')} onClick={() => setStep(i)}>
            <span className="num">{i < step && valid[i] ? <Check size={13} /> : i + 1}</span>
            {s === 'Raça' && edition === '2024' ? 'Espécie' : s}
          </button>
        ))}
      </div>

      {/* ---------- 1. species ---------- */}
      {step === 0 && (
        <div className="sheet-grid cols2">
          <div className="choice-grid">
            {srd.species.map((s) => (
              <button key={s.id} className={'choice' + (c.speciesId === s.id ? ' on' : '')} onClick={() => upd((d) => { d.speciesId = s.id; d.subraceId = s.subraces?.[0]?.id; d.speciesChoice = []; })}>
                {c.speciesId === s.id && <Check className="chk" size={18} />}
                <div className="ct">{speciesName(s.id, srd)}</div>
                <div className="cs">
                  {s.custom && <span className="tag gold" style={{ marginRight: 4 }}>homebrew</span>}
                  {(s.bonuses || []).map((b) => `${ABILITY_PT[b.ability].short} +${b.bonus}`).join(' · ') || `${s.size || ''} · ${s.speed ?? 30} ft`}
                </div>
              </button>
            ))}
          </div>
          <div className="panel">
            {!species ? <div className="empty">Escolha uma {edition === '2014' ? 'raça' : 'espécie'} para ver os detalhes.</div> : (
              <div className="col">
                <h2>{speciesName(species.id, srd)} <span className="faint small">({species.name})</span></h2>
                <div className="row wrap">
                  {species.size && <span className="tag">Tamanho: {species.size}</span>}
                  <span className="tag">Deslocamento: {species.speed ?? 30} ft</span>
                  {species.creatureType && <span className="tag">{species.creatureType}</span>}
                  {(species.bonuses || []).map((b) => <span key={b.ability} className="tag accent">{ABILITY_PT[b.ability].short} +{b.bonus}</span>)}
                </div>
                {species.bonusChoice && (
                  <div>
                    <div className="small muted mb6">Escolha {species.bonusChoice.choose} atributos para +{species.bonusChoice.bonus}:</div>
                    <div className="row wrap">
                      {species.bonusChoice.from.map((a) => {
                        const on = c.speciesChoice.includes(a);
                        return (
                          <button key={a} className={'btn sm' + (on ? ' active' : '')} onClick={() => upd((d) => {
                            d.speciesChoice = on ? d.speciesChoice.filter((x) => x !== a) : [...d.speciesChoice, a].slice(-species.bonusChoice!.choose);
                          })}>{ABILITY_PT[a].name}</button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!!species.subraces?.length && (
                  <label className="field">{edition === '2014' ? 'Sub-raça' : 'Linhagem / Ancestralidade'}
                    <select className="select" value={c.subraceId || ''} onChange={(e) => upd((d) => (d.subraceId = e.target.value || undefined))}>
                      {species.subraces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                {[...(species.traits || []), ...(species.subraces?.find((s) => s.id === c.subraceId)?.traits || [])].map((t) => (
                  <details key={t.name} className="feature">
                    <summary><ChevronRight className="chev" size={16} />{t.name}</summary>
                    <div className="body"><Markdown text={t.desc} /></div>
                  </details>
                ))}
                {species.age && <Markdown text={`**Idade.** ${species.age}`} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- 2. class ---------- */}
      {step === 1 && (
        <div className="sheet-grid cols2">
          <div className="col">
            <div className="choice-grid">
              {srd.classes.map((k) => (
                <button key={k.id} className={'choice' + (c.classes[0]?.classId === k.id ? ' on' : '')} onClick={() => upd((d) => { d.classes = [{ classId: k.id, level: 1 }]; d.skills = {}; })}>
                  {c.classes[0]?.classId === k.id && <Check className="chk" size={18} />}
                  <div className="ic"><ClassIcon id={k.id} size={26} /></div>
                  <div className="ct">{className(k.id, srd)}</div>
                  <div className="cs">d{k.hitDie} · {k.saves.map((a) => ABILITY_PT[a].short).join('/')}{k.custom ? ' · homebrew' : ''}</div>
                </button>
              ))}
            </div>
            <div className="panel row">
              <span className="grow small muted">Nível inicial</span>
              <select className="select" style={{ width: 90 }} value={startLevel} onChange={(e) => setStartLevel(+e.target.value)}>
                {Array.from({ length: 20 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
          </div>
          <div className="panel">
            {!cls ? <div className="empty">Escolha uma classe.</div> : (
              <div className="col">
                <h2><ClassIcon id={cls.id} size={20} /> {className(cls.id, srd)} <span className="faint small">({cls.name})</span></h2>
                <div className="row wrap">
                  <span className="tag accent">Dado de Vida d{cls.hitDie}</span>
                  <span className="tag">Salvaguardas: {cls.saves.map((a) => ABILITY_PT[a].name).join(', ')}</span>
                  {cls.spellcasting && <span className="tag gold">Conjurador ({ABILITY_PT[cls.spellcasting.ability].short})</span>}
                  {cls.primary && <span className="tag">Primário: {cls.primary}</span>}
                </div>
                <div className="small"><strong>Proficiências:</strong> <span className="muted">{cls.profs.join(', ')}</span></div>
                {cls.equipment?.length ? <div className="small"><strong>Equipamento:</strong> <span className="muted">{cls.equipment.join('; ')}</span></div> : null}
                {srd.subclasses.filter((s) => s.class === cls.id).length > 0 && (
                  <label className="field">Subclasse (pode escolher depois)
                    <select className="select" value={c.classes[0]?.subclassId || ''} onChange={(e) => upd((d) => (d.classes[0].subclassId = e.target.value || undefined))}>
                      <option value="">—</option>
                      {srd.subclasses.filter((s) => s.class === cls.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                <div className="tiny muted">Características até o nível {startLevel}</div>
                {cls.levels.filter((l) => l.level <= startLevel).flatMap((l) => (l.features || []).map((f) => (
                  <details key={l.level + f.name} className="feature">
                    <summary><ChevronRight className="chev" size={16} /><span className="tag">{l.level}</span> {f.name}</summary>
                    <div className="body"><Markdown text={f.desc} /></div>
                  </details>
                )))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- 3. background ---------- */}
      {step === 2 && (
        <div className="sheet-grid cols2">
          <div className="col">
            <div className="choice-grid">
              {srd.backgrounds.map((b) => (
                <button key={b.id} className={'choice' + (c.backgroundId === b.id ? ' on' : '')} onClick={() => upd((d) => { d.backgroundId = b.id; d.backgroundBonus = {}; })}>
                  {c.backgroundId === b.id && <Check className="chk" size={18} />}
                  <div className="ct">{b.name}</div>
                  <div className="cs">{(b.skills || []).map((s) => SKILL_PT[s] || s).join(', ')}</div>
                </button>
              ))}
              <button className={'choice' + (!c.backgroundId ? ' on' : '')} onClick={() => upd((d) => { d.backgroundId = undefined; d.backgroundBonus = {}; })}>
                <div className="ct">Personalizado</div>
                <div className="cs">Escolha perícias livres na próxima etapa (ex.: Nobre)</div>
              </button>
            </div>
            <p className="small faint">O SRD gratuito só traz {srd.backgrounds.length} antecedente(s). Outros (Nobre, Soldado…) podem ser cadastrados na aba Homebrew.</p>
          </div>
          <div className="panel col">
            {!bg ? (
              <>
                <h2>Antecedente personalizado</h2>
                <p className="muted small">Dê um nome ao antecedente e marque as perícias diretamente na ficha depois de criar.</p>
                {edition === '2024' && (
                  <BackgroundBonusPicker abilities={ABILITIES} c={c} upd={upd} mode={bgMode} setMode={setBgMode} />
                )}
              </>
            ) : (
              <>
                <h2>{bg.name}</h2>
                <div className="row wrap">
                  {bg.skills?.map((s) => <span key={s} className="tag accent">{SKILL_PT[s]}</span>)}
                  {bg.tools?.map((s) => <span key={s} className="tag">{s}</span>)}
                  {bg.feat && <span className="tag gold">Talento: {bg.feat.name}</span>}
                </div>
                {edition === '2024' && bg.abilities?.length ? (
                  <BackgroundBonusPicker abilities={bg.abilities} c={c} upd={upd} mode={bgMode} setMode={setBgMode} />
                ) : null}
                {bg.feature && <details className="feature" open><summary><ChevronRight className="chev" size={16} />{bg.feature.name}</summary><div className="body"><Markdown text={bg.feature.desc} /></div></details>}
                {bg.feat && <Markdown text={srd.feats.find((f) => f.id === bg.feat!.id)?.desc} />}
                {bg.equipment?.length ? <div className="small"><strong>Equipamento:</strong> <span className="muted">{bg.equipment.join('; ')}</span></div> : null}
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- 4. abilities ---------- */}
      {step === 3 && (
        <div className="col">
          <div className="row wrap">
            <div className="seg">
              {([['standard', 'Matriz padrão'], ['points', 'Compra de pontos'], ['roll', 'Rolar 4d6'], ['manual', 'Manual']] as const).map(([k, l]) => (
                <button key={k} className={method === k ? 'on' : ''} onClick={() => {
                  setMethod(k); setAssign({});
                  upd((d) => ABILITIES.forEach((a) => (d.base[a] = k === 'manual' ? 10 : 8)));
                }}>{l}</button>
              ))}
            </div>
            {method === 'roll' && (
              <button className="btn" onClick={() => {
                const sets = Array.from({ length: 6 }, () => {
                  const r = rollFormula('4d6').rolls.sort((a, b) => b - a);
                  return r[0] + r[1] + r[2];
                }).sort((a, b) => b - a);
                setRolled(sets); setAssign({});
              }}><Dices size={16} /> Rolar atributos</button>
            )}
            {method === 'points' && <span className={'tag ' + (spent > 27 ? 'bad' : 'accent')}>Pontos: {spent}/27</span>}
            {method === 'roll' && rolled.length > 0 && <span className="tag gold">{rolled.join(' · ')}</span>}
          </div>
          <div className="score-pick">
            {ABILITIES.map((a) => (
              <div key={a} className="score-box col" style={{ gap: 6, alignItems: 'center' }}>
                <div className="tiny muted">{ABILITY_PT[a].name}</div>
                {(method === 'standard' || method === 'roll') && (
                  <select className="select" style={{ textAlign: 'center' }} value={assign[a] ?? ''} onChange={(e) => applyPool(a, e.target.value === '' ? undefined : +e.target.value)}>
                    <option value="">—</option>
                    {pool.map((v, i) => {
                      const taken = usedIdx.has(i) && assign[a] !== i;
                      return <option key={i} value={i}>{v}{taken ? ' (trocar)' : ''}</option>;
                    })}
                  </select>
                )}
                {method === 'points' && (
                  <span className="stepper">
                    <button onClick={() => upd((d) => (d.base[a] = Math.max(8, d.base[a] - 1)))}>−</button>
                    <b style={{ width: 28, textAlign: 'center' }}>{c.base[a]}</b>
                    <button onClick={() => upd((d) => (d.base[a] = Math.min(15, d.base[a] + 1)))}>+</button>
                  </span>
                )}
                {method === 'manual' && (
                  <input className="input num" style={{ width: 70 }} type="number" min={1} max={30} value={c.base[a]} onChange={(e) => upd((d) => (d.base[a] = Math.max(1, Math.min(30, +e.target.value || 0))))} />
                )}
                <div className="sv">{scores[a]}</div>
                <div className="small"><b>{fmtMod(abilityMod(scores[a]))}</b>{(sb[a] || c.backgroundBonus[a]) ? <span className="faint"> (+{(sb[a] || 0) + (c.backgroundBonus[a] || 0)} bônus)</span> : null}</div>
              </div>
            ))}
          </div>
          {cls?.primary && <p className="small muted">Dica: {className(cls.id, srd)} usa principalmente <b>{cls.primary}</b>.</p>}
        </div>
      )}

      {/* ---------- 5. skills ---------- */}
      {step === 4 && (
        <div className="panel col">
          {cls?.skillChoice ? (
            <div className="row"><Sparkles size={16} /> <span>Escolha <b>{skillNeed}</b> perícias da lista de {className(cls.id, srd)}{freeSkills ? <> e até <b>{freeSkills}</b> livres (antecedente personalizado)</> : null}. Selecionadas: <b className={skillsOk ? '' : 'gold'}>{classSkillPicks.length}/{skillNeed + freeSkills}</b></span></div>
          ) : <div className="muted">Esta classe não tem escolha de perícias.</div>}
          <div className="choice-grid">
            {srd.skills.map((s) => {
              const fromBg = bgSkills.includes(s.key);
              const allowed = cls?.skillChoice?.from.includes(s.key);
              const on = !!c.skills[s.key] || fromBg;
              return (
                <button key={s.key} disabled={fromBg} className={'choice' + (on ? ' on' : '')} style={{ opacity: !allowed && !fromBg && !on && !freeSkills ? 0.45 : 1 }}
                  onClick={() => {
                    if (!c.skills[s.key] && cls?.skillChoice) {
                      const total = classSkillPicks.length;
                      if (total >= skillNeed + freeSkills) { flash(`Já escolheu ${skillNeed + freeSkills} perícia(s). Desmarque uma para trocar.`); return; }
                      if (!allowed && offList >= freeSkills) { flash(freeSkills ? `Só ${freeSkills} perícias podem ser de fora da lista da classe.` : `${SKILL_PT[s.key]} não está na lista de ${className(cls.id, srd)}.`); return; }
                    }
                    upd((d) => {
                      if (d.skills[s.key]) delete d.skills[s.key];
                      else d.skills[s.key] = 1;
                    });
                  }}>
                  {on && <Check className="chk" size={16} />}
                  <div className="ct" style={{ fontSize: 14 }}>{SKILL_PT[s.key]}</div>
                  <div className="cs">{ABILITY_PT[s.ability].short} {fromBg ? '· antecedente' : allowed ? '· classe' : freeSkills ? '· livre (antecedente)' : '· fora da classe'}</div>
                </button>
              );
            })}
          </div>
          <p className="small faint">Perícias de outras fontes (raça, talento, item) podem ser marcadas depois, na ficha.</p>
        </div>
      )}

      {/* ---------- 6. details ---------- */}
      {step === 5 && (
        <div className="sheet-grid cols2">
          <div className="panel col">
            <div className="row">
              <label style={{ cursor: 'pointer' }} title="Enviar retrato">
                <div className="avatar lg" style={c.portrait ? { backgroundImage: `url(${c.portrait})` } : undefined}>{!c.portrait && <ImagePlus size={28} />}</div>
                <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const p = await fileToPortrait(f); upd((d) => (d.portrait = p)); } }} />
              </label>
              <label className="field grow">Nome do personagem
                <input className="input" autoFocus value={c.name} onChange={(e) => upd((d) => (d.name = e.target.value))} placeholder="Ex.: Thoradin Martelo-de-Ferro" />
              </label>
            </div>
            <label className="field">Jogador<input className="input" value={c.player || ''} onChange={(e) => upd((d) => (d.player = e.target.value))} /></label>
            <label className="field">Tendência
              <select className="select" value={c.alignment || ''} onChange={(e) => upd((d) => (d.alignment = e.target.value))}>
                <option value="">—</option>{ALIGNMENTS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <div className="panel col">
            {(['personality', 'ideals', 'bonds', 'flaws'] as const).map((k) => {
              const label = { personality: 'Traços de personalidade', ideals: 'Ideais', bonds: 'Vínculos', flaws: 'Defeitos' }[k];
              const sugg = bg?.[k === 'personality' ? 'personality' : k] || [];
              return (
                <label key={k} className="field">{label}
                  <textarea className="textarea" style={{ minHeight: 60 }} value={c[k]} onChange={(e) => upd((d) => (d[k] = e.target.value))} />
                  {sugg.length > 0 && (
                    <button className="btn sm ghost self-start" onClick={() => upd((d) => (d[k] = sugg[Math.floor(Math.random() * sugg.length)]))}>
                      <Dices size={13} /> Sugestão do antecedente
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- 7. review ---------- */}
      {step === 6 && (
        <div className="panel col">
          <h2>{c.name || 'Sem nome'}</h2>
          <div className="muted">{speciesName(c.speciesId, srd)} · {cls ? `${className(cls.id, srd)} ${startLevel}` : 'sem classe'} · {bg?.name || 'Antecedente personalizado'}</div>
          <div className="score-pick">
            {ABILITIES.map((a) => (
              <div key={a} className="score-box"><div className="tiny muted">{ABILITY_PT[a].short}</div><div className="sv">{scores[a]}</div><b>{fmtMod(abilityMod(scores[a]))}</b></div>
            ))}
          </div>
          {STEPS.slice(0, 6).map((s, i) => !valid[i] && <div key={s} className="tag bad self-start">Falta completar: {s}</div>)}
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> Anterior</button>
        <span className="spacer" />
        {step < STEPS.length - 1 ? (
          <button className="btn primary" disabled={!valid[step]} onClick={() => setStep(step + 1)} title={valid[step] ? undefined : STEP_HINT[step]}>Próximo <ChevronRight size={16} /></button>
        ) : (
          <button className="btn primary" disabled={!valid.slice(0, 6).every(Boolean)} onClick={finish}><Sparkles size={16} /> Criar personagem</button>
        )}
      </div>
      {step < STEPS.length - 1 && !valid[step] && STEP_HINT[step] && <div className="small" style={{ marginTop: 8, textAlign: 'right', color: 'var(--warn)' }}>{STEP_HINT[step]}</div>}
    </main>
  );
}

function BackgroundBonusPicker({ abilities, c, upd, mode, setMode }: { abilities: Ability[]; c: Character; upd: (fn: (d: Character) => void) => void; mode: '2-1' | '1-1-1'; setMode: (m: '2-1' | '1-1-1') => void }) {
  const set = (a: Ability, n: number) => upd((d) => {
    if (mode === '1-1-1') { d.backgroundBonus = Object.fromEntries(abilities.map((x) => [x, 1])); return; }
    const next: Partial<Record<Ability, number>> = { ...d.backgroundBonus };
    for (const k of Object.keys(next) as Ability[]) if (next[k] === n || k === a) delete next[k];
    next[a] = n;
    d.backgroundBonus = next;
  });
  return (
    <div className="col g8">
      <div className="row">
        <span className="small muted grow">Aumento de atributo do antecedente</span>
        <div className="seg">
          <button className={mode === '2-1' ? 'on' : ''} onClick={() => { setMode('2-1'); upd((d) => (d.backgroundBonus = {})); }}>+2 / +1</button>
          <button className={mode === '1-1-1' ? 'on' : ''} onClick={() => { setMode('1-1-1'); upd((d) => (d.backgroundBonus = Object.fromEntries(abilities.map((x) => [x, 1])))); }}>+1 / +1 / +1</button>
        </div>
      </div>
      {mode === '2-1' && (
        <div className="row wrap">
          {abilities.map((a) => (
            <div key={a} className="row g4">
              <span className="small" style={{ width: 92 }}>{ABILITY_PT[a].name}</span>
              <button className={'btn sm' + (c.backgroundBonus[a] === 2 ? ' active' : '')} onClick={() => set(a, 2)}>+2</button>
              <button className={'btn sm' + (c.backgroundBonus[a] === 1 ? ' active' : '')} onClick={() => set(a, 1)}>+1</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

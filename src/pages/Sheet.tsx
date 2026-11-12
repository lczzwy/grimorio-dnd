import { useEffect, useState } from 'react';
import { feetToMeters } from '../engine/units';
import { Gamepad2, Pencil, ChevronLeft, Download, Trash2, ArrowUpCircle, LayoutGrid, Swords, Sparkles, Backpack, Scroll, Feather, Moon, Coffee, Star, Sparkle, Footprints } from 'lucide-react';
import type { Character, Edition, SrdData } from '../data/types';
import { useApp, useDice } from '../store';
import { go, download, useFlash, clickable } from '../ui/ui';
import { armorClass, classSummary, initiative, maxHp, pb, speed, speciesName, passivePerception, findBackground, spellcastingClasses } from '../engine/rules';
import { fmtMod } from '../engine/dice';
import { Avatar } from './Roster';
import { confirmAndDelete } from '../cloud/sync';
import { useCharacterCampaign, useTable } from '../cloud/rolls';
import { useCampaignSrd } from '../cloud/campaignHomebrew';
import { fileToPortrait } from './Creator';
import { MainTab } from './sheet/MainTab';
import { CombatTab, RestModal } from './sheet/CombatTab';
import { SpellsTab } from './sheet/SpellsTab';
import { InventoryTab } from './sheet/InventoryTab';
import { FeaturesTab } from './sheet/FeaturesTab';
import { LevelUpWizard } from './sheet/LevelUpWizard';
import { useSheetMigration } from './sheet/useSheetMigration';
import { CombatBar } from './sheet/CombatBar';
import { PowersTab } from './sheet/PowersTab';
import { powerLists } from '../engine/classData';
import type { PowerListDef } from '../data/types';
import { StoryTab } from './sheet/StoryTab';
import { TableDice } from '../dice3d/TableDice';

/** Wide screens (PC) show attributes in a fixed side column next to the tabs. */
const WIDE = '(min-width: 1200px)';
function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export interface SheetProps { c: Character; srd: SrdData; upd: (fn: (d: Character) => void) => void }

/** Fixed tabs; the power lists of the character's classes come in between (see sheetTabs). */
const BASE_TABS = {
  main: { label: 'Principal', icon: LayoutGrid },
  combat: { label: 'Combate', icon: Swords },
  cantrips: { label: 'Truques', icon: Sparkle },
  spells: { label: 'Magias', icon: Sparkles },
  cls: { label: 'Classe', icon: Scroll },
  origin: { label: 'Raça e origem', icon: Footprints },
  inv: { label: 'Inventário', icon: Backpack },
  notes: { label: 'Notas', icon: Feather },
} as const;
type BaseTab = keyof typeof BASE_TABS;
// names saved by the older tabs
const OLD_TAB: Record<string, string> = { feat: 'cls', story: 'notes' };

/** The tabs this character has: no Truques/Magias for who casts nothing, one tab per power list. */
function sheetTabs(c: Character, srd: SrdData) {
  const casts = spellcastingClasses(c, srd).length > 0;
  const has = (lvl: (n: number) => boolean) => c.spells.some((k) => { const sp = srd.spells.find((x) => x.id === k.id); return !!sp && lvl(sp.level); });
  const out: { k: string; label: string; icon: typeof Swords; list?: PowerListDef }[] = [];
  const add = (k: BaseTab) => out.push({ k, ...BASE_TABS[k] });
  add('main'); add('combat');
  if (casts || has((n) => n === 0)) add('cantrips');
  if (casts || has((n) => n > 0)) add('spells');
  for (const l of powerLists(c, srd)) out.push({ k: 'pw:' + l.id, label: l.name, icon: Sparkles, list: l });
  add('cls'); add('origin'); add('inv'); add('notes');
  return out;
}

/** `character` + `readOnly` show someone else's sheet (campaign table) without editing it. */
export function Sheet({ edition, id, character, readOnly, campaignId }: { edition: Edition; id: string; character?: Character; readOnly?: boolean; campaignId?: string }) {
  const stored = useApp((s) => s.characters.find((x) => x.id === id));
  const c = character ?? stored;
  const myCampaign = useCharacterCampaign(readOnly ? undefined : c?.id, c?.cloud);
  // inside a campaign page the page itself points the dice at the table
  useTable(readOnly || campaignId ? undefined : myCampaign);
  // rules = SRD + this browser's homebrew + the campaign's homebrew
  const srd = useCampaignSrd(campaignId ?? myCampaign, edition);
  const update = useApp((s) => s.updateCharacter);
  const roll = useDice((s) => s.roll);
  const flash = useFlash((s) => s.show);
  // "Modo jogo": hides character-building controls during a session (remembered on this device)
  const [gameMode, setGameMode] = useState(() => {
    try { const v = localStorage.getItem('game-mode'); return v === null ? !!campaignId : v === '1'; } catch { return false; }
  });
  const toggleGame = () => {
    setGameMode((g) => {
      try { localStorage.setItem('game-mode', g ? '0' : '1'); } catch { /* private mode */ }
      return !g;
    });
  };
  const [tab, setTab] = useState<string>(() => { const t = sessionStorage.getItem('tab') || 'main'; return OLD_TAB[t] || t; });
  const [rest, setRest] = useState<'short' | 'long' | null>(null);
  const [levelUp, setLevelUp] = useState(false);
  const wide = useWide();

  // older sheets: disciplines → powers, pools that follow the class table (only adds)
  useSheetMigration(c, srd, readOnly || !c ? undefined : (fn) => update(c.id, fn));

  if (!c) return <main className="page"><div className="empty">Personagem não encontrado. <a href={'#/' + edition}>Voltar</a></div></main>;
  if (!srd) return <main className="page"><div className="empty">Abrindo o grimório…</div></main>;

  const upd = (fn: (d: Character) => void) => (readOnly ? undefined : update(c.id, fn));
  const props: SheetProps = { c, srd, upd };
  const max = maxHp(c, srd);
  const ac = armorClass(c, srd);
  const init = initiative(c, srd);
  const bg = findBackground(srd, c.backgroundId);

  const tabs = sheetTabs(c, srd);
  // on PC the attributes live in the side column, so "Principal" opens Combate; a tab the
  // character no longer has (a power list of a class they left) falls back to Combate too
  const shown = (wide && tab === 'main') || !tabs.some((t) => t.k === tab) ? 'combat' : tab;
  const shownList = tabs.find((t) => t.k === shown)?.list;
  const pickTab = (k: string) => { setTab(k); try { sessionStorage.setItem('tab', k); } catch { /* private mode */ } };

  return (
    <main className={'page' + (gameMode ? ' game-mode' : '')} style={readOnly || campaignId ? { padding: 0 } : undefined}>
      {readOnly && <div className="tag accent" style={{ marginBottom: 10 }}>Somente leitura · ficha de outro jogador, atualizada ao vivo</div>}
      <div className="sheet-hero">
        <label style={{ cursor: 'pointer' }} title="Trocar retrato">
          <Avatar name={c.name} portrait={c.portrait} size="lg" />
          <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const p = await fileToPortrait(f); upd((d) => (d.portrait = p)); } }} />
        </label>
        <div className="min0">
          {!campaignId && <button className="btn ghost sm" style={{ marginLeft: -6, marginBottom: 2 }} onClick={() => go(edition)}><ChevronLeft size={14} /> Personagens</button>}
          <input className="name-input" readOnly={gameMode} value={c.name} placeholder="Nome do personagem" onChange={(e) => upd((d) => (d.name = e.target.value))} />
          <div className="row wrap small" style={{ marginTop: 4, paddingLeft: 6 }}>
            <span className="tag accent">{classSummary(c, srd)}</span>
            {c.speciesId && <span className="tag">{speciesName(c.speciesId, srd)}{c.subraceId ? ` · ${srd.species.find((s) => s.id === c.speciesId)?.subraces?.find((s) => s.id === c.subraceId)?.name ?? ''}` : ''}</span>}
            <span className="tag">{bg?.name || 'Antecedente próprio'}</span>
            {c.alignment && <span className="tag">{c.alignment}</span>}
            <button className={'tag clickable ' + (c.inspiration ? 'gold' : '')} onClick={() => upd((d) => (d.inspiration = !d.inspiration))} title="Inspiração">
              <Star size={12} fill={c.inspiration ? 'currentColor' : 'none'} /> {c.edition === '2024' ? 'Inspiração Heroica' : 'Inspiração'}
            </button>
          </div>
        </div>
        <button className={'hero-hp' + (c.hp.current <= max / 3 ? ' low' : '')} onClick={() => pickTab('combat')} title="Pontos de vida">
          <b>{c.hp.current}<small>/{max}</small></b>{c.hp.temp ? <i>+{c.hp.temp}</i> : null}<span>PV</span>
        </button>
        <div className="hero-actions row wrap" style={{ justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setRest('short')}><Coffee size={15} /> <span className="lbl">Descanso curto</span></button>
          <button className="btn sm" onClick={() => setRest('long')}><Moon size={15} /> <span className="lbl">Descanso longo</span></button>
          <button className="btn sm primary edit-only" onClick={() => setLevelUp(true)}><ArrowUpCircle size={15} /> <span className="lbl">Subir nível</span></button>
          <button className="btn icon sm edit-only" title="Exportar ficha" onClick={() => download(`${c.name || 'personagem'}.json`, c)}><Download size={15} /></button>
          <button className="btn icon sm danger edit-only" title="Excluir" onClick={async () => { if (await confirmAndDelete(c)) go(edition); }}><Trash2 size={15} /></button>
          {!readOnly && (
            <button className={'btn sm' + (gameMode ? ' active' : '')} onClick={toggleGame} title={gameMode ? 'Mostrar tudo para montar e editar a ficha' : 'Esconder o que não se usa durante a sessão'}>
              {gameMode ? <><Pencil size={15} /> <span className="lbl">Editar ficha</span></> : <><Gamepad2 size={15} /> <span className="lbl">Modo jogo</span></>}
            </button>
          )}
        </div>
      </div>

      <div className="sheet-top">
      <div className="vitals sheet-vitals">
        <div className="vital shield v-ac" title={ac.breakdown}><div className="v">{ac.value}</div><div className="l" data-s="CA">Classe de Armadura</div></div>
        <div className="vital click v-init" {...clickable(() => roll(`${c.name}: Iniciativa`, `1d20${fmtMod(init)}`))}><div className="v">{fmtMod(init)}</div><div className="l" data-s="Inic.">Iniciativa</div></div>
        <div className="vital v-speed"><div className="v" title={`${speed(c, srd)} pés`}>{feetToMeters(speed(c, srd))}<span style={{ fontSize: 14 }}> m</span></div><div className="l" data-s="Desloc.">Deslocamento</div></div>
        <div className="vital click v-hp" {...clickable(() => pickTab('combat'))}>
          <div className="v" style={{ color: c.hp.current <= max / 3 ? 'var(--bad)' : undefined }}>{c.hp.current}<span style={{ fontSize: 14, color: 'var(--muted)' }}>/{max}</span>{c.hp.temp ? <span style={{ fontSize: 14, color: 'var(--accent-2)' }}> +{c.hp.temp}</span> : null}</div>
          <div className="l">Pontos de Vida</div>
        </div>
        <div className="vital v-prof"><div className="v">{fmtMod(pb(c))}</div><div className="l" data-s="Profic.">Proficiência</div></div>
        <div className="vital v-pp"><div className="v">{passivePerception(c, srd)}</div><div className="l">Percepção Passiva</div></div>
      </div>
      <CombatBar {...props} onHp={() => pickTab('combat')} />
      </div>

      <div className={wide ? 'sheet-desk' : undefined}>
        {wide && <aside className="desk-side"><MainTab {...props} /></aside>}
        <div className="desk-main">
          <nav className="tabs sheet-tabs">
            {tabs.filter((t) => !(wide && t.k === 'main')).map((t) => (
              <button key={t.k} className={'tab' + (shown === t.k ? ' on' : '')} onClick={() => pickTab(t.k)}>
                <t.icon size={17} /> {t.label}
              </button>
            ))}
          </nav>

          {!wide && shown === 'main' && <MainTab {...props} />}
          {shown === 'combat' && <CombatTab {...props} />}
          {shown === 'cantrips' && <SpellsTab {...props} only="cantrips" />}
          {shown === 'spells' && <SpellsTab {...props} only="leveled" />}
          {shownList && <PowersTab {...props} list={shownList} />}
          {shown === 'cls' && <FeaturesTab {...props} scope="class" onLevelUp={() => setLevelUp(true)} />}
          {shown === 'origin' && <FeaturesTab {...props} scope="origin" onLevelUp={() => setLevelUp(true)} />}
          {shown === 'inv' && <InventoryTab {...props} />}
          {shown === 'notes' && <StoryTab {...props} />}
        </div>
      </div>

      {/* standalone sheet of a character in play: its table's dice fall here too */}
      {!readOnly && !campaignId && myCampaign && <TableDice campaignId={myCampaign} />}
      {rest && <RestModal {...props} kind={rest} onClose={() => setRest(null)} onDone={(m) => { setRest(null); flash(m); }} />}
      {levelUp && <LevelUpWizard {...props} onClose={() => setLevelUp(false)} onDone={(m) => { setLevelUp(false); flash(m); }} />}
    </main>
  );
}

import { useState } from 'react';
import { ChevronLeft, Download, Trash2, ArrowUpCircle, LayoutGrid, Swords, Sparkles, Backpack, Scroll, Feather, Moon, Coffee, Star } from 'lucide-react';
import type { Character, Edition, SrdData } from '../data/types';
import { useSrd } from '../data/srd';
import { useApp, useDice } from '../store';
import { go, download, useFlash } from '../ui/ui';
import { armorClass, classSummary, initiative, maxHp, pb, speed, speciesName, passivePerception, findBackground } from '../engine/rules';
import { fmtMod } from '../engine/dice';
import { Avatar } from './Roster';
import { confirmAndDelete } from '../cloud/sync';
import { fileToPortrait } from './Creator';
import { MainTab } from './sheet/MainTab';
import { CombatTab, RestModal } from './sheet/CombatTab';
import { SpellsTab } from './sheet/SpellsTab';
import { InventoryTab } from './sheet/InventoryTab';
import { FeaturesTab, LevelUpModal } from './sheet/FeaturesTab';
import { StoryTab } from './sheet/StoryTab';

export interface SheetProps { c: Character; srd: SrdData; upd: (fn: (d: Character) => void) => void }

const TABS = [
  { k: 'main', label: 'Principal', icon: LayoutGrid },
  { k: 'combat', label: 'Combate', icon: Swords },
  { k: 'spells', label: 'Magias', icon: Sparkles },
  { k: 'inv', label: 'Inventário', icon: Backpack },
  { k: 'feat', label: 'Habilidades', icon: Scroll },
  { k: 'story', label: 'História', icon: Feather },
] as const;

export function Sheet({ edition, id }: { edition: Edition; id: string }) {
  const srd = useSrd(edition);
  const c = useApp((s) => s.characters.find((x) => x.id === id));
  const update = useApp((s) => s.updateCharacter);
  const roll = useDice((s) => s.roll);
  const flash = useFlash((s) => s.show);
  const [tab, setTab] = useState<(typeof TABS)[number]['k']>(() => (sessionStorage.getItem('tab') as never) || 'main');
  const [rest, setRest] = useState<'short' | 'long' | null>(null);
  const [levelUp, setLevelUp] = useState(false);

  if (!c) return <main className="page"><div className="empty">Personagem não encontrado. <a href={'#/' + edition}>Voltar</a></div></main>;
  if (!srd) return <main className="page"><div className="empty">Abrindo o grimório…</div></main>;

  const upd = (fn: (d: Character) => void) => update(c.id, fn);
  const props: SheetProps = { c, srd, upd };
  const max = maxHp(c, srd);
  const ac = armorClass(c, srd);
  const init = initiative(c, srd);
  const bg = findBackground(srd, c.backgroundId);

  const pickTab = (k: typeof tab) => { setTab(k); try { sessionStorage.setItem('tab', k); } catch { /* private mode */ } };

  return (
    <main className="page">
      <div className="sheet-hero">
        <label style={{ cursor: 'pointer' }} title="Trocar retrato">
          <Avatar name={c.name} portrait={c.portrait} size="lg" />
          <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const p = await fileToPortrait(f); upd((d) => (d.portrait = p)); } }} />
        </label>
        <div style={{ minWidth: 0 }}>
          <button className="btn ghost sm" style={{ marginLeft: -6, marginBottom: 2 }} onClick={() => go(edition)}><ChevronLeft size={14} /> Personagens</button>
          <input className="name-input" value={c.name} placeholder="Nome do personagem" onChange={(e) => upd((d) => (d.name = e.target.value))} />
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
        <div className="hero-actions row wrap" style={{ justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setRest('short')}><Coffee size={15} /> Descanso curto</button>
          <button className="btn sm" onClick={() => setRest('long')}><Moon size={15} /> Descanso longo</button>
          <button className="btn sm primary" onClick={() => setLevelUp(true)}><ArrowUpCircle size={15} /> Subir nível</button>
          <button className="btn icon sm" title="Exportar ficha" onClick={() => download(`${c.name || 'personagem'}.json`, c)}><Download size={15} /></button>
          <button className="btn icon sm danger" title="Excluir" onClick={async () => { if (await confirmAndDelete(c)) go(edition); }}><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="vitals">
        <div className="vital shield" title={ac.breakdown}><div className="v">{ac.value}</div><div className="l">Classe de Armadura</div></div>
        <div className="vital click" onClick={() => roll(`${c.name}: Iniciativa`, `1d20${fmtMod(init)}`)}><div className="v">{fmtMod(init)}</div><div className="l">Iniciativa</div></div>
        <div className="vital"><div className="v">{speed(c, srd)}<span style={{ fontSize: 14 }}> ft</span></div><div className="l">Deslocamento</div></div>
        <div className="vital click" onClick={() => pickTab('combat')}>
          <div className="v" style={{ color: c.hp.current <= max / 3 ? 'var(--bad)' : undefined }}>{c.hp.current}<span style={{ fontSize: 14, color: 'var(--muted)' }}>/{max}</span>{c.hp.temp ? <span style={{ fontSize: 14, color: 'var(--accent-2)' }}> +{c.hp.temp}</span> : null}</div>
          <div className="l">Pontos de Vida</div>
        </div>
        <div className="vital"><div className="v">{fmtMod(pb(c))}</div><div className="l">Proficiência</div></div>
        <div className="vital"><div className="v">{passivePerception(c, srd)}</div><div className="l">Percepção Passiva</div></div>
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.k} className={'tab' + (tab === t.k ? ' on' : '')} onClick={() => pickTab(t.k)}>
            <t.icon size={17} /> {t.label}
          </button>
        ))}
      </nav>

      {tab === 'main' && <MainTab {...props} />}
      {tab === 'combat' && <CombatTab {...props} />}
      {tab === 'spells' && <SpellsTab {...props} />}
      {tab === 'inv' && <InventoryTab {...props} />}
      {tab === 'feat' && <FeaturesTab {...props} onLevelUp={() => setLevelUp(true)} />}
      {tab === 'story' && <StoryTab {...props} />}

      {rest && <RestModal {...props} kind={rest} onClose={() => setRest(null)} onDone={(m) => { setRest(null); flash(m); }} />}
      {levelUp && <LevelUpModal {...props} onClose={() => setLevelUp(false)} onDone={(m) => { setLevelUp(false); flash(m); }} />}
    </main>
  );
}

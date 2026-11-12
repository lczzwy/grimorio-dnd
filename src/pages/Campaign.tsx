import { useEffect, useState, type ReactNode } from 'react';
import { ScrollText, ChevronLeft, LayoutGrid, Swords, Dices, Hammer, Settings, Crown, MessageSquare, BookOpen, Users, Heart, Pin, PinOff, ChevronDown } from 'lucide-react';
import { FloatWindow } from '../ui/FloatWindow';
import { PartyList } from './campaign/PartyList';
import { useParty } from './campaign/TableTab';
import { Sheet } from './Sheet';
import type { Edition } from '../data/types';
import { useAuth } from '../cloud/auth';
import { useCampaign, type Campaign as CampaignT, type Member } from '../cloud/campaigns';
import { go } from '../ui/ui';
import { SettingsTab } from './campaign/SettingsTab';
import { TableTab } from './campaign/TableTab';
import { MySheetTab } from './campaign/MySheetTab';
import { QuickSheet } from './campaign/QuickSheet';
import { useAutoHideBar } from './campaign/useAutoHideBar';
import { ConcentrationAlert } from './sheet/ConcentrationAlert';
import { RollsTab } from './campaign/RollsTab';
import { CombatTab } from './campaign/CombatTab';
import { HomebrewTab } from './campaign/HomebrewTab';
import { ChatPanel } from './campaign/ChatPanel';
import { BestiaryTab } from './campaign/BestiaryTab';
import { TableBoard } from '../map/TableBoard';
import { TableDice } from '../dice3d/TableDice';
import { useToastQuiet } from '../ui/Dice';
import { InitiativeBar } from './campaign/InitiativeBar';
import { FirstSteps } from './campaign/FirstSteps';
import { useTable } from '../cloud/rolls';

export interface CampaignProps { campaign: CampaignT; members: Member[]; isGm: boolean; uid: string }

const TABS = [
  { k: 'ficha', label: 'Minha ficha', icon: ScrollText },
  { k: 'mesa', label: 'Mesa', icon: LayoutGrid },
  { k: 'chat', label: 'Chat', icon: MessageSquare },
  { k: 'combate', label: 'Combate', icon: Swords },
  { k: 'rolagens', label: 'Rolagens', icon: Dices },
  { k: 'bestiario', label: 'Bestiário', icon: BookOpen },
  { k: 'homebrew', label: 'Homebrew', icon: Hammer },
  { k: 'ajustes', label: 'Ajustes', icon: Settings },
] as const;
export type CampaignTab = (typeof TABS)[number]['k'];

const campaignTabs: Partial<Record<CampaignTab, (p: CampaignProps) => ReactNode>> = {
  mesa: (p) => <TableTab {...p} />,
  ficha: (p) => <MySheetTab {...p} />,
  rolagens: (p) => <RollsTab {...p} />,
  chat: (p) => <div className="camp-chat-tab"><ChatPanel {...p} /></div>,
  combate: (p) => <CombatTab {...p} />,
  homebrew: (p) => <HomebrewTab {...p} />,
  bestiario: (p) => <BestiaryTab {...p} />,
  ajustes: (p) => <SettingsTab {...p} />,
};

/** PC keeps the chat docked on the right; phones get it as a tab. */
const WIDE = '(min-width: 1100px)';
function useWideChat() {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function Campaign({ id, tab = 'mesa' }: { id: string; tab?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { campaign, members, isGm, loading, error } = useCampaign(id);
  const wide = useWideChat();
  // the dice table and the chat show results here; the pop-up stays only on the character sheet tab
  useEffect(() => {
    useToastQuiet.getState().setQuiet(tab !== 'ficha');
    return () => useToastQuiet.getState().setQuiet(false);
  }, [tab]);
  useTable(campaign?.id, isGm);

  useEffect(() => {
    if (campaign) document.documentElement.dataset.ed = campaign.edition;
  }, [campaign]);
  useEffect(() => {
    if (!authLoading && !user) go(`conta?next=${encodeURIComponent('campanha/' + id)}`);
  }, [authLoading, user, id]);

  if (!user || loading) return <main className="page"><div className="empty">Abrindo a campanha…</div></main>;
  if (error || !campaign) return <main className="page"><div className="panel empty">{error || 'Campanha não encontrada.'} <button className="btn sm" onClick={() => go('campanhas')}>Voltar</button></div></main>;

  // the bestiary is the GM's private library
  const allowed = (k: string) => !(k === 'ficha' && isGm) && !(k === 'bestiario' && !isGm) && !(k === 'chat' && wide);
  const current = (TABS.some((t) => t.k === tab) && allowed(tab) ? tab : 'mesa') as CampaignTab;
  const body = campaignTabs[current];
  const props: CampaignProps = { campaign, members, isGm, uid: user.id };

  const header = (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => go('campanhas')}><ChevronLeft size={14} /> Campanhas</button>
        <h1 className="grow" style={{ fontSize: 28 }}>{campaign.name}</h1>
        <span className="ed-chip">D&D {campaign.edition}</span>
        {isGm && <span className="tag gold"><Crown size={12} /> Você é o mestre</span>}
      </div>
      <nav className="tabs">
        {TABS.filter((t) => allowed(t.k)).map((t) => (
          <button key={t.k} className={'tab' + (current === t.k ? ' on' : '')} onClick={() => go(`campanha/${id}/${t.k}`)}>
            <t.icon size={17} /> {t.label}
          </button>
        ))}
      </nav>
    </>
  );
  const content = (
    <>
      {current === 'mesa' ? (
        <>
          <FirstSteps {...props} />
          <TableBoard campaignId={campaign.id} isGm={isGm} uid={props.uid} members={props.members} />
        </>
      ) : (
        // other tabs keep their content at the top; rolls still show, thrown over the screen
        <TableDice campaignId={campaign.id} variant="overlay" />
      )}
      <InitiativeBar {...props} />
      <MyConcentration {...props} />
      {body ? body(props) : <div className="panel empty">Em construção.</div>}
    </>
  );

  // PC on the table tab: the whole screen is the table (map + chat), the rest floats on top
  if (wide && current === 'mesa') return <TableMode {...props} />;

  // PC: the chat takes the whole right side from the top, like a virtual tabletop
  if (wide) {
    return (
      <main className="page">
        <div className="camp-wrap">
          <div className="min0">{header}{content}</div>
          <aside className="camp-chat"><ChatPanel {...props} /></aside>
        </div>
      </main>
    );
  }
  return (
    <main className="page">
      {header}
      {content}
    </main>
  );
}

/**
 * "Modo mesa": the site chrome goes away and the map takes every pixel left of the chat.
 * A thin bar keeps the campaign tabs as icons; the sheet and the party open as floating windows.
 */
export function TableMode(props: CampaignProps) {
  const { campaign, isGm } = props;
  const [sheet, setSheet] = useState(false);
  const [party, setParty] = useState(false);
  // another player's sheet, opened from the party list (read-only)
  const [peek, setPeek] = useState<string | null>(null);
  useEffect(() => {
    document.documentElement.dataset.tablemode = '';
    return () => { delete document.documentElement.dataset.tablemode; };
  }, []);
  // F opens and closes the sheet (not while typing in the chat or a field)
  useEffect(() => {
    if (isGm) return;
    const k = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal-back')) return;
      e.preventDefault();
      setSheet((v) => !v);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [isGm]);
  const tabs = TABS.filter((t) => t.k !== 'mesa' && t.k !== 'chat' && t.k !== 'ficha' && !(t.k === 'bestiario' && !isGm));
  const topBar = useAutoHideBar();
  return (
    <div className={'tm' + (topBar.hidden ? ' bar-hidden' : '')}>
      <header className="tm-bar" ref={topBar.bar}>
        <button className="btn ghost sm icon" title="Voltar às campanhas" aria-label="Voltar às campanhas" onClick={() => go('campanhas')}><ChevronLeft size={16} /></button>
        <b className="tm-name" title={campaign.name}>{campaign.name}</b>
        {isGm && <Crown size={13} className="tm-crown" aria-label="Você é o mestre" />}
        <span className="tm-sep" />
        {!isGm && <button className={'btn ghost sm icon' + (sheet ? ' active' : '')} onClick={() => setSheet((v) => !v)} title="Minha ficha (tecla F)" aria-label="Abrir ou fechar a sua ficha" aria-keyshortcuts="F" aria-pressed={sheet}><ScrollText size={16} /></button>}
        {isGm && <button className={'btn ghost sm icon' + (party ? ' active' : '')} onClick={() => setParty((v) => !v)} title="Vida e condições: dano, cura e condições nos personagens" aria-label="Vida e condições dos personagens" aria-pressed={party}><Heart size={16} /></button>}
        <span className="spacer" />
        {tabs.map((t) => (
          <button key={t.k} className="btn ghost sm icon" title={t.label} aria-label={t.label} onClick={() => go(`campanha/${campaign.id}/${t.k}`)}><t.icon size={16} /></button>
        ))}
        {topBar.canHover && (
          <button className={'btn ghost sm icon' + (topBar.pinned ? ' active' : '')} onClick={topBar.togglePin} aria-pressed={topBar.pinned}
            title={topBar.pinned ? 'Barra fixa: clique para ela se esconder sozinha' : 'Fixar a barra (ela se esconde sozinha quando ninguém mexe)'} aria-label="Fixar a barra">
            {topBar.pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
        )}
      </header>
      {topBar.hidden && <button className="tm-reveal" onClick={topBar.show} onMouseEnter={topBar.show} title="Mostrar a barra" aria-label="Mostrar a barra de cima"><ChevronDown size={14} /></button>}
      <div className="tm-stage">
        <TableBoard campaignId={campaign.id} isGm={isGm} uid={props.uid} members={props.members} />
        <div className="tm-init"><InitiativeBar {...props} /></div>
        <MyConcentration {...props} />
        <div className="tm-first"><FirstSteps {...props} /></div>
        {sheet && <FloatWindow id="sheet" title="Minha ficha" icon={<ScrollText size={15} />} onClose={() => setSheet(false)} initial={{ x: 64, y: 56, w: 560 }}><TableSheet {...props} /></FloatWindow>}
        {peek && <FloatWindow id="peek" title="Ficha do grupo" icon={<Users size={15} />} onClose={() => setPeek(null)} initial={{ x: 90, y: 70, w: 600 }}><PeekSheet id={peek} edition={campaign.edition} campaignId={campaign.id} /></FloatWindow>}
        {party && <FloatWindow id="party" title="Vida e condições" icon={<Heart size={15} />} onClose={() => setParty(false)} initial={{ x: 120, y: 90, w: 520, h: 420 }}><TableTab {...props} /></FloatWindow>}
      </div>
      <aside className="tm-chat">
        <PartyList {...props} onOpen={(id, mine) => (mine ? setSheet(true) : setPeek(id))} />
        <ChatPanel {...props} />
      </aside>
    </div>
  );
}

/** Another player's sheet, live and read-only, opened from the party list. */
function PeekSheet({ id, edition, campaignId }: { id: string; edition: Edition; campaignId: string }) {
  const chars = useParty([id]);
  const c = chars[id];
  if (!c) return <div className="empty">Abrindo a ficha…</div>;
  return <Sheet edition={edition} id={id} character={c} readOnly campaignId={campaignId} />;
}

/** The player's sheet over the table: the combat summary first, the whole sheet one click away. */
export function TableSheet(props: CampaignProps) {
  const { campaign, members, uid } = props;
  const [full, setFull] = useState(() => { try { return localStorage.getItem('table-sheet-full') === '1'; } catch { return false; } });
  const pick = (v: boolean) => { setFull(v); try { localStorage.setItem('table-sheet-full', v ? '1' : '0'); } catch { /* private mode */ } };
  const me = members.find((m) => m.user_id === uid);
  if (!me?.character_id) return <MySheetTab {...props} />;
  return (
    <div className="col g8">
      <div className="seg qs-switch" role="tablist" aria-label="Como ver a ficha">
        <button role="tab" aria-selected={!full} className={!full ? 'on' : ''} onClick={() => pick(false)}>Resumo de combate</button>
        <button role="tab" aria-selected={full} className={full ? 'on' : ''} onClick={() => pick(true)}>Ficha completa</button>
      </div>
      {full ? <MySheetTab {...props} /> : <QuickSheet id={me.character_id} campaignId={campaign.id} edition={campaign.edition} />}
    </div>
  );
}

/** A player's own character: asks for the concentration save when the GM deals damage. */
function MyConcentration({ campaign, members, uid, isGm }: CampaignProps) {
  const me = members.find((m) => m.user_id === uid);
  if (isGm || !me?.character_id) return null;
  return <ConcentrationAlert characterId={me.character_id} campaignId={campaign.id} edition={campaign.edition} />;
}

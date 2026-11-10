import { useEffect, useState, type ReactNode } from 'react';
import { ScrollText, ChevronLeft, LayoutGrid, Swords, Dices, Hammer, Settings, Crown, MessageSquare, BookOpen } from 'lucide-react';
import { useAuth } from '../cloud/auth';
import { useCampaign, type Campaign as CampaignT, type Member } from '../cloud/campaigns';
import { go } from '../ui/ui';
import { SettingsTab } from './campaign/SettingsTab';
import { TableTab } from './campaign/TableTab';
import { MySheetTab } from './campaign/MySheetTab';
import { RollsTab } from './campaign/RollsTab';
import { CombatTab } from './campaign/CombatTab';
import { HomebrewTab } from './campaign/HomebrewTab';
import { ChatPanel } from './campaign/ChatPanel';
import { BestiaryTab } from './campaign/BestiaryTab';
import { TableBoard } from '../map/TableBoard';
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
      <FirstSteps {...props} />
      <TableBoard campaignId={campaign.id} isGm={isGm} />
      <InitiativeBar {...props} />
      {body ? body(props) : <div className="panel empty">Em construção.</div>}
    </>
  );

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

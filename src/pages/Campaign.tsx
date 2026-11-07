import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, LayoutGrid, Swords, Dices, Hammer, Settings, Crown } from 'lucide-react';
import { useAuth } from '../cloud/auth';
import { useCampaign, type Campaign as CampaignT, type Member } from '../cloud/campaigns';
import { go } from '../ui/ui';
import { SettingsTab } from './campaign/SettingsTab';
import { TableTab } from './campaign/TableTab';
import { RollsTab } from './campaign/RollsTab';
import { CombatTab } from './campaign/CombatTab';
import { useTable } from '../cloud/rolls';

export interface CampaignProps { campaign: CampaignT; members: Member[]; isGm: boolean; uid: string }

const TABS = [
  { k: 'mesa', label: 'Mesa', icon: LayoutGrid },
  { k: 'combate', label: 'Combate', icon: Swords },
  { k: 'rolagens', label: 'Rolagens', icon: Dices },
  { k: 'homebrew', label: 'Homebrew', icon: Hammer },
  { k: 'ajustes', label: 'Ajustes', icon: Settings },
] as const;
export type CampaignTab = (typeof TABS)[number]['k'];

const campaignTabs: Partial<Record<CampaignTab, (p: CampaignProps) => ReactNode>> = {
  mesa: (p) => <TableTab {...p} />,
  rolagens: (p) => <RollsTab {...p} />,
  combate: (p) => <CombatTab {...p} />,
  ajustes: (p) => <SettingsTab {...p} />,
};

export function Campaign({ id, tab = 'mesa' }: { id: string; tab?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { campaign, members, isGm, loading, error } = useCampaign(id);
  useTable(campaign?.id, isGm);

  useEffect(() => {
    if (campaign) document.documentElement.dataset.ed = campaign.edition;
  }, [campaign]);
  useEffect(() => {
    if (!authLoading && !user) go(`conta?next=${encodeURIComponent('campanha/' + id)}`);
  }, [authLoading, user, id]);

  if (!user || loading) return <main className="page"><div className="empty">Abrindo a campanha…</div></main>;
  if (error || !campaign) return <main className="page"><div className="panel empty">{error || 'Campanha não encontrada.'} <button className="btn sm" onClick={() => go('campanhas')}>Voltar</button></div></main>;

  const current = (TABS.some((t) => t.k === tab) ? tab : 'mesa') as CampaignTab;
  const body = campaignTabs[current];
  const props: CampaignProps = { campaign, members, isGm, uid: user.id };

  return (
    <main className="page">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => go('campanhas')}><ChevronLeft size={14} /> Campanhas</button>
        <h1 className="grow" style={{ fontSize: 28 }}>{campaign.name}</h1>
        <span className="ed-chip">D&D {campaign.edition}</span>
        {isGm && <span className="tag gold"><Crown size={12} /> Você é o mestre</span>}
      </div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.k} className={'tab' + (current === t.k ? ' on' : '')} onClick={() => go(`campanha/${id}/${t.k}`)}>
            <t.icon size={17} /> {t.label}
          </button>
        ))}
      </nav>
      {body ? body(props) : <div className="panel empty">Em construção.</div>}
    </main>
  );
}

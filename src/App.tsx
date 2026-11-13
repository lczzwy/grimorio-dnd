import { lazy, Suspense, useEffect } from 'react';
import { ThemePicker } from './ui/ThemePicker';
import { BookOpen, Users, Hammer, LogIn, UserCircle, Swords, HelpCircle } from 'lucide-react';
import { initAuth, useAuth } from './cloud/auth';
import { startSync } from './cloud/sync';
import { initRollPublishing } from './cloud/rolls';
import { Onboarding, useOnboarding } from './ui/Onboarding';
import { Invite } from './pages/Invite';
import { useRoute, go, FlashHost, D20Icon } from './ui/ui';
import { DialogHost } from './ui/dialogs';
import { UndoHost } from './ui/UndoHost';
import { AttackChooser } from './pages/sheet/AttackChooser';
import { DiceTray, RollToast } from './ui/Dice';
import type { Edition } from './data/types';
import { Home } from './pages/Home';
import { Roster } from './pages/Roster';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { initErrorLog } from './cloud/errorLog';
import { ConnectionBanner, FirstLoginUpload, SyncBanner } from './ui/SyncNotices';
import { useConnection, useConnectionWatch } from './cloud/connection';

// telas carregadas sob demanda: o pacote inicial fica só com a casca, a lista e a conta
const Campaign = lazy(() => import('./pages/Campaign').then((m) => ({ default: m.Campaign })));
const Creator = lazy(() => import('./pages/Creator').then((m) => ({ default: m.Creator })));
const Sheet = lazy(() => import('./pages/Sheet').then((m) => ({ default: m.Sheet })));
const Compendium = lazy(() => import('./pages/Compendium').then((m) => ({ default: m.Compendium })));
const HomebrewPage = lazy(() => import('./pages/Homebrew').then((m) => ({ default: m.HomebrewPage })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const NewPassword = lazy(() => import('./pages/Account').then((m) => ({ default: m.NewPassword })));
const Campaigns = lazy(() => import('./pages/Campaigns').then((m) => ({ default: m.Campaigns })));

export default function App() {
  const route = useRoute();
  const ed = (route[0] === '2014' || route[0] === '2024' ? route[0] : undefined) as Edition | undefined;
  const view = route[1];
  const top = route[0];

  useEffect(() => {
    if (ed) document.documentElement.dataset.ed = ed;
    else if (top !== 'campanha') delete document.documentElement.dataset.ed;
  }, [ed, top]);

  const auth = useAuth();
  useEffect(() => { initAuth(); initRollPublishing(); initErrorLog(); }, []);
  const uid = auth.user?.id;
  useEffect(() => (uid ? startSync(uid) : undefined), [uid]);

  // while a campaign is open: watch the live connection; coming back remounts the page fresh
  useConnectionWatch(route[0] === 'campanha' && !!uid);
  const epoch = useConnection((x) => x.epoch);
  let page;
  if (route[0] === 'conta' && route[1] === 'nova-senha') page = <NewPassword />;
  else if (route[0] === 'conta') page = <Account />;
  else if (route[0] === 'campanhas') page = <Campaigns />;
  else if (route[0] === 'convite' && route[1]) page = <Invite code={route[1]} />;
  else if (route[0] === 'campanha' && route[1]) page = <Campaign key={epoch} id={route[1]} tab={route[2]} />;
  else if (!ed) page = <Home />;
  else if (view === 'novo') page = <Creator edition={ed} />;
  else if (view === 'c' && route[2]) page = <Sheet edition={ed} id={route[2]} />;
  else if (view === 'compendio') page = <Compendium edition={ed} section={route[2]} />;
  else if (view === 'homebrew') page = <HomebrewPage edition={ed} />;
  else page = <Roster edition={ed} />;

  return (
    <div className="app">
      <a className="skip-link" href="#conteudo" onClick={(e) => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}>Pular para o conteúdo</a>
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark"><D20Icon size={20} /></span>
          <span className="brand-name">GRIMÓRIO</span>
        </a>
        {ed && <span className="ed-chip">{ed === '2014' ? 'D&D 2014' : 'D&D 2024'}</span>}
        <span className="spacer" />
        {ed && (
          <nav className="row g4" aria-label="Seções">
            <button className={'btn ghost sm' + (!view || view === 'c' || view === 'novo' ? ' active' : '')} onClick={() => go(ed)}>
              <Users size={15} /> <span className="hidden-mobile">Personagens</span>
            </button>
            <button className={'btn ghost sm' + (view === 'compendio' ? ' active' : '')} onClick={() => go(ed + '/compendio')}>
              <BookOpen size={15} /> <span className="hidden-mobile">Compêndio</span>
            </button>
            <button className={'btn ghost sm' + (view === 'homebrew' ? ' active' : '')} onClick={() => go(ed + '/homebrew')}>
              <Hammer size={15} /> <span className="hidden-mobile">Homebrew</span>
            </button>
          </nav>
        )}
        <ThemePicker />
        <button className="btn ghost sm icon" title="Como usar" onClick={() => useOnboarding.getState().show()}><HelpCircle size={16} /></button>
        {auth.user && (
          <button className={'btn ghost sm' + (route[0] === 'campanhas' || route[0] === 'campanha' ? ' active' : '')} onClick={() => go('campanhas')} title="Campanhas">
            <Swords size={15} /> <span className="hidden-mobile">Campanhas</span>
          </button>
        )}
        <button className={'btn sm' + (route[0] === 'conta' ? ' active' : '')} onClick={() => go('conta')} title={auth.user ? 'Sua conta' : 'Entrar'}>
          {auth.user ? <><UserCircle size={15} /> <span className="hidden-mobile">{auth.profile?.display_name || 'Conta'}</span></> : <><LogIn size={15} /> <span className="hidden-mobile">Entrar</span></>}
        </button>
      </header>
      <SyncBanner />
      <ConnectionBanner />
      {/* campaign tabs stay mounted: remounting refetched everything from the server on each click */}
      <div id="conteudo" tabIndex={-1} style={{ outline: 'none' }}>
        <ErrorBoundary key={route[0] === 'campanha' ? route.slice(0, 2).join('/') : route.join('/')}>
          <Suspense fallback={<div className="empty" role="status">Carregando…</div>}>{page}</Suspense>
        </ErrorBoundary>
      </div>
      {(ed || route[0] === 'campanha') && <DiceTray />}
      <RollToast />
      <FlashHost />
      <UndoHost />
      <AttackChooser />
      <DialogHost />
      <Onboarding />
      <FirstLoginUpload />
    </div>
  );
}

import { useEffect } from 'react';
import { BookOpen, Users, Hammer } from 'lucide-react';
import { useRoute, go, FlashHost, D20Icon } from './ui/ui';
import { DiceTray, RollToast } from './ui/Dice';
import type { Edition } from './data/types';
import { Home } from './pages/Home';
import { Roster } from './pages/Roster';
import { Creator } from './pages/Creator';
import { Sheet } from './pages/Sheet';
import { Compendium } from './pages/Compendium';
import { HomebrewPage } from './pages/Homebrew';
import { ErrorBoundary } from './ui/ErrorBoundary';

export default function App() {
  const route = useRoute();
  const ed = (route[0] === '2014' || route[0] === '2024' ? route[0] : undefined) as Edition | undefined;
  const view = route[1];

  useEffect(() => {
    if (ed) document.documentElement.dataset.ed = ed;
    else delete document.documentElement.dataset.ed;
  }, [ed]);

  let page;
  if (!ed) page = <Home />;
  else if (view === 'novo') page = <Creator edition={ed} />;
  else if (view === 'c' && route[2]) page = <Sheet edition={ed} id={route[2]} />;
  else if (view === 'compendio') page = <Compendium edition={ed} section={route[2]} />;
  else if (view === 'homebrew') page = <HomebrewPage edition={ed} />;
  else page = <Roster edition={ed} />;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark"><D20Icon size={20} /></span>
          <span className="brand-name">GRIMÓRIO</span>
        </a>
        {ed && <span className="ed-chip">{ed === '2014' ? 'D&D 2014' : 'D&D 2024'}</span>}
        <span className="spacer" />
        {ed && (
          <nav className="row" style={{ gap: 4 }}>
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
      </header>
      <ErrorBoundary key={route.join('/')}>{page}</ErrorBoundary>
      {ed && <DiceTray />}
      <RollToast />
      <FlashHost />
    </div>
  );
}

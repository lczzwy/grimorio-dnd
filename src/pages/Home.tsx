import { useApp } from '../store';
import { go } from '../ui/ui';

function Sigil({ variant }: { variant: '2014' | '2024' }) {
  const c = variant === '2014' ? '#c8423a' : '#8b6cff';
  const c2 = variant === '2014' ? '#d9b25f' : '#36d1c4';
  return (
    <svg className="sigil" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g transform="translate(270 120)" fill="none" strokeWidth="1.5">
        <circle r="110" stroke={c} strokeOpacity=".35" />
        <circle r="86" stroke={c2} strokeOpacity=".3" strokeDasharray="4 7" />
        <circle r="140" stroke={c} strokeOpacity=".15" />
        {variant === '2014' ? (
          <path d="M0-100 87 50H-87Z M0 100-87-50H87Z" stroke={c2} strokeOpacity=".45" />
        ) : (
          <path d="M0-100 95-31 59 81H-59L-95-31Z M0-100 59 81-95-31H95L-59 81Z" stroke={c2} strokeOpacity=".45" />
        )}
        <path d="M0-60 52-30v60L0 60-52 30v-60Z" stroke="#fff" strokeOpacity=".5" strokeWidth="2" />
        <path d="M0-60-26 0h52Z M-26 0 0 60 26 0" stroke="#fff" strokeOpacity=".35" />
      </g>
    </svg>
  );
}

export function Home() {
  const chars = useApp((s) => s.characters);
  const n14 = chars.filter((c) => c.edition === '2014').length;
  const n24 = chars.filter((c) => c.edition === '2024').length;
  return (
    <main className="page">
      <section className="hero">
        <div className="tiny muted" style={{ letterSpacing: '0.3em' }}>FICHAS · DADOS · COMPÊNDIO</div>
        <h1>Escolha a sua mesa</h1>
        <p>Cada edição tem suas próprias regras, conteúdos e personagens. Você pode jogar nas duas.</p>
      </section>
      <div className="portals">
        <button className="portal p2014" onClick={() => go('2014')}>
          <Sigil variant="2014" />
          <span className="count tag gold">{n14} personagem{n14 === 1 ? '' : 's'}</span>
          <div className="tiny" style={{ color: '#e9b6a6', letterSpacing: '.25em' }}>REGRAS CLÁSSICAS</div>
          <h2>D&D 2014</h2>
          <p>A 5ª edição original. Bônus de atributo vêm da raça, subraças, antecedentes com característica própria.</p>
          <div className="meta">
            <span className="tag">319 magias</span><span className="tag">12 classes</span><span className="tag">9 raças</span><span className="tag">SRD 5.1</span>
          </div>
        </button>
        <button className="portal p2024" onClick={() => go('2024')}>
          <Sigil variant="2024" />
          <span className="count tag gold">{n24} personagem{n24 === 1 ? '' : 's'}</span>
          <div className="tiny" style={{ color: '#bfb1ff', letterSpacing: '.25em' }}>REGRAS REVISADAS</div>
          <h2>D&D 2024</h2>
          <p>O novo Livro do Jogador. Atributos e talento de origem vêm do antecedente, maestria de armas, espécies.</p>
          <div className="meta">
            <span className="tag">339 magias</span><span className="tag">12 classes</span><span className="tag">9 espécies</span><span className="tag">SRD 5.2</span>
          </div>
        </button>
      </div>
      <p className="center small faint" style={{ marginTop: 40, maxWidth: 680, marginInline: 'auto' }}>
        Conteúdo de regras do System Reference Document 5.1 e 5.2 da Wizards of the Coast LLC, sob licença CC-BY-4.0. Dados via 5e-bits/5e-database. Este site não é afiliado à Wizards of the Coast.
        Suas fichas ficam salvas neste navegador; use Exportar para fazer backup.
      </p>
    </main>
  );
}

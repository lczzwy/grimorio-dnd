import { useEffect, useState } from 'react';
import { Plus, LogIn, Crown, Users } from 'lucide-react';
import type { Edition } from '../data/types';
import { useAuth } from '../cloud/auth';
import { createCampaign, joinCampaign, listCampaigns, type Campaign } from '../cloud/campaigns';
import { go, useFlash } from '../ui/ui';

/** Accepts a full invite link or just the code. */
const codeFrom = (s: string) => s.trim().split('/convite/').pop()!.replace(/[^a-z0-9]/gi, '');

export function Campaigns() {
  const { user, loading } = useAuth();
  const flash = useFlash((s) => s.show);
  const [list, setList] = useState<Campaign[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [edition, setEdition] = useState<Edition>('2014');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    listCampaigns().then(setList).catch((e) => setError(e.message));
  }, [user]);

  if (loading) return <main className="page"><div className="empty">Carregando…</div></main>;
  if (!user) {
    return (
      <main className="page" style={{ maxWidth: 560 }}>
        <div className="panel empty col" style={{ alignItems: 'center' }}>
          <Users size={30} />
          <p>Para jogar em campanha com o mestre, entre na sua conta.</p>
          <button className="btn primary" onClick={() => go('conta?next=campanhas')}><LogIn size={15} /> Entrar ou criar conta</button>
        </div>
      </main>
    );
  }

  const create = async () => {
    setBusy(true);
    try {
      const c = await createCampaign(name.trim(), edition);
      flash('Campanha criada! Mande o link de convite para os jogadores.');
      go('campanha/' + c.id + '/ajustes');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    setBusy(true);
    try {
      const id = await joinCampaign(codeFrom(code));
      go('campanha/' + id + '/ajustes');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1 style={{ marginBottom: 16 }}>Campanhas</h1>
      <div className="sheet-grid" style={{ gridTemplateColumns: '1fr 340px' }}>
        <div className="col" style={{ gap: 10 }}>
          {error && <div className="tag bad">{error}</div>}
          {list === null && !error && <div className="empty">Carregando…</div>}
          {list?.length === 0 && <div className="panel empty">Você ainda não está em nenhuma campanha. Crie uma como mestre ou entre com o link do seu mestre.</div>}
          {list?.map((c) => (
            <button key={c.id} className="char-card" style={{ textAlign: 'left' }} onClick={() => go('campanha/' + c.id)}>
              <div className="row">
                <div className="grow">
                  <div className="display" style={{ fontSize: 19, fontWeight: 700 }}>{c.name}</div>
                  <div className="small muted">D&D {c.edition}</div>
                </div>
                {c.gm === user.id ? <span className="tag gold"><Crown size={12} /> Mestre</span> : <span className="tag">Jogador</span>}
              </div>
            </button>
          ))}
        </div>
        <div className="col" style={{ gap: 16 }}>
          <div className="panel col">
            <h3>Criar campanha (você é o mestre)</h3>
            <input className="input" placeholder="Nome da campanha" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button className={edition === '2014' ? 'on' : ''} onClick={() => setEdition('2014')}>D&D 2014</button>
              <button className={edition === '2024' ? 'on' : ''} onClick={() => setEdition('2024')}>D&D 2024</button>
            </div>
            <button className="btn primary" disabled={!name.trim() || busy} onClick={create}><Plus size={15} /> Criar</button>
          </div>
          <div className="panel col">
            <h3>Entrar com convite</h3>
            <input className="input" placeholder="Cole o link ou o código" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" disabled={!codeFrom(code) || busy} onClick={join}><LogIn size={15} /> Entrar na campanha</button>
          </div>
        </div>
      </div>
    </main>
  );
}

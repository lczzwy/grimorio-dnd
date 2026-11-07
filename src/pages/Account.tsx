import { useState } from 'react';
import { LogIn, LogOut, UserPlus, Save } from 'lucide-react';
import { signIn, signOut, signUp, updateDisplayName, useAuth } from '../cloud/auth';
import { nextRouteFrom } from '../cloud/authText';
import { go, useFlash } from '../ui/ui';
import { CloudUpload } from './account/CloudUpload';

export function Account() {
  const { user, profile, loading } = useAuth();
  const flash = useFlash((s) => s.show);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'up') await signUp(email.trim(), password, name.trim() || email.split('@')[0]);
      else await signIn(email.trim(), password);
      flash(mode === 'up' ? 'Conta criada!' : 'Bem-vindo de volta!');
      const next = nextRouteFrom(window.location.hash);
      if (next) go(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="page"><div className="empty">Carregando…</div></main>;

  if (user) {
    return (
      <main className="page" style={{ maxWidth: 640 }}>
        <h1 style={{ marginBottom: 16 }}>Sua conta</h1>
        <div className="panel col">
          <div className="small muted">Conectado como <b>{user.email}</b></div>
          <label className="field">Nome que a mesa vê
            <div className="row">
              <input className="input" value={newName ?? profile?.display_name ?? ''} onChange={(e) => setNewName(e.target.value)} />
              <button className="btn" disabled={newName == null || !newName.trim()} onClick={async () => { try { await updateDisplayName(newName!.trim()); setNewName(null); flash('Nome salvo'); } catch (e) { alert((e as Error).message); } }}><Save size={15} /> Salvar</button>
            </div>
          </label>
          <div className="row">
            <button className="btn primary" onClick={() => go('campanhas')}>Minhas campanhas</button>
            <span className="spacer" />
            <button className="btn danger" onClick={() => signOut()}><LogOut size={15} /> Sair</button>
          </div>
        </div>
        <CloudUpload />
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 6 }}>{mode === 'in' ? 'Entrar' : 'Criar conta'}</h1>
      <p className="muted" style={{ marginTop: 0 }}>Com uma conta, suas fichas ficam salvas online e você pode jogar em campanhas com o mestre. Sem conta, o site continua funcionando só neste navegador.</p>
      <form className="panel col" onSubmit={submit}>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Entrar</button>
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Criar conta</button>
        </div>
        {mode === 'up' && <label className="field">Seu nome (aparece para a mesa)<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Arthur" /></label>}
        <label className="field">E-mail<input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Senha<input className="input" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="tag bad" style={{ whiteSpace: 'normal' }}>{error}</div>}
        <button className="btn primary" disabled={busy}>{mode === 'in' ? <><LogIn size={15} /> Entrar</> : <><UserPlus size={15} /> Criar conta</>}</button>
      </form>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { useAuth } from '../cloud/auth';
import { joinCampaign } from '../cloud/campaigns';
import { go } from '../ui/ui';

/** #/convite/:code — joins (after login if needed) and opens the campaign to pick a character. */
export function Invite({ code }: { code: string }) {
  const { user, loading } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      go(`conta?next=${encodeURIComponent('convite/' + code)}`);
      return;
    }
    joinCampaign(code)
      .then((id) => go('campanha/' + id + '/ajustes'))
      .catch((e) => setError((e as Error).message));
  }, [user, loading, code]);

  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <div className="panel empty col" style={{ alignItems: 'center' }}>
        {error ? (
          <>
            <p className="tag bad" style={{ whiteSpace: 'normal' }}>{error}</p>
            <button className="btn" onClick={() => go('campanhas')}>Ver minhas campanhas</button>
          </>
        ) : (
          <p>Entrando na campanha…</p>
        )}
      </div>
    </main>
  );
}

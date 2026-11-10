import { EyeOff, Eye } from 'lucide-react';
import { revealRoll, useRollFeed } from '../../cloud/rolls';
import type { CampaignProps } from '../Campaign';

export function RollsTab({ campaign, isGm, uid }: CampaignProps) {
  const rows = useRollFeed(campaign.id);
  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <div className="panel-title"><h3>Rolagens da mesa</h3><span className="spacer" /><span className="small muted">as 200 mais recentes, ao vivo</span></div>
      {rows.length === 0 && <div className="empty small">Nenhuma rolagem ainda. Role pela ficha ou pelo dado no canto da tela; todos veem aqui.</div>}
      <div className="log">
        {rows.map((r) => (
          <div key={r.id} className={'log-item ' + (r.kind === 'crit' || r.kind === 'fumble' ? r.kind : '')} style={r.hidden ? { borderStyle: 'dashed' } : undefined}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
              <span className="muted">{r.author}</span> · {r.label}
              {r.hidden && <span className="tag" style={{ marginLeft: 6 }}><EyeOff size={11} /> {r.user_id === uid ? 'só você' : 'oculta'}{isGm && r.user_id !== uid ? ' (você vê como mestre)' : ''}</span>}
            </div>
            <div className="tot">{r.total}</div>
            <div className="small muted mono">
              {r.formula} [{r.rolls.join(', ')}]{r.dropped?.length ? ` ~${r.dropped.join(',')}` : ''} · {r.created_at ? new Date(r.created_at).toLocaleTimeString().slice(0, 5) : ''}
              {r.hidden && (isGm || r.user_id === uid) && <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => revealRoll(r.id!).catch((e) => alert(e.message))}><Eye size={12} /> Revelar</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

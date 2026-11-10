import { useEffect, useRef, useState } from 'react';
import { CircleUserRound, EyeOff, Eye, Pencil, Trash2, Upload } from 'lucide-react';
import { Modal } from '../ui/ui';
import { confirmBox, showError } from '../ui/dialogs';
import { addToken, deleteToken, snapToGrid, TOKEN_COLORS, updateToken, uploadTokenImage, type MapToken, type TokenColor } from '../cloud/tokens';
import type { BattleMapRow } from '../cloud/maps';
import type { Member } from '../cloud/campaigns';
import type { Character } from '../data/types';

export interface PartyPick { member: Member; character: Character }

/**
 * Create or edit a token: a picture (uploaded, or a player's character portrait), a name,
 * its size in squares, and the ring colour that says whose side it is on.
 */
export function TokenEditor({ map, token, party, onClose }: { map: BattleMapRow; token?: MapToken; party: PartyPick[]; onClose: () => void }) {
  const [name, setName] = useState(token?.name ?? '');
  const [image, setImage] = useState<string | null>(token?.image_url ?? null);
  const [owner, setOwner] = useState<string | null>(token?.owner ?? null);
  const [size, setSize] = useState(token?.size ?? 1);
  const [color, setColor] = useState<TokenColor>(token?.color ?? 'enemy');
  const [hidden, setHidden] = useState(token?.hidden ?? false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const pickParty = (p: PartyPick) => {
    setName(p.character.name || p.member.display_name);
    setImage(p.character.portrait || null);
    setOwner(p.member.user_id);
    setColor('ally');
  };
  const upload = async (f: File) => {
    setBusy(true);
    try { setImage(await uploadTokenImage(map.campaign_id, f)); } catch (e) { showError(e); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const fields = { name: name.trim(), image_url: image, owner, size, color, hidden };
      if (token) await updateToken(token.id, fields);
      else {
        // new tokens land in the middle of the map, on the grid
        const c = snapToGrid(map.width / 2, map.height / 2, size, map);
        await addToken({ campaign_id: map.campaign_id, map_id: map.id, x: c.x, y: c.y, ...fields });
      }
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={token ? 'Editar token' : 'Novo token'} icon={<CircleUserRound size={18} />} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{token ? 'Salvar' : 'Pôr no mapa'}</button>
      </>
    }>
      {party.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>Personagem do grupo</div>
          <div className="row wrap g8">
            {party.map((p) => (
              <button key={p.member.user_id} className={'tok-pick' + (owner === p.member.user_id ? ' on' : '')} onClick={() => pickParty(p)} title={p.member.display_name}>
                <span className="tok-pick-face" style={p.character.portrait ? { backgroundImage: `url(${p.character.portrait})` } : undefined}>{!p.character.portrait && (p.character.name || '?').charAt(0)}</span>
                <span>{p.character.name || p.member.display_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="tok-edit">
        <div className={'tok-preview tok-' + color} style={image ? { backgroundImage: `url(${image})` } : undefined}>
          {!image && <span>{(name || '?').charAt(0).toUpperCase()}</span>}
        </div>
        <div className="col g8 grow">
          <label className="field">Nome<input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Goblin 1" /></label>
          <div className="row g6">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            <button className="btn sm" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {image ? 'Trocar foto' : 'Enviar foto'}</button>
            {image && <button className="btn sm ghost" onClick={() => setImage(null)}>Sem foto</button>}
          </div>
        </div>
      </div>
      <div className="small muted" style={{ margin: '14px 0 6px' }}>Lado</div>
      <div className="seg">
        {TOKEN_COLORS.map((c) => (
          <button key={c.id} className={color === c.id ? 'on' : ''} onClick={() => setColor(c.id)}><span className={'tok-dot tok-' + c.id} /> {c.label}</button>
        ))}
      </div>
      <div className="small muted" style={{ margin: '14px 0 6px' }}>Tamanho</div>
      <div className="seg">
        {[1, 2, 3, 4].map((n) => (
          <button key={n} className={size === n ? 'on' : ''} onClick={() => setSize(n)}>{n}×{n}</button>
        ))}
      </div>
      <label className="row g8" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Escondido dos jogadores
      </label>
    </Modal>
  );
}

/** The small menu that opens on a token (right click, or a long press on a phone). */
export function TokenMenu({ token, x, y, onEdit, onClose, onDeleted }: { token: MapToken; x: number; y: number; onEdit: () => void; onClose: () => void; onDeleted: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!el.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // wait a tick so the click that opened the menu doesn't close it
    const t = window.setTimeout(() => { window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc); });
    el.current?.querySelector('button')?.focus();
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 160);
  return (
    <div ref={el} className="tok-menu" role="menu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      <div className="tok-menu-title">{token.name || 'Token'}</div>
      <button role="menuitem" onClick={() => { onClose(); onEdit(); }}><Pencil size={14} /> Editar</button>
      <button role="menuitem" onClick={() => { onClose(); updateToken(token.id, { hidden: !token.hidden }).catch(showError); }}>
        {token.hidden ? <><Eye size={14} /> Mostrar aos jogadores</> : <><EyeOff size={14} /> Esconder dos jogadores</>}
      </button>
      <button role="menuitem" className="danger" onClick={async () => {
        onClose();
        if (await confirmBox(`Excluir o token ${token.name || ''} do mapa?`.replace('  ', ' '), { danger: true, ok: 'Excluir' })) deleteToken(token.id).then(() => onDeleted(token.id)).catch(showError);
      }}><Trash2 size={14} /> Excluir</button>
    </div>
  );
}

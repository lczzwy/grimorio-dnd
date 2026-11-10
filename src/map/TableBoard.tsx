import { useCallback, useState } from 'react';
import { Hand, CirclePlus, Magnet } from 'lucide-react';
import { TableDice } from '../dice3d/TableDice';
import { useCampaignMaps, type BattleMapRow } from '../cloud/maps';
import { moveTokens, useMapTokens, type MapToken } from '../cloud/tokens';
import type { Member } from '../cloud/campaigns';
import { useParty } from '../pages/campaign/TableTab';
import { showError } from '../ui/dialogs';
import { BattleMap } from './BattleMap';
import { GridEditor, MapsButton } from './MapManager';
import { TokenEditor, TokenMenu, type PartyPick } from './TokenTools';

/**
 * The shared table: the active battle map (or the felt when there is none), with its tokens and
 * the 3D dice falling on top, so everyone sees the map and the rolls on the same screen.
 */
export function TableBoard({ campaignId, isGm, uid, members }: { campaignId: string; isGm: boolean; uid: string; members: Member[] }) {
  const { maps, active } = useCampaignMaps(campaignId);
  const [editing, setEditing] = useState(false);
  // the GM's grid tweaks show here at once, before the server echoes them back
  const [draft, setDraft] = useState<BattleMapRow | null>(null);
  const shown = active && draft?.id === active.id && editing ? draft : active;
  const [tokens, setTokens] = useMapTokens(campaignId, active?.id);
  const [tokenForm, setTokenForm] = useState<{ token?: MapToken } | null>(null);
  const [menu, setMenu] = useState<{ token: MapToken; x: number; y: number } | null>(null);
  const [snap, setSnap] = useState(() => { try { return localStorage.getItem('map-snap') === '1'; } catch { return false; } });
  const toggleSnap = () => setSnap((v) => { try { localStorage.setItem('map-snap', v ? '0' : '1'); } catch { /* private mode */ } return !v; });

  const chars = useParty(members.map((m) => m.character_id).filter((x): x is string => !!x));
  const party: PartyPick[] = members
    .filter((m) => m.role === 'player' && m.character_id && chars[m.character_id])
    .map((m) => ({ member: m, character: chars[m.character_id!] }));

  const canMove = useCallback((t: MapToken) => isGm || (!!t.owner && t.owner === uid), [isGm, uid]);
  const onMoved = useCallback((moves: { id: string; x: number; y: number }[]) => {
    moveTokens(moves).catch((e) => { showError(e); });
  }, []);

  return (
    <>
      <TableDice
        campaignId={campaignId}
        variant="tray"
        title={active ? active.name : 'Mesa de dados'}
        headerExtra={isGm && <MapsButton campaignId={campaignId} maps={maps} active={active} onEditGrid={() => setEditing((v) => !v)} />}
        background={shown && (
          <>
            <BattleMap
              map={shown}
              tokens={tokens}
              setTokens={setTokens}
              canMove={canMove}
              onMoved={onMoved}
              onTokenMenu={isGm ? (token, x, y) => setMenu({ token, x, y }) : undefined}
              snap={snap}
            />
            {isGm && editing && <GridEditor map={active!} onChange={setDraft} onClose={() => { setEditing(false); setDraft(null); }} />}
          </>
        )}
      />
      {active && (
        <nav className="map-tools" aria-label="Ferramentas do mapa">
          <button className="map-tool on" title="Mão: arraste o mapa e os tokens. Botão direito e arrastar seleciona vários." aria-pressed="true"><Hand size={18} /></button>
          <button className={'map-tool' + (snap ? ' on' : '')} title={snap ? 'Encaixar na grade: ligado' : 'Encaixar na grade: desligado (token fica onde você soltar)'} aria-pressed={snap} aria-label="Encaixar na grade" onClick={toggleSnap}><Magnet size={18} /></button>
          {isGm && <button className="map-tool" title="Novo token" aria-label="Novo token" onClick={() => setTokenForm({})}><CirclePlus size={18} /></button>}
        </nav>
      )}
      {menu && <TokenMenu token={menu.token} x={menu.x} y={menu.y} onClose={() => setMenu(null)} onEdit={() => setTokenForm({ token: menu.token })} />}
      {tokenForm && active && <TokenEditor map={active} token={tokenForm.token} party={party} onClose={() => setTokenForm(null)} />}
    </>
  );
}

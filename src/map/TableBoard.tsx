import { useCallback, useState } from 'react';
import { turnIndex } from '../cloud/combatLogic';
import { Hand, CirclePlus, Magnet, Pencil, Eraser, Ruler, Trash2 } from 'lucide-react';
import { PEN_COLORS, useDrawings, useMapFx } from '../cloud/drawings';
import { confirmBox } from '../ui/dialogs';
import { useEncounter } from '../cloud/combat';

/** how much life a hurt band means, for players who only see the band */
const BAND_LIFE: Record<string, number> = { ileso: 1, ferido: 0.7, sangrando: 0.4, 'quase morto': 0.15, caido: 0 };
import { TableDice } from '../dice3d/TableDice';
import { useCampaignMaps, type BattleMapRow } from '../cloud/maps';
import { moveTokens, useMapTokens, type MapToken } from '../cloud/tokens';
import type { Member } from '../cloud/campaigns';
import { useParty } from '../pages/campaign/TableTab';
import { showError } from '../ui/dialogs';
import { BattleMap, type MapTool } from './BattleMap';
import { GridEditor, MapsButton } from './MapManager';
import { TokenEditor, TokenMenu, type PartyPick } from './TokenTools';

/**
 * The shared table: the active battle map (or the felt when there is none), with its tokens and
 * the 3D dice falling on top, so everyone sees the map and the rolls on the same screen.
 */
export function TableBoard({ campaignId, isGm, uid, members }: { campaignId: string; isGm: boolean; uid: string; members: Member[] }) {
  const { maps, active, drop } = useCampaignMaps(campaignId);
  const [editing, setEditing] = useState(false);
  // the GM's grid tweaks show here at once, before the server echoes them back
  const [draft, setDraft] = useState<BattleMapRow | null>(null);
  const shown = active && draft?.id === active.id && editing ? draft : active;
  const [tokens, setTokens] = useMapTokens(campaignId, active?.id);
  const [tokenForm, setTokenForm] = useState<{ token?: MapToken } | null>(null);
  const [menu, setMenu] = useState<{ token: MapToken; x: number; y: number } | null>(null);
  const [snap, setSnap] = useState(() => { try { return localStorage.getItem('map-snap') === '1'; } catch { return false; } });
  const [tool, setTool] = useState<MapTool>('hand');
  const [penColor, setPenColor] = useState(() => { try { return localStorage.getItem('pen-color') || PEN_COLORS[0]; } catch { return PEN_COLORS[0]; } });
  const pickColor = (c: string) => { setPenColor(c); try { localStorage.setItem('pen-color', c); } catch { /* private mode */ } };
  const { drawings, add: addDrawing, remove: removeDrawings } = useDrawings(campaignId, active?.id);
  const me = members.find((m) => m.user_id === uid);
  const { rulers, pings, sendRuler, sendPing } = useMapFx(campaignId, active?.id, { uid, name: me?.display_name || '', color: penColor });
  const toggleSnap = () => setSnap((v) => { try { localStorage.setItem('map-snap', v ? '0' : '1'); } catch { /* private mode */ } return !v; });

  const chars = useParty(members.map((m) => m.character_id).filter((x): x is string => !!x));
  const party: PartyPick[] = members
    .filter((m) => m.role === 'player' && m.character_id && chars[m.character_id])
    .map((m) => ({ member: m, character: chars[m.character_id!] }));

  // the fight: whose turn it is, and how hurt the linked creatures are
  const { encounter, list: fighters, secrets } = useEncounter(campaignId, isGm);
  const current = fighters[turnIndex(encounter, fighters, isGm)];
  const turnId = current ? tokens.find((t) => (t.combatant_id && t.combatant_id === current.id) || (!!current.character_id && t.character_id === current.character_id))?.id : undefined;
  const life: Record<string, number> = {};
  for (const t of tokens) {
    const f = t.combatant_id ? fighters.find((x) => x.id === t.combatant_id) : undefined;
    if (!f || f.kind === 'player') continue;
    const s = secrets[f.id];
    // the GM sees the exact life; players see the band the server gives them
    life[t.id] = isGm && s && s.hp_max > 0 ? s.hp_current / s.hp_max : BAND_LIFE[f.hp_band] ?? 1;
  }

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
        headerExtra={isGm && <MapsButton campaignId={campaignId} maps={maps} active={active} onEditGrid={() => setEditing((v) => !v)} onDeleted={drop} />}
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
              tool={tool}
              pen={{ color: penColor, width: 4 }}
              drawings={drawings}
              canErase={(d) => isGm || d.author === uid}
              onStroke={(points) => { addDrawing({ campaign_id: campaignId, map_id: active!.id, color: penColor, width: 4, points }).catch(showError); }}
              onErase={(ids) => { removeDrawings(ids).catch(showError); }}
              rulers={rulers}
              onRuler={sendRuler}
              pings={pings}
              onPing={sendPing}
              turnId={turnId}
              life={life}
            />
            {isGm && editing && <GridEditor map={active!} onChange={setDraft} onClose={() => { setEditing(false); setDraft(null); }} />}
          </>
        )}
      />
      {active && (
        <nav className="map-tools" aria-label="Ferramentas do mapa">
          {([
            ['hand', Hand, 'Mão: arraste o mapa e os tokens. Botão direito e arrastar seleciona vários. Dois cliques marcam um ponto para todos.'],
            ['pen', Pencil, 'Lápis: desenhe no mapa (todos veem)'],
            ['eraser', Eraser, isGm ? 'Borracha: passe sobre um desenho para apagar' : 'Borracha: apaga os seus desenhos'],
            ['ruler', Ruler, 'Régua: arraste para medir a distância (todos veem)'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} className={'map-tool' + (tool === id ? ' on' : '')} title={label} aria-label={label} aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={18} /></button>
          ))}
          {tool === 'pen' && (
            <div className="map-pal" role="radiogroup" aria-label="Cor do lápis">
              {PEN_COLORS.map((c) => (
                <button key={c} role="radio" aria-checked={penColor === c} aria-label={'Cor ' + c} className={'map-swatch' + (penColor === c ? ' on' : '')} style={{ background: c }} onClick={() => pickColor(c)} />
              ))}
            </div>
          )}
          {isGm && drawings.length > 0 && (
            <button className="map-tool danger" title="Apagar todos os desenhos deste mapa" aria-label="Apagar todos os desenhos" onClick={async () => {
              if (await confirmBox('Apagar todos os desenhos deste mapa, de todo mundo?', { danger: true, ok: 'Apagar tudo' })) removeDrawings(drawings.map((d) => d.id)).catch(showError);
            }}><Trash2 size={18} /></button>
          )}
          <button className={'map-tool' + (snap ? ' on' : '')} title={snap ? 'Encaixar na grade: ligado' : 'Encaixar na grade: desligado (token fica onde você soltar)'} aria-pressed={snap} aria-label="Encaixar na grade" onClick={toggleSnap}><Magnet size={18} /></button>
          {isGm && <button className="map-tool" title="Novo token" aria-label="Novo token" onClick={() => setTokenForm({})}><CirclePlus size={18} /></button>}
        </nav>
      )}
      {menu && <TokenMenu token={menu.token} x={menu.x} y={menu.y} onClose={() => setMenu(null)} onEdit={() => setTokenForm({ token: menu.token })} onDeleted={(id) => setTokens((t) => t.filter((x) => x.id !== id))} />}
      {tokenForm && active && <TokenEditor map={active} token={tokenForm.token} party={party} fighters={fighters.filter((f) => f.kind !== 'player')} onClose={() => setTokenForm(null)} />}
    </>
  );
}

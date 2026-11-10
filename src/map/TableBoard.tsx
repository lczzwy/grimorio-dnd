import { useState } from 'react';
import { TableDice } from '../dice3d/TableDice';
import { useCampaignMaps, type BattleMapRow } from '../cloud/maps';
import { BattleMap } from './BattleMap';
import { GridEditor, MapsButton } from './MapManager';

/**
 * The shared table: the active battle map (or the felt when there is none), with the 3D dice
 * falling on top of it, so everyone sees the map and the rolls on the same screen.
 */
export function TableBoard({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { maps, active } = useCampaignMaps(campaignId);
  const [editing, setEditing] = useState(false);
  // the GM's grid tweaks show here at once, before the server echoes them back
  const [draft, setDraft] = useState<BattleMapRow | null>(null);
  const shown = active && draft?.id === active.id && editing ? draft : active;

  return (
    <TableDice
      campaignId={campaignId}
      variant="tray"
      title={active ? active.name : 'Mesa de dados'}
      headerExtra={isGm && <MapsButton campaignId={campaignId} maps={maps} active={active} onEditGrid={() => setEditing((v) => !v)} />}
      background={shown && (
        <>
          <BattleMap map={shown} />
          {isGm && editing && <GridEditor map={active!} onChange={setDraft} onClose={() => { setEditing(false); setDraft(null); }} />}
        </>
      )}
    />
  );
}

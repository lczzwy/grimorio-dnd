import { useEffect, useRef, useState } from 'react';
import { Map as MapIcon, Upload, Trash2, Grid3x3, Eye, EyeOff, Check } from 'lucide-react';
import { Modal, useFlash } from '../ui/ui';
import { confirmBox, showError } from '../ui/dialogs';
import { MapCropper, type CroppedMap } from './MapCropper';
import { addMap, deleteMap, setActiveMap, updateMap, type BattleMapRow } from '../cloud/maps';

/** GM button on the dice table header: opens the map library. */
export function MapsButton({ campaignId, maps, active, onEditGrid }: { campaignId: string; maps: BattleMapRow[]; active: BattleMapRow | null; onEditGrid: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {active && <button className="btn ghost sm" onClick={onEditGrid} title="Ajustar a grade do mapa"><Grid3x3 size={15} /> <span className="hidden-mobile">Grade</span></button>}
      <button className="btn ghost sm" onClick={() => setOpen(true)} title="Mapas da campanha"><MapIcon size={15} /> <span className="hidden-mobile">Mapas</span></button>
      {open && <MapLibrary campaignId={campaignId} maps={maps} onClose={() => setOpen(false)} />}
    </>
  );
}

function MapLibrary({ campaignId, maps, onClose }: { campaignId: string; maps: BattleMapRow[]; onClose: () => void }) {
  const flash = useFlash((s) => s.show);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const [picked, setPicked] = useState<File | null>(null);
  const upload = async (r: CroppedMap) => {
    setBusy(true);
    try {
      const m = await addMap(campaignId, r.blob, r.size, r.name);
      if (r.putOnTable) await setActiveMap(campaignId, m.id);
      flash(r.putOnTable ? 'Mapa na mesa' : 'Mapa guardado');
      setPicked(null);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  if (picked) return <MapCropper file={picked} busy={busy} onCancel={() => setPicked(null)} onDone={(r) => void upload(r)} />;

  return (
    <Modal title="Mapas da campanha" icon={<MapIcon size={18} />} onClose={onClose} wide footer={
      <>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPicked(f); }} />
        <button className="btn primary" disabled={busy} onClick={() => file.current?.click()}><Upload size={15} /> Enviar mapa</button>
      </>
    }>
      <p className="muted m0" style={{ marginBottom: 12 }}>O mapa ativo aparece no lugar do feltro, para todos da mesa, e os dados caem por cima dele. Ao enviar, você recorta o quadrado que vai aparecer.</p>
      {maps.length === 0 && <div className="empty">Nenhum mapa ainda. Envie uma imagem (png, jpg ou webp).</div>}
      <div className="map-list">
        {maps.map((m) => (
          <div key={m.id} className={'map-item' + (m.active ? ' on' : '')}>
            <img src={m.image_url} alt="" loading="lazy" />
            <div className="map-item-body">
              <input className="input" defaultValue={m.name} aria-label="Nome do mapa" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.name) updateMap(m.id, { name: v }).catch(showError); }} />
              <div className="row g6">
                {m.active
                  ? <button className="btn sm" onClick={() => setActiveMap(campaignId, null).catch(showError)}><EyeOff size={14} /> Tirar da mesa</button>
                  : <button className="btn sm primary" onClick={() => setActiveMap(campaignId, m.id).then(() => flash('Mapa na mesa')).catch(showError)}><Eye size={14} /> Pôr na mesa</button>}
                {m.active && <span className="tag gold"><Check size={12} /> Na mesa</span>}
                <span className="spacer" />
                <button className="btn icon sm ghost danger" title="Apagar mapa" aria-label={`Apagar ${m.name}`} onClick={async () => {
                  if (await confirmBox(`Apagar o mapa "${m.name}"? A imagem também é apagada.`, { danger: true, ok: 'Apagar' })) deleteMap(m).catch(showError);
                }}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Floating panel over the map while the GM lines the grid up with the picture.
 * Changes show at once on this screen and are saved (and sent to everyone) a moment later.
 */
export function GridEditor({ map, onChange, onClose }: { map: BattleMapRow; onChange: (m: BattleMapRow) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(map);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setDraft(map); }, [map.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<BattleMapRow>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      updateMap(map.id, { grid_size: next.grid_size, grid_x: next.grid_x, grid_y: next.grid_y, show_grid: next.show_grid }).catch(showError);
    }, 400);
  };
  const num = (label: string, key: 'grid_size' | 'grid_x' | 'grid_y', min: number, max: number, step = 1) => (
    <label className="grid-ed-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={draft[key]} onChange={(e) => set({ [key]: +e.target.value })} />
      <input className="input" type="number" min={min} max={max} step={step} value={Math.round(draft[key] * 10) / 10} onChange={(e) => set({ [key]: +e.target.value || min })} />
    </label>
  );
  return (
    <div className="grid-ed" onPointerDown={(e) => e.stopPropagation()} role="group" aria-label="Ajustar grade">
      <div className="row g8" style={{ marginBottom: 8 }}>
        <b className="grow">Grade</b>
        <label className="row g6 small"><input type="checkbox" checked={draft.show_grid} onChange={(e) => set({ show_grid: e.target.checked })} /> Mostrar</label>
        <button className="btn sm primary" onClick={onClose}>Pronto</button>
      </div>
      {num('Quadrado', 'grid_size', 8, Math.max(200, Math.round(Math.min(map.width, map.height) / 2)), 0.5)}
      {num('Mover →', 'grid_x', 0, Math.round(draft.grid_size), 0.5)}
      {num('Mover ↓', 'grid_y', 0, Math.round(draft.grid_size), 0.5)}
      <p className="small muted m0">Ajuste até as linhas baterem com os quadrados desenhados no mapa. Cada quadrado vale 1,5 m.</p>
    </div>
  );
}

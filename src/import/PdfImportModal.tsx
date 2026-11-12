import { useState } from 'react';
import { Calculator, Check, FileText, TriangleAlert } from 'lucide-react';
import type { Edition, SrdData } from '../data/types';
import { useApp } from '../store';
import { className, speciesName } from '../engine/rules';
import { Modal, go, useFlash } from '../ui/ui';
import { finishPdfImport, type PdfChoices, type PdfImport } from './pdfSheet';

const CREATE = '__create';

/**
 * Review of a PDF sheet before saving: every field understood (and what the site will calculate
 * by itself), what wasn't recognized, and the class/race to link to an existing one or create.
 */
export function PdfImportModal({ r, srd, edition, onClose }: { r: PdfImport; srd: SrdData; edition: Edition; onClose: () => void }) {
  const importHomebrew = useApp((s) => s.importHomebrew);
  const addCharacter = useApp((s) => s.addCharacter);
  const flash = useFlash((s) => s.show);
  const [classes, setClasses] = useState<string[]>(() => r.classes.map((g) => g.classId || CREATE));
  const [hitDie, setHitDie] = useState(r.hitDie && [6, 8, 10, 12].includes(r.hitDie) ? r.hitDie : 8);
  const [race, setRace] = useState<string>(r.race.speciesId || (r.race.text ? CREATE : ''));
  const creating = classes.some((x) => x === CREATE) || race === CREATE;

  const save = () => {
    const choices: PdfChoices = {
      classes: classes.map((x) => (x === CREATE ? { create: true as const, hitDie } : x)),
      race: race === CREATE ? { create: true } : race || null,
    };
    const { character, homebrew } = finishPdfImport(r, choices, srd);
    if (homebrew.classes || homebrew.species) importHomebrew(edition, homebrew, { keepExisting: true });
    addCharacter(character);
    flash(`${character.name || 'Personagem'} importado do PDF!${creating ? ' Complete a classe ou raça nova em Homebrew.' : ''}`);
    onClose();
    go(`${edition}/c/${character.id}`);
  };

  const icon = (s: string) => (s === 'ok' ? <Check size={14} color="var(--good)" aria-label="reconhecido" /> : s === 'calc' ? <Calculator size={14} color="var(--muted)" aria-label="o site calcula" /> : <TriangleAlert size={14} color="var(--warn)" aria-label="conferir" />);

  return (
    <Modal wide title="Importar ficha em PDF" icon={<FileText size={18} />} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!r.character.name && !classes.length} onClick={save}><Check size={14} /> Importar ficha</button></>}>
      <p className="small muted" style={{ marginTop: 0 }}>Confira o que foi lido. Nada é salvo até você clicar em <b>Importar ficha</b>, e tudo pode ser ajustado depois na própria ficha.</p>

      {(r.classes.length > 0 || r.race.text) && (
        <div className="panel col g8 pdf-links">
          <b>Classe e raça</b>
          {r.classes.map((g, i) => (
            <label key={i} className="field">
              <span>“{g.text}” nível {g.level}{g.subclass ? ` (${g.subclass})` : ''}{!g.classId && <span className="tag gold" style={{ marginLeft: 6 }}>não está no site</span>}</span>
              <select className="select" value={classes[i]} onChange={(e) => setClasses(classes.map((x, j) => (j === i ? e.target.value : x)))}>
                <option value={CREATE}>Criar a classe “{g.text}” no Homebrew</option>
                {srd.classes.map((k) => <option key={k.id} value={k.id}>Usar {className(k.id, srd)}{k.custom ? ' (homebrew)' : ''}</option>)}
              </select>
            </label>
          ))}
          {classes.includes(CREATE) && (
            <label className="row small g6" title="O dado de vida define os PV ao subir de nível">Dado de vida da classe nova
              <select className="select" style={{ width: 'auto' }} value={hitDie} onChange={(e) => setHitDie(+e.target.value)}>{[6, 8, 10, 12].map((n) => <option key={n} value={n}>d{n}</option>)}</select>
            </label>
          )}
          {r.race.text && (
            <label className="field">
              <span>Raça “{r.race.text}”{!r.race.speciesId && <span className="tag gold" style={{ marginLeft: 6 }}>não está no site</span>}</span>
              <select className="select" value={race} onChange={(e) => setRace(e.target.value)}>
                <option value={CREATE}>Criar a raça “{r.race.text}” no Homebrew</option>
                <option value="">Deixar sem raça</option>
                {srd.species.map((s) => <option key={s.id} value={s.id}>Usar {speciesName(s.id, srd)}</option>)}
              </select>
            </label>
          )}
          {creating && <div className="small muted">A classe ou raça nova é criada só com o nome (e o dado de vida). Depois, em <b>Homebrew</b>, você completa as características de cada nível.</div>}
        </div>
      )}

      <table className="pdf-rows">
        <tbody>
          {r.rows.map((x, i) => (
            <tr key={i} className={x.status}>
              <td>{icon(x.status)}</td>
              <th>{x.label}</th>
              <td>{x.value}{x.note && <div className="tiny muted">{x.note}</div>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {r.unknown.length > 0 && (
        <div className="panel col g6 pdf-unknown">
          <div className="row g6"><TriangleAlert size={15} color="var(--warn)" /><b>Campos do PDF que o site não reconheceu ({r.unknown.length})</b></div>
          <div className="small muted">Copie à mão para a ficha o que for importante.</div>
          <ul>{r.unknown.map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul>
        </div>
      )}
    </Modal>
  );
}

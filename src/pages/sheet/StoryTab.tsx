import type { Character } from '../../data/types';
import { ALIGNMENTS } from '../../engine/rules';
import type { SheetProps } from '../Sheet';

type TextKey = 'personality' | 'ideals' | 'bonds' | 'flaws' | 'appearance' | 'backstory' | 'notes';

const FIELDS: [TextKey, string, string][] = [
  ['personality', 'Traços de personalidade', 'Como seu personagem age e fala?'],
  ['ideals', 'Ideais', 'No que ele acredita?'],
  ['bonds', 'Vínculos', 'Quem ou o que importa para ele?'],
  ['flaws', 'Defeitos', 'Qual a fraqueza dele?'],
];

export function StoryTab({ c, upd }: SheetProps) {
  const set = (k: TextKey) => (e: React.ChangeEvent<HTMLTextAreaElement>) => upd((d: Character) => (d[k] = e.target.value));
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel row wrap">
        <label className="field grow">Jogador<input className="input" value={c.player || ''} onChange={(e) => upd((d) => (d.player = e.target.value))} /></label>
        <label className="field grow">Tendência
          <select className="select" value={c.alignment || ''} onChange={(e) => upd((d) => (d.alignment = e.target.value))}>
            <option value="">—</option>{ALIGNMENTS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
      </div>
      <div className="sheet-grid-3">
        {FIELDS.map(([k, label, ph]) => (
          <div key={k} className="panel"><div className="panel-title"><h3>{label}</h3></div><textarea className="textarea" placeholder={ph} value={c[k]} onChange={set(k)} /></div>
        ))}
      </div>
      <div className="panel"><div className="panel-title"><h3>Aparência</h3></div><textarea className="textarea" value={c.appearance} onChange={set('appearance')} /></div>
      <div className="panel"><div className="panel-title"><h3>História</h3></div><textarea className="textarea" style={{ minHeight: 220 }} value={c.backstory} onChange={set('backstory')} /></div>
      <div className="panel"><div className="panel-title"><h3>Anotações da campanha</h3></div><textarea className="textarea" style={{ minHeight: 220 }} placeholder="NPCs, pistas, missões…" value={c.notes} onChange={set('notes')} /></div>
    </div>
  );
}

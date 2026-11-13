import { useState } from 'react';
import { ArrowLeft, Hand, Swords } from 'lucide-react';
import { fmtMod } from '../../engine/dice';
import { Markdown, Modal } from '../../ui/ui';
import { fullAttack, useAttackChoice } from './attack';

/**
 * Attacking with a weapon that has a choice: first its shape (a wand as a needle, normal or a
 * staff), then the grip when it is versatile (one hand or two). Then the usual attack and damage.
 */
export function AttackChooser() {
  const pending = useAttackChoice((s) => s.pending);
  const close = useAttackChoice((s) => s.set);
  const [form, setForm] = useState<number | null>(null);
  if (!pending) return null;
  const { who, a } = pending;
  const forms = a.forms || [];
  const shape = form != null ? forms[form] : null;
  const damage = shape ? shape.damage : a.damage;
  const alt = shape ? shape.altDamage : a.altDamage;
  const type = (shape?.type || a.type || '').trim();
  const done = () => { setForm(null); close(null); };
  const go = (dmg: string, grip?: string) => {
    const parts = [shape?.name, grip].filter(Boolean).join(', ');
    done();
    void fullAttack(who, { ...a, name: parts ? `${a.name} (${parts})` : a.name, damage: dmg, type });
  };
  const askShape = forms.length > 0 && form == null;

  return (
    <Modal title={`Atacar com ${a.name}`} icon={<Swords size={18} />} onClose={done}
      footer={!askShape && forms.length > 0 ? <button className="btn" onClick={() => setForm(null)}><ArrowLeft size={14} /> Outra forma</button> : undefined}>
      <div className="small muted" style={{ marginBottom: 10 }}>Acerto {fmtMod(a.toHit)}{type ? ` · dano ${type.toLowerCase()}` : ''}</div>
      {askShape ? (
        <div className="col g8">
          <div className="tiny muted">Em qual forma?</div>
          {forms.map((f, i) => (
            <button key={f.name + i} className="atk-choice" disabled={!f.damage} onClick={() => setForm(i)}>
              <b>{f.name}</b>
              <span>{f.damage ? [f.damage, f.altDamage && `${f.altDamage} com duas mãos`].filter(Boolean).join(' · ') : 'não ataca nesta forma'}</span>
              {f.desc && <div className="atk-choice-desc"><Markdown text={f.desc} /></div>}
            </button>
          ))}
        </div>
      ) : (
        <div className="col g8">
          {shape?.desc && <div className="small muted"><Markdown text={shape.desc} /></div>}
          <div className="tiny muted">{alt ? 'Com uma mão ou com as duas?' : 'Pronto para atacar'}</div>
          <div className="atk-grips">
            <button className="atk-choice" onClick={() => go(damage!, alt ? 'uma mão' : undefined)} disabled={!damage}>
              <Hand size={18} /><b>{alt ? 'Uma mão' : 'Atacar'}</b><span>{damage}</span>
            </button>
            {alt && (
              <button className="atk-choice" onClick={() => go(alt, 'duas mãos')}>
                <span className="two-hands"><Hand size={18} /><Hand size={18} /></span><b>Duas mãos</b><span>{alt}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Modal } from './ui';

/**
 * Site-styled replacements for window.alert / confirm / prompt.
 * Each returns a promise, so callers `await` the answer instead of blocking the page.
 */
type Req =
  | { kind: 'alert'; title: string; text: string; resolve: (v: void) => void }
  | { kind: 'confirm'; title: string; text: string; ok: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; text: string; value: string; ok: string; inputMode?: 'numeric'; resolve: (v: string | null) => void };

const useDialogs = create<{ queue: Req[] }>(() => ({ queue: [] }));
let seq = 0;
const ids = new WeakMap<Req, number>();
const push = (r: Req) => { ids.set(r, ++seq); useDialogs.setState((s) => ({ queue: [...s.queue, r] })); };
const pop = () => useDialogs.setState((s) => ({ queue: s.queue.slice(1) }));

export function alertBox(text: string, title = 'Aviso') {
  return new Promise<void>((resolve) => push({ kind: 'alert', title, text, resolve }));
}
export function confirmBox(text: string, opts: { title?: string; ok?: string; danger?: boolean } = {}) {
  return new Promise<boolean>((resolve) => push({ kind: 'confirm', title: opts.title ?? 'Confirmar', text, ok: opts.ok ?? 'Confirmar', danger: !!opts.danger, resolve }));
}
export function promptBox(text: string, opts: { title?: string; value?: string; ok?: string; numeric?: boolean } = {}) {
  return new Promise<string | null>((resolve) => push({ kind: 'prompt', title: opts.title ?? text, text: opts.title ? text : '', value: opts.value ?? '', ok: opts.ok ?? 'OK', inputMode: opts.numeric ? 'numeric' : undefined, resolve }));
}
/** Shows an error's message; handy as `.catch(showError)`. */
export const showError = (e: unknown) => void alertBox(e instanceof Error ? e.message : String(e), 'Não deu certo');

export function DialogHost() {
  const r = useDialogs((s) => s.queue[0]);
  return r ? <Dialog key={ids.get(r)} r={r} /> : null;
}

function Dialog({ r }: { r: Req }) {
  const [value, setValue] = useState(r.kind === 'prompt' ? r.value : '');
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (r.kind !== 'prompt') okRef.current?.focus(); }, [r.kind]);
  const finish = (answer: 'ok' | 'cancel') => {
    pop();
    if (r.kind === 'alert') r.resolve();
    else if (r.kind === 'confirm') r.resolve(answer === 'ok');
    else r.resolve(answer === 'ok' ? value : null);
  };
  const lines = r.text ? r.text.split('\n') : [];
  return (
    <Modal
      title={r.title}
      onClose={() => finish('cancel')}
      footer={
        <>
          {r.kind !== 'alert' && <button className="btn" onClick={() => finish('cancel')}>Cancelar</button>}
          <button ref={okRef} className={'btn ' + (r.kind === 'confirm' && r.danger ? 'danger' : 'primary')} onClick={() => finish('ok')}>
            {r.kind === 'alert' ? 'OK' : r.ok}
          </button>
        </>
      }
    >
      {lines.map((l, i) => (l ? <p key={i} style={{ margin: '0 0 8px' }}>{l}</p> : null))}
      {r.kind === 'prompt' && (
        <form onSubmit={(e) => { e.preventDefault(); finish('ok'); }}>
          <input className="input" autoFocus inputMode={r.inputMode} value={value} onChange={(e) => setValue(e.target.value)} aria-label={r.title} style={{ width: '100%' }} />
        </form>
      )}
    </Modal>
  );
}

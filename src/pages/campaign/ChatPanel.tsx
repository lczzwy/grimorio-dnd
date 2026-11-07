import { useEffect, useMemo, useRef, useState } from 'react';
import { EyeOff, Palette, Send, Trash2 } from 'lucide-react';
import { useDice } from '../../store';
import { deleteChat, sendChat, useTableFeed } from '../../cloud/chat';
import { colorFor, mergeFeed, parseChatInput, PLAYER_COLORS, type FeedItem } from '../../cloud/chatLogic';
import { setMyColor } from '../../cloud/campaigns';
import { useFlash } from '../../ui/ui';
import { useParty } from './TableTab';
import type { CampaignProps } from '../Campaign';
import { DicePrefsButtons } from '../../dice3d/TableDice';

const time = (iso: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

interface Person { name: string; char?: string; portrait?: string; color: string; gm: boolean }

/** Live table chat: messages and rolls in one timeline. "/r 2d6+3 dano" rolls for everyone. */
export function ChatPanel({ campaign, members, isGm, uid }: CampaignProps) {
  const { msgs, rolls, addLocal } = useTableFeed(campaign.id);
  const feed = useMemo(() => mergeFeed(msgs, rolls), [msgs, rolls]);
  const chars = useParty(members.map((m) => m.character_id).filter((x): x is string => !!x));
  const flash = useFlash((s) => s.show);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pickColor, setPickColor] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const byUser = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const me = byUser.get(uid);
  const who = (userId: string, fallback: string): Person => {
    const m = byUser.get(userId);
    const ch = m?.character_id ? chars[m.character_id] : undefined;
    return { name: m?.display_name || fallback, char: ch?.name, portrait: ch?.portrait, color: colorFor(userId, m?.color), gm: m?.role === 'gm' };
  };

  // follow new lines unless the user scrolled up to read history
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  const submit = async () => {
    const input = parseChatInput(text);
    if (input.kind === 'empty') return;
    if (input.kind === 'error') return flash(input.message);
    if (input.kind === 'roll') {
      const myChar = me?.character_id ? chars[me.character_id]?.name : undefined;
      useDice.getState().roll(input.label, input.formula, { charName: myChar });
      setText('');
      stick.current = true;
      return;
    }
    setSending(true);
    try {
      addLocal(await sendChat(campaign.id, input.body));
      setText('');
      stick.current = true;
    } catch (e) {
      flash('A mensagem não foi enviada: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const chooseColor = async (c: string) => {
    setPickColor(false);
    try {
      await setMyColor(campaign.id, c);
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const myColor = colorFor(uid, me?.color);
  return (
    <div className="chat panel">
      <div className="panel-title">
        <h3>Chat da mesa</h3>
        <span className="spacer" />
        <DicePrefsButtons />
        <button className="btn ghost sm" title="Sua cor na mesa" onClick={() => setPickColor(!pickColor)}>
          <span className="chat-dot" style={{ background: myColor }} /> <Palette size={14} />
        </button>
      </div>
      {pickColor && (
        <div className="chat-colors">
          <span className="tiny muted" style={{ width: '100%' }}>Sua cor na mesa (nome e dados)</span>
          {PLAYER_COLORS.map((c) => (
            <button key={c} className={'chat-swatch' + (myColor === c ? ' on' : '')} style={{ background: c }} title={c} onClick={() => chooseColor(c)} />
          ))}
        </div>
      )}
      <div
        className="chat-list"
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {feed.length === 0 && (
          <div className="empty small">
            Ninguém falou nada ainda. Escreva uma mensagem ou role com <b>/r 1d20+5</b>.
          </div>
        )}
        {feed.map((it, i) => {
          const prev = feed[i - 1];
          const compact = !!prev && prev.row.user_id === it.row.user_id && prev.type === 'msg' && it.type === 'msg' && Date.parse(it.at) - Date.parse(prev.at) < 120000;
          return <Line key={it.type + (it.row.id ?? i)} it={it} p={who(it.row.user_id, it.row.author)} compact={compact} canDelete={it.row.user_id === uid || isGm} />;
        })}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input className="input" value={text} maxLength={1000} placeholder="Mensagem, ou /r 2d6+3 dano" onChange={(e) => setText(e.target.value)} />
        <button className="btn primary icon" disabled={sending || !text.trim()} title="Enviar">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

function Line({ it, p, compact, canDelete }: { it: FeedItem; p: Person; compact: boolean; canDelete: boolean }) {
  const head = (
    <div className="chat-head">
      <span className="chat-av" style={{ borderColor: p.color, background: p.portrait ? `center / cover url(${p.portrait})` : p.color }}>
        {!p.portrait && (p.name.trim()[0]?.toUpperCase() || '?')}
      </span>
      <b style={{ color: p.color }}>{p.char || p.name}</b>
      {p.char && <span className="tiny muted">{p.name}</span>}
      {p.gm && <span className="tag gold" style={{ padding: '0 5px' }}>mestre</span>}
      <span className="spacer" />
      <span className="tiny faint">{time(it.at)}</span>
    </div>
  );
  if (it.type === 'msg') {
    return (
      <div className={'chat-line' + (compact ? ' compact' : '')}>
        {!compact && head}
        <div className="chat-body">
          {it.row.body}
          {canDelete && (
            <button className="chat-del" title="Apagar" onClick={() => deleteChat(it.row.id).catch((e) => alert(e.message))}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }
  const r = it.row;
  return (
    <div className="chat-line">
      {head}
      <div className={'chat-roll ' + (r.kind === 'crit' || r.kind === 'fumble' ? r.kind : '')} style={{ borderLeftColor: p.color, borderStyle: r.hidden ? 'dashed' : undefined }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="chat-roll-label">
            {r.label}
            {r.hidden && (
              <span className="tag" style={{ marginLeft: 6 }}>
                <EyeOff size={11} /> oculta
              </span>
            )}
          </div>
          <div className="small muted mono">
            {r.formula} [{r.rolls.join(', ')}]{r.dropped?.length ? ` ~${r.dropped.join(',')}` : ''}
            {r.kind === 'adv' ? ' · vantagem' : r.kind === 'dis' ? ' · desvantagem' : ''}
          </div>
        </div>
        <div className="chat-total">{r.total}</div>
      </div>
    </div>
  );
}

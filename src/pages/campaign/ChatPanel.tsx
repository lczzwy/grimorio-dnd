import { useEffect, useMemo, useRef, useState } from 'react';
import { EyeOff, Palette, Send, Trash2 } from 'lucide-react';
import { useDice } from '../../store';
import { deleteChat, sendChat, useTableFeed } from '../../cloud/chat';
import { colorFor, mergeFeed, parseChatInput, PLAYER_COLORS, rollBreakdown, type FeedItem } from '../../cloud/chatLogic';
import { setMyColor } from '../../cloud/campaigns';
import { useFlash } from '../../ui/ui';
import { useParty } from './TableTab';
import type { CampaignProps } from '../Campaign';
import { DicePrefsButtons, useDicePrefs } from '../../dice3d/TableDice';
import { useTyping, typingText } from '../../cloud/typing';
import { playMessageSound } from '../../dice3d/sound';
import { useReveal } from '../../dice3d/reveal';
import { showError } from '../../ui/dialogs';

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];
const BASE_TITLE = typeof document !== 'undefined' ? document.title : '';

const time = (iso: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

interface Person { name: string; char?: string; portrait?: string; color: string; gm: boolean }

/** Live table chat: messages and rolls in one timeline. "/r 2d6+3 dano" rolls for everyone. */
export function ChatPanel({ campaign, members, isGm, uid }: CampaignProps) {
  const { msgs, rolls, addLocal } = useTableFeed(campaign.id);
  const held = useReveal((s) => s.hidden);
  const feed = useMemo(() => mergeFeed(msgs, rolls.filter((r) => !r.id || !held[r.id])), [msgs, rolls, held]);
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

  const myChar = me?.character_id ? chars[me.character_id]?.name : undefined;
  const { typers, typing, stopped } = useTyping(campaign.id, uid, myChar || me?.display_name || 'Alguém');

  // background tab: count what others say/roll, show it in the tab title and play a soft sound
  const unread = useRef(0);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(feed.map((it) => it.type + it.row.id));
    if (seen.current === null) { seen.current = ids; return; } // first load: nothing is "new"
    const fresh = feed.filter((it) => !seen.current!.has(it.type + it.row.id) && it.row.user_id !== uid);
    seen.current = ids;
    if (!fresh.length || !document.hidden) return;
    unread.current += fresh.length;
    document.title = `(${unread.current}) ${BASE_TITLE}`;
    if (useDicePrefs.getState().sound) playMessageSound();
  }, [feed, uid]);
  useEffect(() => {
    const back = () => { if (!document.hidden) { unread.current = 0; document.title = BASE_TITLE; } };
    document.addEventListener('visibilitychange', back);
    return () => { document.removeEventListener('visibilitychange', back); document.title = BASE_TITLE; };
  }, []);

  const mode = useDice((s) => s.mode);
  const setMode = useDice((s) => s.setMode);
  const quickRoll = (sides: number) => {
    useDice.getState().roll(`d${sides}`, `1d${sides}`, { charName: myChar });
    stick.current = true;
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
    stopped();
    if (input.kind === 'roll') {
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
      <div className="chat-typing" aria-live="polite">{typingText(typers)}</div>
      <div className="chat-quick">
        {QUICK_DICE.map((n) => (
          <button key={n} type="button" className="chat-qd" title={`Rolar 1d${n}`} onClick={() => quickRoll(n)}>d{n}</button>
        ))}
        <span className="spacer" />
        <button type="button" className={'chat-qd adv' + (mode === 'adv' ? ' on' : '')} title="Vantagem na próxima rolagem de d20" onClick={() => setMode(mode === 'adv' ? 'normal' : 'adv')}>VAN</button>
        <button type="button" className={'chat-qd dis' + (mode === 'dis' ? ' on' : '')} title="Desvantagem na próxima rolagem de d20" onClick={() => setMode(mode === 'dis' ? 'normal' : 'dis')}>DES</button>
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input className="input" value={text} maxLength={1000} placeholder="Mensagem, ou /r 2d6+3 dano" onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) typing(); else stopped(); }} />
        <button className="btn primary icon" disabled={sending || !text.trim()} title="Enviar">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

/** One chat line (exported for the visual check in development). */
export function Line({ it, p, compact, canDelete }: { it: FeedItem; p: Person; compact: boolean; canDelete: boolean }) {
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
            <button className="chat-del" title="Apagar" onClick={() => deleteChat(it.row.id).catch(showError)}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }
  return <RollLine it={it} p={p} head={head} />;
}

/** A roll in the chat; clicking it opens the full calculation. */
function RollLine({ it, p, head }: { it: Extract<FeedItem, { type: 'roll' }>; p: Person; head: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const r = it.row;
  const crit = r.kind === 'crit', fumble = r.kind === 'fumble';
  const b = open ? rollBreakdown(r.formula, r.rolls, r.dropped, r.kind) : null;
  return (
    <div className="chat-line">
      {head}
      <div
        className={'chat-roll' + (crit ? ' crit' : fumble ? ' fumble' : '') + (r.hidden ? ' hidden' : '') + (open ? ' open' : '')}
        style={{ borderLeftColor: p.color }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title={open ? 'Fechar detalhes' : 'Ver de onde veio cada número'}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
      >
        <div className="chat-roll-top">
          <span className="chat-roll-label">{r.label}</span>
          <span className="chat-roll-formula">{r.formula}{r.kind === 'adv' ? ' · vant.' : r.kind === 'dis' ? ' · desv.' : ''}</span>
          {r.hidden && <EyeOff size={11} className="faint" />}
        </div>
        <div className="chat-roll-dice">
          {r.rolls.map((v, i) => <span key={i} className="chat-die">{v}</span>)}
          {r.dropped?.map((v, i) => <span key={'d' + i} className="chat-die dropped" title="descartado">{v}</span>)}
          <span className="chat-eq">=</span>
          <b className="chat-total">{r.total}</b>
        </div>
        {b && (
          <div className="chat-detail" onClick={(e) => e.stopPropagation()}>
            {b.parts.map((part, i) => (
              <div key={i} className="chat-detail-row">
                <span className="chat-detail-k">{i > 0 || part.sign < 0 ? (part.sign < 0 ? '− ' : '+ ') : ''}{part.label}</span>
                <span className="chat-detail-v">
                  {part.dice.map((v, j) => <span key={j} className={'chat-die' + (part.sides === 20 && v === 20 ? ' nat20' : part.sides === 20 && v === 1 ? ' nat1' : '')}>{v}</span>)}
                  {part.dice.length > 1 && <span className="muted"> = {part.subtotal}</span>}
                  {part.dropped.length > 0 && <span className="muted"> · descartado {part.dropped.map((v, j) => <span key={j} className="chat-die dropped">{v}</span>)}</span>}
                </span>
              </div>
            ))}
            {b.mod !== 0 && (
              <div className="chat-detail-row">
                <span className="chat-detail-k">{b.mod > 0 ? '+' : '−'} modificador</span>
                <span className="chat-detail-v"><b>{Math.abs(b.mod)}</b></span>
              </div>
            )}
            <div className="chat-detail-notes">
              {b.adv === 'adv' && <span className="tag good">vantagem: rolou 2d20 e ficou com o maior</span>}
              {b.adv === 'dis' && <span className="tag bad">desvantagem: rolou 2d20 e ficou com o menor</span>}
              {b.crit && <span className="tag gold">crítico: dados de dano dobrados</span>}
              {crit && <span className="tag good">20 natural</span>}
              {fumble && <span className="tag bad">1 natural</span>}
            </div>
            <div className="tiny faint">{p.char ? `${p.char} (${p.name})` : p.name} · {r.created_at ? new Date(r.created_at).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

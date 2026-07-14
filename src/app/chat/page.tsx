'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import {
  MessageSquare, Send, User, Users, Loader2, AlertCircle, Search,
  Paperclip, Smile, MoreVertical, Phone, Video as VideoIcon,
  CheckCheck, FileText, Play, Pause, Download, Volume2, X,
  ChevronDown, Reply, Copy, Star, Forward, Info,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface WhatsAppInstance {
  id: string; name: string; status: string;
  phone: string | null; profileName: string | null; profilePicUrl: string | null;
}

interface Chat {
  id: string; name?: string; unreadCount?: number;
  conversationTimestamp?: number; lastMessage?: string;
  phoneNumber?: string;
}

interface Message {
  key: { id: string; fromMe: boolean; remoteJid: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string; mimetype?: string };
    videoMessage?: { caption?: string; mimetype?: string };
    audioMessage?: { mimetype?: string; seconds?: number };
    documentMessage?: { title?: string; mimetype?: string; fileName?: string };
    stickerMessage?: { mimetype?: string };
    viewOnceMessage?: { message?: any };
    viewOnceMessageV2?: { message?: any };
    viewOnceMessageV2Extension?: { message?: any };
  };
  text?: string;
  messageTimestamp?: number;
  pushName?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#e17055','#00b894','#0984e3','#6c5ce7','#fd79a8',
  '#fdcb6e','#00cec9','#d63031','#a29bfe','#74b9ff',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function getMsgText(msg: Message) {
  let messageObj = msg.message;
  if (messageObj?.viewOnceMessage?.message) {
    messageObj = messageObj.viewOnceMessage.message;
  } else if (messageObj?.viewOnceMessageV2?.message) {
    messageObj = messageObj.viewOnceMessageV2.message;
  } else if (messageObj?.viewOnceMessageV2Extension?.message) {
    messageObj = messageObj.viewOnceMessageV2Extension.message;
  }
  return messageObj?.conversation || messageObj?.extendedTextMessage?.text || msg.text || '';
}

function playPing() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(1320, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.35);
  } catch {}
}

// ─── Emojis ─────────────────────────────────────────────────────────────────

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘',
  '😋','😛','😜','🤪','🤩','🥳','😎','🤓','😏','😒','😔','😟','😢','😭','😤','😠',
  '🤬','🤯','😱','😨','😰','😥','🤗','🤔','🤭','🤫','🙄','😮','🥱','😴','🤤','😇',
  '👍','👎','👌','✌️','🤞','🤟','🤙','👋','✋','🖐️','💪','🙏','🤝','👏','🙌','🤲',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞','💓','💗','💖','💘','💝','💔',
  '🔥','⭐','✨','💥','🎉','🎊','🎈','🏆','💯','✅','❌','❓','💬','🔔','🎁','🌈',
  '☀️','🌙','⚡','💫','🌸','🍕','🍔','🍺','🎵','🎶','🚀','⚽','🏀','🎮','📱','💻',
];

// ─── Avatar Component ────────────────────────────────────────────────────────

function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  const bg = avatarColor(name || '?');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      fontWeight: 700, color: 'white', userSelect: 'none',
      fontSize: size < 36 ? '0.68rem' : size < 52 ? '0.84rem' : '1.2rem',
    }}>
      {initials(name || '?')}
    </div>
  );
}

// ─── Audio Player ────────────────────────────────────────────────────────────

function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = () => {
    if (!ref.current) return;
    playing ? ref.current.pause() : ref.current.play().catch(console.error);
  };

  useEffect(() => {
    const a = ref.current; if (!a) return;
    const p = () => setPlaying(true), pa = () => setPlaying(false),
      t = () => setCur(a.currentTime), m = () => setDur(a.duration),
      e = () => { setPlaying(false); setCur(0); };
    a.addEventListener('play', p); a.addEventListener('pause', pa);
    a.addEventListener('timeupdate', t); a.addEventListener('loadedmetadata', m);
    a.addEventListener('ended', e);
    return () => {
      a.removeEventListener('play', p); a.removeEventListener('pause', pa);
      a.removeEventListener('timeupdate', t); a.removeEventListener('loadedmetadata', m);
      a.removeEventListener('ended', e);
    };
  }, []);

  const fmt = (v: number) => isNaN(v) ? '0:00' : `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.3rem 0.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: 12, minWidth: 230 }}>
      <audio ref={ref} src={src} preload="metadata" />
      <button type="button" onClick={toggle} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0f172a', flexShrink: 0 }}>
        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, cursor: 'pointer' }}
          onClick={e => {
            if (!ref.current || !dur) return;
            const r = e.currentTarget.getBoundingClientRect();
            ref.current.currentTime = ((e.clientX - r.left) / r.width) * dur;
          }}>
          <div style={{ height: '100%', background: '#25d366', borderRadius: 2, width: `${dur ? (cur / dur) * 100 : 0}%`, transition: 'width 0.1s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
          <span>{fmt(cur)}</span><span>{fmt(dur)}</span>
        </div>
      </div>
      <Volume2 size={13} color="rgba(255,255,255,0.38)" />
    </div>
  );
}

// ─── Date Separator ──────────────────────────────────────────────────────────

function DateSep({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0.6rem 0', gap: '0.6rem' }}>
      <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.05)' }} />
      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)', background: '#182229', padding: '3px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', flexShrink: 0, animation: 'wa-pulse 1.6s ease-in-out infinite' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 11, background: 'rgba(255,255,255,0.05)', borderRadius: 6, width: `${50 + (i * 13) % 35}%`, marginBottom: 7, animation: 'wa-pulse 1.6s ease-in-out infinite' }} />
            <div style={{ height: 9, background: 'rgba(255,255,255,0.03)', borderRadius: 6, width: `${65 + (i * 7) % 25}%`, animation: 'wa-pulse 1.6s ease-in-out 0.4s infinite' }} />
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const C = {
  bg: '#0b141a', sidebar: '#111b21', panel: '#202c33',
  input: '#2a3942', green: '#25d366', accent: '#00a884',
  myBubble: '#005c4b', theirBubble: '#202c33',
};

export default function ChatPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selInstance, setSelInstance] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selChat, setSelChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [hoverMsg, setHoverMsg] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msg: Message } | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);

  const msgEndRef = useRef<HTMLDivElement>(null);
  const msgAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevMsgLen = useRef(0);

  // ── Instances ──
  useEffect(() => {
    (async () => {
      try {
        setLoadingInstances(true);
        const r = await fetch('/api/whatsapp/instances');
        if (r.ok) {
          const d = await r.json();
          const conn = d.filter((i: WhatsAppInstance) => i.status === 'CONNECTED');
          setInstances(conn);
          if (conn.length > 0) setSelInstance(conn[0].name);
        }
      } catch {}
      finally { setLoadingInstances(false); }
    })();
  }, []);

  // ── Chats ──
  useEffect(() => {
    if (!selInstance) return;
    setChats([]); setSelChat(null); setMessages([]);

    async function load(initial = false) {
      try {
        if (initial) setLoadingChats(true);
        const r = await fetch(`/api/chat/chats?instanceName=${selInstance}`);
        if (r.ok) {
          const d = await r.json();
          setChats(prev => JSON.stringify(prev) !== JSON.stringify(d) ? d : prev);
        }
      } catch {}
      finally { if (initial) setLoadingChats(false); }
    }
    load(true);
    const iv = setInterval(() => load(), 8000);
    return () => clearInterval(iv);
  }, [selInstance]);

  // ── Messages ──
  useEffect(() => {
    if (!selInstance || !selChat) return;
    const jid = selChat.id;

    async function load(initial = false) {
      try {
        if (initial) setLoadingMsgs(true);
        const r = await fetch(`/api/chat/messages?instanceName=${selInstance}&remoteJid=${jid}`);
        if (r.ok) {
          const d = await r.json();
          const sorted = Array.isArray(d) ? d.reverse() : [];
          setMessages(prev => {
            const changed = prev.length !== sorted.length ||
              (sorted.length > 0 && prev.length > 0 && prev[prev.length - 1].key.id !== sorted[sorted.length - 1].key.id);
            if (changed) {
              if (!initial && sorted.length > prev.length) {
                const newOnes = sorted.slice(prev.length);
                if (newOnes.some((m: Message) => !m.key.fromMe)) playPing();
              }
              return sorted;
            }
            return prev;
          });
        }
      } catch {}
      finally { if (initial) setLoadingMsgs(false); }
    }
    load(true);
    const iv = setInterval(() => load(), 4000);
    return () => clearInterval(iv);
  }, [selInstance, selChat]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (messages.length > prevMsgLen.current) {
      const area = msgAreaRef.current;
      if (area) {
        const near = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
        if (near) msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMsgLen.current = messages.length;
  }, [messages]);

  // ── Page title badge ──
  useEffect(() => {
    const total = chats.reduce((s, c) => s + (c.unreadCount || 0), 0);
    document.title = total > 0 ? `(${total}) WaJato — Conversas` : 'WaJato — Conversas';
    return () => { document.title = 'WaJato'; };
  }, [chats]);

  // ── Close menus on outside click ──
  useEffect(() => {
    const close = () => { setCtxMenu(null); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-emoji-picker]') && !t.closest('[data-emoji-btn]')) setShowEmoji(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  // ── Send ──
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selInstance || !selChat || !newMsg.trim() || sending) return;
    const txt = newMsg, reply = replyTo;
    setNewMsg(''); setReplyTo(null); setSending(true);

    const temp: Message = {
      key: { id: Math.random().toString(), fromMe: true, remoteJid: selChat.id },
      message: { conversation: txt },
      messageTimestamp: Math.floor(Date.now() / 1000),
    };
    setMessages(p => [...p, temp]);
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: selInstance, remoteJid: selChat.id, message: txt,
          quotedMessageId: reply?.key.id,
          quotedMessage: reply?.message,
        }),
      });
    } catch {}
    finally { setSending(false); }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Filtered chats ──
  const filtered = useMemo(() => {
    let list = chats;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.name?.toLowerCase().includes(q)) || c.id.includes(q));
    }
    if (filter === 'unread') list = list.filter(c => (c.unreadCount || 0) > 0);
    if (filter === 'groups') list = list.filter(c => c.id.endsWith('@g.us'));
    return list;
  }, [chats, search, filter]);

  // ── Date label ──
  const dateLabel = (ts: number) => {
    const d = new Date(ts * 1000), today = new Date(), yest = new Date();
    yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yest.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ── Group messages by date ──
  const grouped = useMemo(() => {
    const groups: { label: string; msgs: Message[] }[] = [];
    let cur = '';
    messages.forEach(m => {
      const lbl = m.messageTimestamp ? dateLabel(m.messageTimestamp) : '';
      if (lbl !== cur) { cur = lbl; groups.push({ label: lbl, msgs: [m] }); }
      else groups[groups.length - 1].msgs.push(m);
    });
    return groups;
  }, [messages]);

  const fmtTime = (ts?: number) => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const fmtDate = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000), t = new Date(), y = new Date();
    y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return fmtTime(ts);
    if (d.toDateString() === y.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const isGroup = selChat?.id.endsWith('@g.us');
  const mediaUrl = (msg: Message) =>
    `/api/chat/media?instanceName=${selInstance}&messageId=${msg.key.id}&fromMe=${msg.key.fromMe}&remoteJid=${selChat?.id}`;

  const renderContent = (msg: Message) => {
    let messageObj = msg.message;
    let isViewOnce = false;

    if (messageObj?.viewOnceMessage?.message) {
      messageObj = messageObj.viewOnceMessage.message;
      isViewOnce = true;
    } else if (messageObj?.viewOnceMessageV2?.message) {
      messageObj = messageObj.viewOnceMessageV2.message;
      isViewOnce = true;
    } else if (messageObj?.viewOnceMessageV2Extension?.message) {
      messageObj = messageObj.viewOnceMessageV2Extension.message;
      isViewOnce = true;
    }

    const txt = messageObj?.conversation || messageObj?.extendedTextMessage?.text || msg.text || '';
    if (txt && !messageObj?.imageMessage && !messageObj?.videoMessage) {
      return (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
          {isViewOnce && <span style={{ color: '#ffb300', fontWeight: 600, marginRight: 5 }}>[Visualização Única]</span>}
          {txt}
        </div>
      );
    }

    if (messageObj?.imageMessage) {
      const url = mediaUrl(msg);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {isViewOnce && <div style={{ color: '#ffb300', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>👁️ Foto de Visualização Única (Salva)</div>}
          <img src={url} alt="Imagem" loading="lazy" onClick={() => window.open(url, '_blank')}
            style={{ borderRadius: 8, maxWidth: '100%', maxHeight: 280, objectFit: 'cover', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }} />
          {messageObj.imageMessage.caption && <div style={{ fontSize: '0.84rem', whiteSpace: 'pre-wrap' }}>{messageObj.imageMessage.caption}</div>}
        </div>
      );
    }
    if (messageObj?.videoMessage) {
      const url = mediaUrl(msg);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {isViewOnce && <div style={{ color: '#ffb300', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>👁️ Vídeo de Visualização Única (Salvo)</div>}
          <video src={url} controls preload="metadata" style={{ borderRadius: 8, maxWidth: '100%', maxHeight: 240, background: '#000' }} />
          {messageObj.videoMessage.caption && <div style={{ fontSize: '0.84rem', whiteSpace: 'pre-wrap' }}>{messageObj.videoMessage.caption}</div>}
        </div>
      );
    }
    if (messageObj?.audioMessage) return <AudioPlayer src={mediaUrl(msg)} />;
    if (messageObj?.documentMessage) {
      const url = mediaUrl(msg);
      const name = messageObj.documentMessage.title || messageObj.documentMessage.fileName || 'Documento';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', padding: '10px 14px', borderRadius: 8, minWidth: 210 }}>
          <FileText size={22} color="#25d366" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)' }}>{messageObj.documentMessage.mimetype || 'document'}</div>
          </div>
          <a href={url} download={name} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', textDecoration: 'none' }}>
            <Download size={12} />
          </a>
        </div>
      );
    }
    if (messageObj?.contactMessage) {
      const contact = messageObj.contactMessage;
      const displayName = contact.displayName || "Contato";
      let phone = '';
      const waidMatch = contact.vcard?.match(/waid=(\d+)/);
      if (waidMatch) {
        phone = '+' + waidMatch[1];
      } else {
        const telMatch = contact.vcard?.match(/TEL;[^:]+:([^\n\r]+)/);
        if (telMatch) {
          phone = telMatch[1].trim();
        }
      }
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', padding: '10px 14px', borderRadius: 8, minWidth: 210 }}>
          <User size={22} color="#25d366" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
            {phone && <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.38)' }}>{phone}</div>}
          </div>
        </div>
      );
    }
    if (messageObj?.contactsArrayMessage) {
      const contacts = messageObj.contactsArrayMessage.contacts || [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,0.06)', padding: '10px 14px', borderRadius: 8, minWidth: 210 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6 }}>
            <Users size={18} color="#25d366" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{contacts.length} Contatos</span>
          </div>
          {contacts.map((c: any, ci: number) => {
            let phone = '';
            const waidMatch = c.vcard?.match(/waid=(\d+)/);
            if (waidMatch) phone = '+' + waidMatch[1];
            return (
              <div key={ci} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>{c.displayName || 'Contato'}</span>
                {phone && <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.38)' }}>{phone}</span>}
              </div>
            );
          })}
        </div>
      );
    }
    if (messageObj?.stickerMessage) return <img src={mediaUrl(msg)} alt="Sticker" style={{ width: 110, height: 110, objectFit: 'contain' }} />;
    return <div style={{ color: 'rgba(255,255,255,0.28)', fontStyle: 'italic', fontSize: '0.78rem' }}>[Tipo não suportado]</div>;
  };

  const openChat = (chat: Chat) => {
    setSelChat(chat); setShowInfo(false); setReplyTo(null); setShowEmoji(false);
  };

  const copy = (text: string) => navigator.clipboard.writeText(text).catch(console.error);

  return (
    <AppLayout title="Conversas Chat">
      <style>{`
        @keyframes wa-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes wa-slideRight { from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1} }
        @keyframes wa-fadeUp { from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1} }
        @keyframes wa-spin { to{transform:rotate(360deg)} }
        .animate-spin { animation: wa-spin 1s linear infinite; }
        .wa-chat-item:hover { background: #1f2d35 !important; }
        .wa-hover-btns { opacity:0; transition:opacity 0.15s; pointer-events:none; }
        .wa-bubble-row:hover .wa-hover-btns { opacity:1; pointer-events:all; }
        .wa-filter-tab { border:none;background:none;cursor:pointer;transition:color 0.15s,border-color 0.15s; }
        .wa-filter-tab:hover { color:#e2e8f0 !important; }
        textarea { resize:none; scrollbar-width:none; }
        textarea::-webkit-scrollbar { display:none; }
        .wa-ctx-item:hover { background:rgba(255,255,255,0.07) !important; }
        .chat-override { margin:-2rem; }
      `}</style>

      <div className="chat-override" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: 'calc(100vh - var(--header-height) - 1px)', overflow: 'hidden', background: C.bg }}>

        {/* ════ SIDEBAR ════ */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.sidebar, borderRight: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>

          {/* Instance selector */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.59rem', color: 'rgba(255,255,255,0.28)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: '0.4rem' }}>Instância Ativa</div>
            {loadingInstances ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' }}>
                <Loader2 size={13} className="animate-spin" /> Carregando...
              </div>
            ) : instances.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#ef4444', fontSize: '0.78rem' }}>
                <AlertCircle size={13} /> Nenhum chip conectado
              </div>
            ) : (
              <select value={selInstance} onChange={e => setSelInstance(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.7rem', background: C.panel, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, color: 'white', fontSize: '0.81rem', fontWeight: 600, cursor: 'pointer' }}>
                {instances.map(i => <option key={i.id} value={i.name} style={{ background: C.sidebar }}>🟢 {i.name}{i.profileName ? ` (${i.profileName})` : ''}</option>)}
              </select>
            )}
          </div>

          {/* Search bar */}
          <div style={{ padding: '0.5rem 0.85rem 0.35rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.panel, padding: '0.38rem 0.7rem', borderRadius: 8 }}>
              <Search size={14} color="rgba(255,255,255,0.28)" />
              <input type="text" placeholder="Pesquisar conversa..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ background: 'none', border: 'none', color: 'white', outline: 'none', fontSize: '0.79rem', width: '100%' }} />
              {search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 0 }}><X size={13} /></button>}
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', padding: '0 0.85rem 0.25rem', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {(['all', 'unread', 'groups'] as const).map(f => (
              <button key={f} className="wa-filter-tab" onClick={() => setFilter(f)}
                style={{ flex: 1, padding: '0.38rem 0', fontSize: '0.7rem', fontWeight: 600,
                  color: filter === f ? C.green : 'rgba(255,255,255,0.32)',
                  borderBottom: filter === f ? `2px solid ${C.green}` : '2px solid transparent' }}>
                {f === 'all' ? 'Todas' : f === 'unread' ? 'Não lidas' : 'Grupos'}
              </button>
            ))}
          </div>

          {/* Count badge */}
          <div style={{ padding: '0.3rem 1rem 0.2rem', flexShrink: 0 }}>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>
              {filtered.length} conversa{filtered.length !== 1 ? 's' : ''}
              {filter !== 'all' && ` (filtro: ${filter === 'unread' ? 'não lidas' : 'grupos'})`}
            </span>
          </div>

          {/* Chats list */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loadingChats ? <Skeleton /> : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'rgba(255,255,255,0.2)', fontSize: '0.78rem' }}>Nenhuma conversa encontrada.</div>
            ) : (
              filtered.map(chat => {
                const sel = selChat?.id === chat.id;
                const displayNum = chat.phoneNumber ? `+${chat.phoneNumber}` : chat.id.split('@')[0];
                const name = chat.name && !chat.name.includes('@') ? chat.name : displayNum;
                const unread = (chat.unreadCount || 0) > 0;
                return (
                  <div key={chat.id} className="wa-chat-item"
                    onClick={() => openChat(chat)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', cursor: 'pointer', background: sel ? '#2a3942' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.12s' }}>
                    <Avatar name={name} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>{name}</div>
                        {chat.conversationTimestamp && <span style={{ fontSize: '0.63rem', color: unread ? C.green : 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap', fontWeight: unread ? 600 : 400 }}>{fmtDate(chat.conversationTimestamp)}</span>}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
                          {chat.lastMessage || 'Mídia ou anexo'}
                        </div>
                        {unread && (
                          <span style={{ background: C.accent, color: '#111b21', fontSize: '0.63rem', fontWeight: 800, padding: '1px 7px', borderRadius: 10, minWidth: 18, textAlign: 'center', flexShrink: 0 }}>
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ════ CHAT PANEL ════ */}
        <div style={{ display: 'flex', height: '100%', minWidth: 0, overflow: 'hidden' }}>
          {/* Main */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
            {selChat ? (
              <>
                {/* Header */}
                <div style={{ padding: '0.55rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.panel, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => setShowInfo(v => !v)}>
                    <Avatar name={selChat.name && !selChat.name.includes('@') ? selChat.name : (selChat.phoneNumber ? `+${selChat.phoneNumber}` : selChat.id.split('@')[0])} size={38} />
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '0.87rem', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selChat.name && !selChat.name.includes('@') ? selChat.name : (selChat.phoneNumber ? `+${selChat.phoneNumber}` : selChat.id.split('@')[0])}
                      </h3>
                      <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.3)' }}>
                        {isGroup ? `Grupo • toque para detalhes` : `${selChat.phoneNumber ? `+${selChat.phoneNumber}` : selChat.id.split('@')[0]} • toque para detalhes`}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', color: 'rgba(255,255,255,0.48)', flexShrink: 0 }}>
                    <button type="button" aria-label="Videochamada" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.48)', display: 'flex', alignItems: 'center', padding: 0 }}><VideoIcon size={18} /></button>
                    <button type="button" aria-label="Ligar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.48)', display: 'flex', alignItems: 'center', padding: 0 }}><Phone size={17} /></button>
                    <button type="button" aria-label="Buscar mensagem" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.48)', display: 'flex', alignItems: 'center', padding: 0 }}><Search size={17} /></button>
                    <button type="button" aria-label="Informações" onClick={e => { e.stopPropagation(); setShowInfo(v => !v); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: showInfo ? C.green : 'rgba(255,255,255,0.48)', display: 'flex', alignItems: 'center', padding: 0 }}><Info size={17} /></button>
                    <button type="button" aria-label="Mais opções" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.48)', display: 'flex', alignItems: 'center', padding: 0 }}><MoreVertical size={17} /></button>
                  </div>
                </div>

                {/* Messages area */}
                <div ref={msgAreaRef}
                  onScroll={() => {
                    const a = msgAreaRef.current;
                    if (a) setShowScrollBtn(a.scrollHeight - a.scrollTop - a.clientHeight > 180);
                  }}
                  onClick={() => setCtxMenu(null)}
                  style={{
                    flex: 1, overflowY: 'auto', padding: '0.85rem 1.25rem',
                    display: 'flex', flexDirection: 'column', gap: '1px', minHeight: 0,
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.022) 1px, transparent 1px)',
                    backgroundSize: '22px 22px', backgroundColor: C.bg,
                  }}>

                  {loadingMsgs && messages.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'rgba(255,255,255,0.28)' }}>
                      <Loader2 className="animate-spin" size={26} style={{ color: C.green }} />
                      <span style={{ fontSize: '0.8rem' }}>Carregando conversa...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.2)', gap: 8 }}>
                      <MessageSquare size={30} />
                      <span style={{ fontSize: '0.8rem' }}>Sem histórico de mensagens.</span>
                    </div>
                  ) : (
                    grouped.map((group, gi) => (
                      <div key={gi}>
                        {group.label && <DateSep label={group.label} />}
                        {group.msgs.map((msg, mi) => {
                          const fromMe = msg.key.fromMe;
                          const prev = mi > 0 ? group.msgs[mi - 1] : null;
                          const next = mi < group.msgs.length - 1 ? group.msgs[mi + 1] : null;
                          const samePrev = prev?.key.fromMe === fromMe;
                          const sameNext = next?.key.fromMe === fromMe;
                          const id = msg.key.id || `${gi}-${mi}`;

                          const br = fromMe
                            ? `${samePrev ? 4 : 8}px ${samePrev ? 4 : 0}px ${sameNext ? 4 : 8}px ${sameNext ? 4 : 8}px`
                            : `${samePrev ? 4 : 0}px ${samePrev ? 4 : 8}px ${sameNext ? 4 : 8}px ${sameNext ? 4 : 8}px`;

                          return (
                            <div key={id} className="wa-bubble-row"
                              style={{ display: 'flex', flexDirection: 'column', alignItems: fromMe ? 'flex-end' : 'flex-start', width: '100%', marginBottom: sameNext ? 1 : 5 }}
                              onMouseEnter={() => setHoverMsg(id)}
                              onMouseLeave={() => setHoverMsg(null)}
                              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, msg }); }}>

                              {isGroup && !fromMe && !samePrev && msg.pushName && (
                                <span style={{ fontSize: '0.63rem', color: avatarColor(msg.pushName), marginLeft: 34, marginBottom: 2, fontWeight: 600 }}>
                                  {msg.pushName}
                                </span>
                              )}

                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexDirection: fromMe ? 'row-reverse' : 'row', maxWidth: '67%' }}>
                                {/* Group avatar */}
                                {isGroup && !fromMe && !sameNext && <Avatar name={msg.pushName || '?'} size={24} />}
                                {isGroup && !fromMe && sameNext && <div style={{ width: 24, flexShrink: 0 }} />}

                                {/* Bubble */}
                                <div style={{ padding: '0.4rem 0.68rem', borderRadius: br, background: fromMe ? C.myBubble : C.theirBubble, color: 'white', fontSize: '0.85rem', lineHeight: 1.45, boxShadow: '0 1px 3px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.02)' }}>
                                  <div style={{ marginBottom: 3 }}>{renderContent(msg)}</div>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, fontSize: '0.58rem', color: fromMe ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.26)' }}>
                                    <span>{fmtTime(msg.messageTimestamp)}</span>
                                    {fromMe && <CheckCheck size={10} color="#53bdeb" />}
                                  </div>
                                </div>

                                {/* Hover actions */}
                                <div className="wa-hover-btns" style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                                  <button type="button" title="Responder" onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                                    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(32,44,51,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(4px)' }}>
                                    <Reply size={12} />
                                  </button>
                                  {getMsgText(msg) && (
                                    <button type="button" title="Copiar texto" onClick={() => copy(getMsgText(msg))}
                                      style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(32,44,51,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(4px)' }}>
                                      <Copy size={12} />
                                    </button>
                                  )}
                                  <button type="button" title="Mais opções" onClick={e => { e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, msg }); }}
                                    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(32,44,51,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(4px)' }}>
                                    <MoreVertical size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                  <div ref={msgEndRef} />
                </div>

                {/* Scroll to bottom */}
                {showScrollBtn && (
                  <button type="button" onClick={() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    style={{ position: 'absolute', bottom: replyTo ? 135 : 80, right: 20, width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#2a3942', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.45)', zIndex: 10, transition: 'transform 0.15s' }}>
                    <ChevronDown size={18} />
                  </button>
                )}

                {/* Reply preview */}
                {replyTo && (
                  <div style={{ background: '#1d2b33', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '0.55rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, animation: 'wa-fadeUp 0.15s ease' }}>
                    <div style={{ flex: 1, borderLeft: `3px solid ${C.green}`, paddingLeft: '0.6rem', minWidth: 0 }}>
                      <div style={{ fontSize: '0.68rem', color: C.green, fontWeight: 700, marginBottom: 2 }}>
                        {replyTo.key.fromMe ? 'Você' : (replyTo.pushName || 'Contato')}
                      </div>
                      <div style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getMsgText(replyTo) || '[Mídia]'}
                      </div>
                    </div>
                    <button type="button" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: 2 }}>
                      <X size={15} />
                    </button>
                  </div>
                )}

                {/* Input bar */}
                <div style={{ background: C.panel, borderTop: '1px solid rgba(255,255,255,0.02)', flexShrink: 0, position: 'relative' }}>
                  {/* Emoji picker */}
                  {showEmoji && (
                    <div data-emoji-picker style={{ position: 'absolute', bottom: '100%', left: '0.75rem', background: '#2a3942', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '0.75rem', width: 310, maxHeight: 250, overflowY: 'auto', boxShadow: '0 10px 28px rgba(0,0,0,0.55)', zIndex: 30, animation: 'wa-fadeUp 0.15s ease' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 3 }}>
                        {EMOJIS.map((em, i) => (
                          <div key={i} onClick={() => { setNewMsg(p => p + em); setShowEmoji(false); inputRef.current?.focus(); }}
                            style={{ fontSize: '1.35rem', cursor: 'pointer', padding: 3, borderRadius: 6, textAlign: 'center', transition: 'background 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {em}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSend} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'flex-end', gap: '0.7rem' }}>
                    <div style={{ display: 'flex', gap: '0.7rem', color: 'rgba(255,255,255,0.48)', paddingBottom: '0.3rem' }}>
                      <button type="button" data-emoji-btn onClick={() => setShowEmoji(v => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: showEmoji ? C.green : 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', padding: 2 }}>
                        <Smile size={20} />
                      </button>
                      <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', padding: 2 }}>
                        <Paperclip size={20} />
                      </button>
                    </div>
                    <textarea ref={inputRef} value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={handleKey}
                      placeholder="Mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                      disabled={sending} rows={1}
                      style={{ flex: 1, padding: '0.5rem 1rem', background: C.input, border: 'none', borderRadius: 10, color: 'white', fontSize: '0.85rem', outline: 'none', lineHeight: 1.45, maxHeight: 120, overflowY: 'auto' }}
                      onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
                    />
                    <button type="submit" disabled={!newMsg.trim() || sending}
                      style={{ background: 'none', border: 'none', cursor: newMsg.trim() && !sending ? 'pointer' : 'default', opacity: newMsg.trim() && !sending ? 1 : 0.32, display: 'flex', alignItems: 'center', padding: '2px 2px 5px' }}>
                      {sending ? <Loader2 size={19} className="animate-spin" color={C.green} /> : <Send size={19} color={newMsg.trim() ? C.green : '#8696a0'} />}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              /* Empty state */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.1rem', padding: '2rem', background: '#222e35' }}>
                <div style={{ width: 82, height: 82, borderRadius: '50%', background: 'rgba(37,211,102,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(37,211,102,0.13)' }}>
                  <MessageSquare size={36} style={{ color: C.green }} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 600 }}>WaJato Multichat</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', maxWidth: 330, lineHeight: 1.6 }}>
                  Selecione uma conversa na lista à esquerda para começar a atender seus clientes.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.25rem' }}>
                  {[`${chats.length} conversas`, `${chats.filter(c => (c.unreadCount || 0) > 0).length} não lidas`, `${chats.filter(c => c.id.endsWith('@g.us')).length} grupos`].map((s, i) => (
                    <span key={i} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.04)', padding: '3px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>{s}</span>
                  ))}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCheck size={12} color={C.accent} /> Conectado com segurança
                </div>
              </div>
            )}
          </div>

          {/* Contact info panel (slide-in) */}
          {showInfo && selChat && (
            <div style={{ width: 310, background: '#0d1b22', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', animation: 'wa-slideRight 0.22s ease', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.87rem', fontWeight: 600, color: 'white' }}>Informações do Contato</span>
                <button type="button" onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center' }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1rem' }}>
                {/* Avatar big */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <Avatar name={selChat.name && !selChat.name.includes('@') ? selChat.name : (selChat.phoneNumber ? `+${selChat.phoneNumber}` : selChat.id.split('@')[0])} size={82} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'white', marginBottom: 4 }}>
                      {selChat.name && !selChat.name.includes('@') ? selChat.name : (selChat.phoneNumber ? `+${selChat.phoneNumber}` : selChat.id.split('@')[0])}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.38)' }}>
                      {isGroup ? '👥 Grupo do WhatsApp' : `📱 ${selChat.phoneNumber ? `+${selChat.phoneNumber}` : selChat.id.split('@')[0]}`}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {[{ icon: <Phone size={16} />, label: 'Ligar' }, { icon: <VideoIcon size={16} />, label: 'Vídeo' }].map((btn, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(37,211,102,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.green, border: '1px solid rgba(37,211,102,0.15)' }}>
                          {btn.icon}
                        </div>
                        <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.38)' }}>{btn.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Info list */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { label: 'ID / Número', value: selChat.phoneNumber ? `+${selChat.phoneNumber}` : selChat.id.split('@')[0] },
                    { label: 'Tipo', value: isGroup ? 'Grupo' : 'Contato Individual' },
                    { label: 'Não lidas', value: String(selChat.unreadCount || 0) },
                    { label: 'Total de mensagens', value: String(messages.length) },
                  ].map((row, i, arr) => (
                    <div key={i} style={{ padding: '0.7rem 1rem', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div style={{ fontSize: '0.65rem', color: C.green, marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{row.label}</div>
                      <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.65)' }}>{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Context menu */}
        {ctxMenu && (
          <div style={{ position: 'fixed', top: Math.min(ctxMenu.y, window.innerHeight - 200), left: Math.min(ctxMenu.x, window.innerWidth - 180), background: '#2a3942', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 11, padding: '0.3rem', boxShadow: '0 10px 28px rgba(0,0,0,0.55)', zIndex: 1000, minWidth: 170, animation: 'wa-fadeUp 0.12s ease' }}
            onClick={e => e.stopPropagation()}>
            {[
              { icon: <Reply size={14} />, label: 'Responder', action: () => { setReplyTo(ctxMenu.msg); setCtxMenu(null); inputRef.current?.focus(); } },
              { icon: <Copy size={14} />, label: 'Copiar texto', action: () => { copy(getMsgText(ctxMenu.msg)); setCtxMenu(null); }, disabled: !getMsgText(ctxMenu.msg) },
              { icon: <Star size={14} />, label: 'Destacar', action: () => setCtxMenu(null) },
              { icon: <Forward size={14} />, label: 'Encaminhar', action: () => setCtxMenu(null) },
            ].filter(item => !item.disabled).map((item, i) => (
              <div key={i} className="wa-ctx-item" onClick={item.action}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.48rem 0.75rem', borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.78)', fontSize: '0.81rem', transition: 'background 0.1s' }}>
                {item.icon}{item.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

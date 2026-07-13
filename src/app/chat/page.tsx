'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import {
  MessageSquare,
  Send,
  User,
  Users,
  Loader2,
  AlertCircle,
  Search,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video as VideoIcon,
  CheckCheck,
  FileText,
  Play,
  Pause,
  Download,
  Volume2,
  ArrowLeft,
} from 'lucide-react';

interface WhatsAppInstance {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
}

interface Chat {
  id: string;
  name?: string;
  unreadCount?: number;
  conversationTimestamp?: number;
  lastMessage?: string;
}

interface Message {
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string; mimetype?: string };
    videoMessage?: { caption?: string; mimetype?: string };
    audioMessage?: { mimetype?: string; seconds?: number };
    documentMessage?: { title?: string; mimetype?: string; fileName?: string };
    stickerMessage?: { mimetype?: string };
  };
  text?: string;
  messageTimestamp?: number;
  pushName?: string;
}

// ─── Audio Player ────────────────────────────────────────────────────────────
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play().catch(console.error);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const fmt = (t: number) => {
    if (isNaN(t)) return '0:00';
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', minWidth: '220px' }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" onClick={togglePlay} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0f172a', flexShrink: 0 }}>
        {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: '#25d366', borderRadius: 2, width: `${duration ? (currentTime / duration) * 100 : 0}%`, transition: 'width 0.1s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
      <Volume2 size={14} color="rgba(255,255,255,0.4)" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // mobile: show chat panel when a chat is selected
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch instances ──
  useEffect(() => {
    (async () => {
      try {
        setLoadingInstances(true);
        const res = await fetch('/api/whatsapp/instances');
        if (res.ok) {
          const data = await res.json();
          const connected = data.filter((i: WhatsAppInstance) => i.status === 'CONNECTED');
          setInstances(connected);
          if (connected.length > 0) setSelectedInstance(connected[0].name);
        } else {
          setError('Erro ao carregar instâncias');
        }
      } catch { setError('Erro de conexão'); }
      finally { setLoadingInstances(false); }
    })();
  }, []);

  // ── Fetch chats ──
  useEffect(() => {
    if (!selectedInstance) return;
    setChats([]);
    setSelectedChat(null);
    setMessages([]);
    setMobileChatOpen(false);

    async function load(initial = false) {
      try {
        if (initial) setLoadingChats(true);
        const res = await fetch(`/api/chat/chats?instanceName=${selectedInstance}`);
        if (res.ok) {
          const data = await res.json();
          setChats(prev => JSON.stringify(prev) !== JSON.stringify(data) ? data : prev);
        }
      } catch { /* silent */ }
      finally { if (initial) setLoadingChats(false); }
    }

    load(true);
    const iv = setInterval(() => load(false), 8000);
    return () => clearInterval(iv);
  }, [selectedInstance]);

  // ── Fetch messages ──
  useEffect(() => {
    if (!selectedInstance || !selectedChat) return;
    const jid = selectedChat.id;

    async function load(initial = false) {
      try {
        if (initial) setLoadingMessages(true);
        const res = await fetch(`/api/chat/messages?instanceName=${selectedInstance}&remoteJid=${jid}`);
        if (res.ok) {
          const data = await res.json();
          const sorted = Array.isArray(data) ? data.reverse() : [];
          setMessages(prev => {
            const changed = prev.length !== sorted.length ||
              (prev.length > 0 && sorted.length > 0 && prev[prev.length - 1].key.id !== sorted[sorted.length - 1].key.id);
            return changed ? sorted : prev;
          });
        }
      } catch { /* silent */ }
      finally { if (initial) setLoadingMessages(false); }
    }

    load(true);
    const iv = setInterval(() => load(false), 4000);
    return () => clearInterval(iv);
  }, [selectedInstance, selectedChat]);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstance || !selectedChat || !newMessage.trim() || sendingMessage) return;
    const txt = newMessage;
    setNewMessage('');
    setSendingMessage(true);
    const temp: Message = {
      key: { id: Math.random().toString(), fromMe: true, remoteJid: selectedChat.id },
      message: { conversation: txt },
      messageTimestamp: Math.floor(Date.now() / 1000),
    };
    setMessages(prev => [...prev, temp]);
    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: selectedInstance, remoteJid: selectedChat.id, message: txt }),
      });
    } catch { /* silent */ }
    finally { setSendingMessage(false); }
  };

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter(c => (c.name && c.name.toLowerCase().includes(q)) || c.id.toLowerCase().includes(q));
  }, [chats, searchQuery]);

  const fmtTime = (ts?: number) => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const fmtDate = (ts?: number) => ts ? new Date(ts * 1000).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';

  const isGroup = selectedChat?.id.endsWith('@g.us');
  const mediaUrl = (msg: Message) => `/api/chat/media?instanceName=${selectedInstance}&messageId=${msg.key.id}&fromMe=${msg.key.fromMe}&remoteJid=${selectedChat?.id}`;

  const renderContent = (msg: Message) => {
    if (msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.text) {
      return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.text}</div>;
    }
    if (msg.message?.imageMessage) {
      const url = mediaUrl(msg);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <img src={url} alt="Imagem" loading="lazy" onClick={() => window.open(url, '_blank')}
            style={{ borderRadius: 8, maxWidth: '100%', maxHeight: 280, objectFit: 'cover', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }} />
          {msg.message.imageMessage.caption && <div style={{ fontSize: '0.84rem', whiteSpace: 'pre-wrap' }}>{msg.message.imageMessage.caption}</div>}
        </div>
      );
    }
    if (msg.message?.videoMessage) {
      const url = mediaUrl(msg);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <video src={url} controls preload="metadata" style={{ borderRadius: 8, maxWidth: '100%', maxHeight: 240, background: '#000' }} />
          {msg.message.videoMessage.caption && <div style={{ fontSize: '0.84rem', whiteSpace: 'pre-wrap' }}>{msg.message.videoMessage.caption}</div>}
        </div>
      );
    }
    if (msg.message?.audioMessage) return <AudioPlayer src={mediaUrl(msg)} />;
    if (msg.message?.documentMessage) {
      const url = mediaUrl(msg);
      const name = msg.message.documentMessage.title || msg.message.documentMessage.fileName || 'Documento';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.06)', padding: '10px 14px', borderRadius: 8 }}>
          <FileText size={22} color="#f59e0b" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>{msg.message.documentMessage.mimetype || 'document'}</div>
          </div>
          <a href={url} download={name} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Download size={13} />
          </a>
        </div>
      );
    }
    if (msg.message?.stickerMessage) {
      return <img src={mediaUrl(msg)} alt="Sticker" style={{ width: 110, height: 110, objectFit: 'contain' }} />;
    }
    return <div style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', fontSize: '0.78rem' }}>[Tipo não suportado]</div>;
  };

  // ── Colours ──
  const C = {
    bg: '#0b141a',
    sidebar: '#111b21',
    panel: '#202c33',
    input: '#2a3942',
    green: '#25d366',
    myBubble: '#005c4b',
    theirBubble: '#202c33',
  };

  const openChat = (chat: Chat) => {
    setSelectedChat(chat);
    setMobileChatOpen(true);
  };

  return (
    <AppLayout title="Conversas Chat">
      {/* Override page-container padding so chat fills the space */}
      <style>{`
        .chat-layout-override { margin: -2rem; }
        @media (max-width: 768px) {
          .chat-sidebar { display: ${mobileChatOpen ? 'none' : 'flex'} !important; }
          .chat-panel { display: ${mobileChatOpen ? 'flex' : 'none'} !important; }
        }
      `}</style>

      <div
        className="chat-layout-override"
        style={{
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          height: 'calc(100vh - var(--header-height) - 1px)',
          overflow: 'hidden',
          background: C.bg,
        }}
      >
        {/* ══ LEFT: Contacts Sidebar ══ */}
        <div
          className="chat-sidebar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: C.sidebar,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Instance selector */}
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '0.45rem' }}>
              Instância Ativa
            </div>
            {loadingInstances ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                <Loader2 size={14} className="animate-spin" /> Carregando...
              </div>
            ) : instances.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: '0.8rem' }}>
                <AlertCircle size={14} /> Nenhum chip conectado
              </div>
            ) : (
              <select
                value={selectedInstance}
                onChange={e => setSelectedInstance(e.target.value)}
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: C.panel, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, color: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {instances.map(inst => (
                  <option key={inst.id} value={inst.name} style={{ background: C.sidebar }}>
                    🟢 {inst.name}{inst.profileName ? ` (${inst.profileName})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Search */}
          <div style={{ padding: '0.5rem 0.85rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.panel, padding: '0.4rem 0.75rem', borderRadius: 8 }}>
              <Search size={15} color="rgba(255,255,255,0.3)" />
              <input
                type="text"
                placeholder="Pesquisar conversa..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ background: 'none', border: 'none', color: 'white', outline: 'none', fontSize: '0.8rem', width: '100%' }}
              />
            </div>
          </div>

          {/* Chats list — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loadingChats ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4rem 0', color: 'rgba(255,255,255,0.3)' }}>
                <Loader2 className="animate-spin" size={22} style={{ color: C.green }} />
                <span style={{ fontSize: '0.78rem' }}>Carregando conversas...</span>
              </div>
            ) : filteredChats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filteredChats.map(chat => {
                const sel = selectedChat?.id === chat.id;
                const grp = chat.id.endsWith('@g.us');
                return (
                  <div
                    key={chat.id}
                    onClick={() => openChat(chat)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.7rem 1rem',
                      cursor: 'pointer',
                      background: sel ? '#2a3942' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#1f2d35'; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: sel ? 'rgba(37,211,102,0.12)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {grp ? <Users size={18} color={sel ? C.green : 'rgba(255,255,255,0.45)'} /> : <User size={18} color={sel ? C.green : 'rgba(255,255,255,0.45)'} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
                          {chat.name || chat.id.split('@')[0]}
                        </div>
                        {chat.conversationTimestamp && (
                          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                            {fmtDate(chat.conversationTimestamp)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
                          {chat.lastMessage || 'Mídia ou anexo'}
                        </div>
                        {chat.unreadCount !== undefined && chat.unreadCount > 0 && (
                          <span style={{ background: '#00a884', color: '#111b21', fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: 10, minWidth: 16, textAlign: 'center', flexShrink: 0 }}>
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

        {/* ══ RIGHT: Chat Panel ══ */}
        <div
          className="chat-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: C.bg,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {selectedChat ? (
            <>
              {/* Header */}
              <div style={{ padding: '0.65rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.panel, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {/* Mobile back button */}
                  <button
                    type="button"
                    onClick={() => setMobileChatOpen(false)}
                    style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4 }}
                    className="mobile-back-btn"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isGroup ? <Users size={16} color="#94a3b8" /> : <User size={16} color="#94a3b8" />}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'white' }}>
                      {selectedChat.name || selectedChat.id.split('@')[0]}
                    </h3>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.32)' }}>
                      {isGroup ? 'Grupo do WhatsApp' : `+${selectedChat.id.split('@')[0]}`}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1.25rem', color: 'rgba(255,255,255,0.55)' }}>
                  <VideoIcon size={18} style={{ cursor: 'pointer' }} />
                  <Phone size={17} style={{ cursor: 'pointer' }} />
                  <MoreVertical size={18} style={{ cursor: 'pointer' }} />
                </div>
              </div>

              {/* Messages area — scrollable */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', minHeight: 0 }}>
                {loadingMessages && messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'rgba(255,255,255,0.3)' }}>
                    <Loader2 className="animate-spin" size={28} style={{ color: C.green }} />
                    <span style={{ fontSize: '0.82rem' }}>Carregando conversa...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.22)', gap: 8 }}>
                    <MessageSquare size={32} />
                    <span style={{ fontSize: '0.82rem' }}>Sem histórico de mensagens.</span>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const fromMe = msg.key.fromMe;
                    return (
                      <div key={msg.key.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: fromMe ? 'flex-end' : 'flex-start', width: '100%' }}>
                        {isGroup && !fromMe && msg.pushName && (
                          <span style={{ fontSize: '0.65rem', color: C.green, marginLeft: 6, marginBottom: 2, fontWeight: 600 }}>
                            {msg.pushName}
                          </span>
                        )}
                        <div style={{
                          maxWidth: '65%',
                          padding: '0.45rem 0.7rem',
                          borderRadius: fromMe ? '8px 0 8px 8px' : '0 8px 8px 8px',
                          background: fromMe ? C.myBubble : C.theirBubble,
                          color: 'white',
                          fontSize: '0.86rem',
                          lineHeight: 1.45,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                        }}>
                          <div style={{ marginBottom: 3 }}>{renderContent(msg)}</div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, fontSize: '0.6rem', color: fromMe ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.3)' }}>
                            <span>{fmtTime(msg.messageTimestamp)}</span>
                            {fromMe && <CheckCheck size={11} color="#53bdeb" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <form onSubmit={handleSend} style={{ padding: '0.55rem 1.1rem', background: C.panel, display: 'flex', alignItems: 'center', gap: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.02)', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '0.85rem', color: 'rgba(255,255,255,0.55)' }}>
                  <Smile size={20} style={{ cursor: 'pointer' }} />
                  <Paperclip size={20} style={{ cursor: 'pointer' }} />
                </div>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Mensagem..."
                  disabled={sendingMessage}
                  style={{ flex: 1, padding: '0.5rem 1rem', background: C.input, border: 'none', borderRadius: 8, color: 'white', fontSize: '0.86rem', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sendingMessage}
                  style={{ background: 'none', border: 'none', cursor: newMessage.trim() && !sendingMessage ? 'pointer' : 'default', opacity: newMessage.trim() && !sendingMessage ? 1 : 0.35, color: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', padding: 6 }}
                >
                  {sendingMessage ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} color="#8696a0" />}
                </button>
              </form>
            </>
          ) : (
            /* Empty state */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.1rem', padding: '2rem', background: '#222e35' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={32} style={{ color: '#00a884' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'white', fontWeight: 600 }}>WaJato Multichat</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.38)', textAlign: 'center', maxWidth: 320, lineHeight: 1.55 }}>
                Selecione uma conversa na lista à esquerda para começar a atender.
              </p>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', width: '100%', margin: '0.5rem 0' }} />
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCheck size={13} color="#00a884" />
                Conectado com segurança
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

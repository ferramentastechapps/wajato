'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { 
  MessageSquare, 
  Send, 
  User, 
  Users, 
  Clock,
  Loader2,
  AlertCircle,
  Search,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video as VideoIcon,
  Check,
  CheckCheck,
  FileText,
  Play,
  Pause,
  Download,
  Image as ImageIcon,
  Volume2
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
  id: string; // JID: ex "5511999999999@s.whatsapp.net" ou "120363...@g.us"
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
    extendedTextMessage?: {
      text?: string;
    };
    imageMessage?: {
      caption?: string;
      mimetype?: string;
    };
    videoMessage?: {
      caption?: string;
      mimetype?: string;
    };
    audioMessage?: {
      mimetype?: string;
      seconds?: number;
    };
    documentMessage?: {
      title?: string;
      mimetype?: string;
      fileName?: string;
    };
    stickerMessage?: {
      mimetype?: string;
    };
  };
  text?: string;
  messageTimestamp?: number;
  pushName?: string;
}

// Custom Audio Player component to render audio messages beautifully like WhatsApp
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error(e));
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const formatAudioTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', minWidth: '220px' }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button 
        type="button"
        onClick={togglePlay}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          border: 'none', background: '#f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#0f172a'
        }}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        {/* Progress slider bar */}
        <div style={{
          height: 4, background: 'rgba(255,255,255,0.15)',
          borderRadius: 2, position: 'relative', width: '100%'
        }}>
          <div style={{
            height: '100%', background: '#f59e0b',
            borderRadius: 2, width: `${duration ? (currentTime / duration) * 100 : 0}%`
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
      <Volume2 size={16} color="rgba(255,255,255,0.4)" />
    </div>
  );
}

export default function ChatPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Loading & Error states
  const [loadingInstances, setLoadingInstances] = useState<boolean>(true);
  const [loadingChats, setLoadingChats] = useState<boolean>(false);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch WhatsApp instances on mount
  useEffect(() => {
    async function fetchInstances() {
      try {
        setLoadingInstances(true);
        const res = await fetch('/api/whatsapp/instances');
        if (res.ok) {
          const data = await res.json();
          const connected = data.filter((inst: WhatsAppInstance) => inst.status === 'CONNECTED');
          setInstances(connected);
          if (connected.length > 0) {
            setSelectedInstance(connected[0].name);
          }
        } else {
          setError('Erro ao carregar instâncias de WhatsApp');
        }
      } catch (err) {
        console.error(err);
        setError('Erro ao se conectar com o servidor');
      } finally {
        setLoadingInstances(false);
      }
    }
    fetchInstances();
  }, []);

  // Fetch chats when selected instance changes
  useEffect(() => {
    if (!selectedInstance) return;
    
    setChats([]);
    setSelectedChat(null);
    setMessages([]);
    
    async function fetchChats(isInitial = false) {
      try {
        if (isInitial) setLoadingChats(true);
        const res = await fetch(`/api/chat/chats?instanceName=${selectedInstance}`);
        if (res.ok) {
          const data = await res.json();
          // Evita atualizar o estado caso o array seja idêntico
          setChats(prev => {
            const hasChanged = JSON.stringify(prev) !== JSON.stringify(data);
            return hasChanged ? data : prev;
          });
        } else {
          console.error('Erro ao buscar conversas da instância');
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isInitial) setLoadingChats(false);
      }
    }

    fetchChats(true);

    // Poll chats dynamically (background update without layout freeze)
    const interval = setInterval(() => fetchChats(false), 8000);
    return () => clearInterval(interval);
  }, [selectedInstance]);

  // Fetch messages when selected chat changes
  useEffect(() => {
    if (!selectedInstance || !selectedChat) return;

    const remoteJid = selectedChat.id;

    async function fetchMessages(isInitial = false) {
      try {
        if (isInitial) setLoadingMessages(true);
        const res = await fetch(`/api/chat/messages?instanceName=${selectedInstance}&remoteJid=${remoteJid}`);
        if (res.ok) {
          const data = await res.json();
          const sorted = Array.isArray(data) ? data.reverse() : [];
          
          // Performance optimization: Only update state if new messages arrived
          setMessages(prev => {
            const hasChanged = prev.length !== sorted.length || 
                              (prev.length > 0 && sorted.length > 0 && prev[prev.length - 1].key.id !== sorted[sorted.length - 1].key.id);
            return hasChanged ? sorted : prev;
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isInitial) setLoadingMessages(false);
      }
    }

    fetchMessages(true);

    // Poll messages every 4 seconds for instant chat experience without freezes
    const interval = setInterval(() => fetchMessages(false), 4000);
    return () => clearInterval(interval);
  }, [selectedInstance, selectedChat]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstance || !selectedChat || !newMessage.trim() || sendingMessage) return;

    const messageText = newMessage;
    setNewMessage('');
    setSendingMessage(true);

    // Optimistic UI updates
    const tempMsg: Message = {
      key: {
        id: Math.random().toString(),
        fromMe: true,
        remoteJid: selectedChat.id,
      },
      message: {
        conversation: messageText
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: selectedInstance,
          remoteJid: selectedChat.id,
          message: messageText
        })
      });

      if (!res.ok) {
        console.error('Erro ao enviar mensagem');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingMessage(false);
    }
  };

  // Filter chats by name or JID in the search bar
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) || 
      c.id.toLowerCase().includes(q)
    );
  }, [chats, searchQuery]);

  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const isGroup = selectedChat?.id.endsWith('@g.us');

  // Build the correct media proxy url
  const getMediaUrl = (msg: Message) => {
    return `/api/chat/media?instanceName=${selectedInstance}&messageId=${msg.key.id}&fromMe=${msg.key.fromMe}&remoteJid=${selectedChat?.id}`;
  };

  // Render WhatsApp styled bubbles based on the message type
  const renderMessageContent = (msg: Message) => {
    // 1. Text Message
    if (msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.text) {
      const txt = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.text || '';
      return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{txt}</div>;
    }

    // 2. Image Message
    if (msg.message?.imageMessage) {
      const imgUrl = getMediaUrl(msg);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <img 
            src={imgUrl} 
            alt="Imagem" 
            loading="lazy"
            style={{ 
              borderRadius: '8px', 
              maxWidth: '100%', 
              maxHeight: '300px', 
              objectFit: 'cover',
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
            onClick={() => window.open(imgUrl, '_blank')}
          />
          {msg.message.imageMessage.caption && (
            <div style={{ fontSize: '0.85rem', color: 'inherit', whiteSpace: 'pre-wrap' }}>
              {msg.message.imageMessage.caption}
            </div>
          )}
        </div>
      );
    }

    // 3. Video Message
    if (msg.message?.videoMessage) {
      const videoUrl = getMediaUrl(msg);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <video 
            src={videoUrl} 
            controls 
            preload="metadata"
            style={{ 
              borderRadius: '8px', 
              maxWidth: '100%', 
              maxHeight: '260px', 
              background: '#000'
            }}
          />
          {msg.message.videoMessage.caption && (
            <div style={{ fontSize: '0.85rem', color: 'inherit', whiteSpace: 'pre-wrap' }}>
              {msg.message.videoMessage.caption}
            </div>
          )}
        </div>
      );
    }

    // 4. Audio Message
    if (msg.message?.audioMessage) {
      const audioUrl = getMediaUrl(msg);
      return <AudioPlayer src={audioUrl} />;
    }

    // 5. Document Message
    if (msg.message?.documentMessage) {
      const docUrl = getMediaUrl(msg);
      const title = msg.message.documentMessage.title || msg.message.documentMessage.fileName || 'Arquivo Documento';
      return (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(255,255,255,0.06)', padding: '10px 14px',
          borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <FileText size={24} style={{ color: '#f59e0b' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
              {msg.message.documentMessage.mimetype || 'document'}
            </div>
          </div>
          <a 
            href={docUrl} 
            download={title}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'white',
              cursor: 'pointer', transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <Download size={14} />
          </a>
        </div>
      );
    }

    // 6. Sticker Message
    if (msg.message?.stickerMessage) {
      const stickerUrl = getMediaUrl(msg);
      return (
        <img 
          src={stickerUrl} 
          alt="Sticker" 
          style={{ width: '120px', height: '120px', objectFit: 'contain' }}
        />
      );
    }

    return (
      <div style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', fontSize: '0.8rem' }}>
        [Tipo de mensagem não suportado]
      </div>
    );
  };

  return (
    <AppLayout title="Conversas Chat">
      <div 
        className="card" 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '340px 1fr', 
          height: 'calc(100vh - 190px)', 
          padding: 0, 
          overflow: 'hidden',
          background: '#0b141a', // WhatsApp Dark Mode background color
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)'
        }}
      >
        {/* Left Sidebar: Instance & Chats list */}
        <div style={{ 
          borderRight: '1px solid rgba(255, 255, 255, 0.06)', 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%',
          background: '#111b21' // WhatsApp Dark Mode sidebar color
        }}>
          {/* Top Panel: Active Instance Selection */}
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
            <label style={{ display: 'block', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>
              Instância WhatsApp Ativa
            </label>
            {loadingInstances ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0' }}>
                <Loader2 size={16} className="animate-spin" style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>Buscando conexões...</span>
              </div>
            ) : instances.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '0.8rem', padding: '0.5rem 0' }}>
                <AlertCircle size={16} />
                <span>Nenhum chip conectado.</span>
              </div>
            ) : (
              <select
                value={selectedInstance}
                onChange={(e) => setSelectedInstance(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.8rem',
                  background: '#202c33', // WhatsApp dark select
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {instances.map((inst) => (
                  <option key={inst.id} value={inst.name} style={{ background: '#111b21' }}>
                    🟢 {inst.name} {inst.profileName ? `(${inst.profileName})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Search bar inside contacts list */}
          <div style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
              background: '#202c33', padding: '0.4rem 0.8rem', borderRadius: '8px'
            }}>
              <Search size={16} color="rgba(255,255,255,0.3)" />
              <input
                type="text"
                placeholder="Pesquisar conversa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'none', border: 'none', color: 'white',
                  outline: 'none', fontSize: '0.82rem', width: '100%'
                }}
              />
            </div>
          </div>

          {/* Active Chats List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
            {loadingChats ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '4rem 0', color: 'rgba(255,255,255,0.3)' }}>
                <Loader2 className="animate-spin" size={24} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '0.8rem' }}>Carregando conversas...</span>
              </div>
            ) : filteredChats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filteredChats.map((chat) => {
                const isSelected = selectedChat?.id === chat.id;
                const isGroupChat = chat.id.endsWith('@g.us');
                return (
                  <div
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      background: isSelected ? '#2a3942' : 'transparent', // active chat hover
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#202c33';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* User/Group Avatar Icon */}
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isGroupChat ? (
                        <Users size={20} color={isSelected ? '#f59e0b' : 'rgba(255,255,255,0.5)'} />
                      ) : (
                        <User size={20} color={isSelected ? '#f59e0b' : 'rgba(255,255,255,0.5)'} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chat.name || chat.id.split('@')[0]}
                        </div>
                        {chat.conversationTimestamp && (
                          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                            {formatDate(chat.conversationTimestamp)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '6px' }}>
                          {chat.lastMessage || 'Mídia ou anexo'}
                        </div>
                        {chat.unreadCount !== undefined && chat.unreadCount > 0 && (
                          <span style={{
                            background: '#00a884', // WhatsApp unread green count
                            color: '#111b21',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '10px',
                            minWidth: 16,
                            textAlign: 'center',
                            flexShrink: 0
                          }}>
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

        {/* Right Side Chat window panel */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%', 
          background: '#0b141a', // chat background image or color
          position: 'relative'
        }}>
          {selectedChat ? (
            <>
              {/* Chat Header details */}
              <div style={{ 
                padding: '0.75rem 1.25rem', 
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                background: '#202c33' // header whatsapp web dark
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {isGroup ? <Users size={18} color="#94a3b8" /> : <User size={18} color="#94a3b8" />}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'white' }}>
                      {selectedChat.name || selectedChat.id.split('@')[0]}
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.35)' }}>
                      {isGroup ? 'Grupo do WhatsApp' : `Contato: ${selectedChat.id.split('@')[0]}`}
                    </span>
                  </div>
                </div>
                
                {/* Header Decoration Icons */}
                <div style={{ display: 'flex', gap: '1.25rem', color: 'rgba(255,255,255,0.6)' }}>
                  <VideoIcon size={20} style={{ cursor: 'pointer' }} />
                  <Phone size={18} style={{ cursor: 'pointer' }} />
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  <MoreVertical size={20} style={{ cursor: 'pointer' }} />
                </div>
              </div>

              {/* Chat History Bubbles Container */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '1.5rem', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.6rem',
                background: '#0b141a', // Solid chat body
              }}>
                {loadingMessages && messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: 'rgba(255,255,255,0.3)' }}>
                    <Loader2 className="animate-spin" size={32} style={{ color: '#f59e0b' }} />
                    <span style={{ fontSize: '0.85rem' }}>Carregando conversa...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.25)', gap: '8px' }}>
                    <MessageSquare size={36} />
                    <span style={{ fontSize: '0.85rem' }}>Sem histórico de mensagens.</span>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, index) => {
                      const fromMe = msg.key.fromMe;
                      return (
                        <div
                          key={msg.key.id || index}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: fromMe ? 'flex-end' : 'flex-start',
                            width: '100%'
                          }}
                        >
                          {/* Group participant sender name */}
                          {isGroup && !fromMe && msg.pushName && (
                            <span style={{ fontSize: '0.68rem', color: '#f59e0b', marginLeft: '6px', marginBottom: '2px', fontWeight: 600 }}>
                              {msg.pushName}
                            </span>
                          )}
                          
                          {/* Bubble Container */}
                          <div
                            style={{
                              maxWidth: '65%',
                              padding: '0.5rem 0.75rem',
                              borderRadius: fromMe ? '8px 0px 8px 8px' : '0px 8px 8px 8px', // clean whatsapp style corners
                              background: fromMe ? '#005c4b' : '#202c33', // WhatsApp official green & grey
                              color: 'white',
                              fontSize: '0.88rem',
                              lineHeight: 1.4,
                              position: 'relative',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                              border: '1px solid rgba(255,255,255,0.02)'
                            }}
                          >
                            {/* Render text or media element */}
                            <div style={{ marginBottom: '4px' }}>
                              {renderMessageContent(msg)}
                            </div>
                            
                            {/* Bottom clock & check icons */}
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '0.62rem',
                                color: fromMe ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)',
                                textAlign: 'right'
                              }}
                            >
                              <span>{formatTime(msg.messageTimestamp)}</span>
                              {fromMe && (
                                <CheckCheck size={12} color="#53bdeb" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Bottom Message Input bar */}
              <form 
                onSubmit={handleSendMessage}
                style={{ 
                  padding: '0.6rem 1.25rem', 
                  background: '#202c33', // Input area color WhatsApp
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.02)'
                }}
              >
                {/* Input decoration icons */}
                <div style={{ display: 'flex', gap: '1rem', color: 'rgba(255,255,255,0.6)' }}>
                  <Smile size={22} style={{ cursor: 'pointer' }} />
                  <Paperclip size={22} style={{ cursor: 'pointer' }} />
                </div>

                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Mensagem..."
                  disabled={sendingMessage}
                  style={{
                    flex: 1,
                    padding: '0.55rem 1rem',
                    background: '#2a3942', // Inner text input
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sendingMessage}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: newMessage.trim() && !sendingMessage ? 'pointer' : 'default',
                    opacity: newMessage.trim() && !sendingMessage ? 1 : 0.35,
                    color: 'rgba(255,255,255,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px'
                  }}
                >
                  {sendingMessage ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Send size={20} style={{ color: '#8696a0' }} />
                  )}
                </button>
              </form>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.25rem', padding: '2rem', background: '#222e35' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <MessageSquare size={36} style={{ color: '#00a884' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 600 }}>
                WaJato Multichat Atendimento
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 350, lineHeight: 1.5 }}>
                Escolha uma conversa ativa do painel lateral esquerdo para visualizar as mensagens e responder diretamente pelo WhatsApp.
              </p>
              <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.04)', margin: '1rem 0' }} />
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCheck size={14} color="#00a884" />
                Conectado com segurança às instâncias Baileys
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

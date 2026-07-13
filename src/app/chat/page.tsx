'use client';

import React, { useEffect, useState, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { 
  MessageSquare, 
  Send, 
  Smartphone, 
  User, 
  Users, 
  Clock,
  Loader2,
  AlertCircle
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
    };
  };
  text?: string;
  messageTimestamp?: number;
  pushName?: string;
}

export default function ChatPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  
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
          // Filtra apenas instâncias conectadas
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
    
    async function fetchChats() {
      try {
        setLoadingChats(true);
        const res = await fetch(`/api/chat/chats?instanceName=${selectedInstance}`);
        if (res.ok) {
          const data = await res.json();
          setChats(data);
        } else {
          console.error('Erro ao buscar conversas da instância');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingChats(false);
      }
    }

    fetchChats();

    // Poll chats every 15 seconds
    const interval = setInterval(fetchChats, 15000);
    return () => clearInterval(interval);
  }, [selectedInstance]);

  // Fetch messages when selected chat changes
  useEffect(() => {
    if (!selectedInstance || !selectedChat) return;

    const remoteJid = selectedChat.id;

    async function fetchMessages() {
      try {
        const res = await fetch(`/api/chat/messages?instanceName=${selectedInstance}&remoteJid=${remoteJid}`);
        if (res.ok) {
          const data = await res.json();
          // Organiza do mais antigo para o mais recente
          const sorted = Array.isArray(data) ? data.reverse() : [];
          setMessages(sorted);
        }
      } catch (err) {
        console.error(err);
      }
    }

    setLoadingMessages(true);
    fetchMessages().finally(() => setLoadingMessages(false));

    // Poll messages every 6 seconds to show replies in real-time
    const interval = setInterval(fetchMessages, 6000);
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

    // Otimistic rendering locally
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

  const getMessageContent = (msg: Message): string => {
    return msg.message?.conversation || 
           msg.message?.extendedTextMessage?.text || 
           msg.message?.imageMessage?.caption || 
           msg.text || 
           '[Mídia ou mensagem não suportada]';
  };

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

  return (
    <AppLayout title="Conversas Chat">
      <div 
        className="card" 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '320px 1fr', 
          height: 'calc(100vh - 200px)', 
          padding: 0, 
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {/* Left Side: Instance selection and active chats list */}
        <div style={{ borderRight: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Top Selection */}
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Instância WhatsApp Ativa
            </label>
            {loadingInstances ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0' }}>
                <Loader2 size={16} className="animate-spin" style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>Buscando chips...</span>
              </div>
            ) : instances.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '0.82rem', padding: '0.5rem 0' }}>
                <AlertCircle size={16} />
                <span>Nenhum chip conectado.</span>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedInstance}
                  onChange={(e) => setSelectedInstance(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.name} style={{ background: '#1e293b' }}>
                      🟢 {inst.name} {inst.profileName ? `(${inst.profileName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Active Chats List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
            <div style={{ padding: '0.4rem 1rem 0.8rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', fontWeight: 800, textTransform: 'uppercase' }}>
              Conversas Recentes
            </div>
            {loadingChats ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '3rem 0', color: 'rgba(255,255,255,0.4)' }}>
                <Loader2 className="animate-spin" size={24} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '0.8rem' }}>Carregando chats...</span>
              </div>
            ) : chats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem' }}>
                Nenhuma conversa ativa encontrada nesta instância.
              </div>
            ) : (
              chats.map((chat) => {
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
                      padding: '0.8rem 1rem',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #f59e0b' : '3px solid transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.2s',
                    }}
                  >
                    {/* User/Group Avatar Icon */}
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isGroupChat ? (
                        <Users size={18} color={isSelected ? '#f59e0b' : 'rgba(255,255,255,0.6)'} />
                      ) : (
                        <User size={18} color={isSelected ? '#f59e0b' : 'rgba(255,255,255,0.6)'} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: isSelected ? 'white' : 'rgba(255,255,255,0.95)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chat.name || chat.id.split('@')[0]}
                        </div>
                        {chat.conversationTimestamp && (
                          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                            {formatDate(chat.conversationTimestamp)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
                          {chat.lastMessage || 'Nenhuma mensagem'}
                        </div>
                        {chat.unreadCount !== undefined && chat.unreadCount > 0 && (
                          <span style={{
                            background: '#f59e0b',
                            color: '#0f172a',
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

        {/* Right Side: Message history container and input */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(10, 15, 30, 0.25)' }}>
          {selectedChat ? (
            <>
              {/* Top Chat Header */}
              <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(15, 23, 42, 0.2)' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {isGroup ? <Users size={16} color="#94a3b8" /> : <User size={16} color="#94a3b8" />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>
                    {selectedChat.name || selectedChat.id.split('@')[0]}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.35)' }}>
                    {isGroup ? 'Grupo do WhatsApp' : `Contato: ${selectedChat.id.split('@')[0]}`}
                  </span>
                </div>
              </div>

              {/* Chat Messages Bubbles area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {loadingMessages && messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: 'rgba(255,255,255,0.4)' }}>
                    <Loader2 className="animate-spin" size={32} style={{ color: '#f59e0b' }} />
                    <span style={{ fontSize: '0.88rem' }}>Carregando conversa...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', gap: '8px' }}>
                    <MessageSquare size={36} />
                    <span style={{ fontSize: '0.88rem' }}>Nenhuma mensagem encontrada nesta conversa.</span>
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
                          {/* Sender Name for group messages */}
                          {isGroup && !fromMe && msg.pushName && (
                            <span style={{ fontSize: '0.68rem', color: '#f59e0b', marginLeft: '8px', marginBottom: '2px', fontWeight: 600 }}>
                              {msg.pushName}
                            </span>
                          )}
                          
                          {/* Message Bubble */}
                          <div
                            style={{
                              maxWidth: '65%',
                              padding: '0.6rem 0.9rem',
                              borderRadius: fromMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                              background: fromMe ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.06)',
                              color: fromMe ? '#0f172a' : 'white',
                              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                              border: fromMe ? 'none' : '1px solid rgba(255,255,255,0.05)',
                              fontSize: '0.88rem',
                              lineHeight: 1.4,
                              wordBreak: 'break-word',
                              position: 'relative'
                            }}
                          >
                            <div>{getMessageContent(msg)}</div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: '4px',
                                fontSize: '0.6rem',
                                color: fromMe ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.35)',
                                marginTop: '4px',
                                textAlign: 'right'
                              }}
                            >
                              <Clock size={10} style={{ alignSelf: 'center' }} />
                              <span>{formatTime(msg.messageTimestamp)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Bottom Input Area */}
              <form 
                onSubmit={handleSendMessage}
                style={{ 
                  padding: '1rem 1.25rem', 
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  gap: '0.75rem',
                  background: 'rgba(15, 23, 42, 0.3)'
                }}
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escreva uma mensagem..."
                  disabled={sendingMessage}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '0.88rem',
                    outline: 'none',
                    transition: 'border 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(245,158,11,0.5)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sendingMessage}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    borderRadius: '10px',
                    width: 42,
                    height: 42,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: newMessage.trim() && !sendingMessage ? 'pointer' : 'default',
                    opacity: newMessage.trim() && !sendingMessage ? 1 : 0.4,
                    color: '#0f172a',
                    transition: 'transform 0.15s, opacity 0.2s',
                  }}
                  onMouseDown={(e) => {
                    if (newMessage.trim() && !sendingMessage) {
                      e.currentTarget.style.transform = 'scale(0.95)';
                    }
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {sendingMessage ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </form>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', padding: '2rem' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <MessageSquare size={32} style={{ color: '#f59e0b' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 700 }}>
                Nenhuma Conversa Selecionada
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 300 }}>
                Escolha uma conversa da lista lateral esquerda para carregar o histórico de mensagens e responder.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, RefreshCw, Pause, Play, Trash2 } from 'lucide-react';

interface Props {
  campaignId: string;
  onClose: () => void;
  onStatusChange?: () => void;
}

interface Log {
  id: string;
  fromInstance: string;
  toPhone: string;
  message: string;
  messageType: string;
  status: string;
  createdAt: string;
}

interface Campaign {
  id: string;
  name?: string;
  sourceInstance: string;
  targetPhone: string;
  status: string;
  currentDay: number;
  totalDays: number;
  msgsSentToday: number;
  targetMsgsToday: number;
  heatScore: number;
  lastMessageAt?: string;
}

const MESSAGE_TYPE_ICONS: Record<string, string> = {
  TEXT: '',
  EMOJI: '😊',
  REACTION: '👍',
  STICKER: '🎭',
  AUDIO: '🎤',
};

export default function WarmupChatViewer({ campaignId, onClose, onStatusChange }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [logsRes, campRes] = await Promise.all([
        fetch(`/api/warmup/${campaignId}/logs`),
        fetch(`/api/warmup`),
      ]);
      
      if (logsRes.ok) setLogs(await logsRes.json());
      if (campRes.ok) {
        const all = await campRes.json();
        const found = all.find((c: Campaign) => c.id === campaignId);
        if (found) setCampaign(found);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, [campaignId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleAction = async (action: 'pause' | 'resume' | 'stop') => {
    if (!confirm(`Confirmar: ${action === 'pause' ? 'pausar' : action === 'resume' ? 'retomar' : 'encerrar'} campanha?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/warmup/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchData();
        onStatusChange?.();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remover campanha permanentemente? Todos os logs serão apagados.')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/warmup/${campaignId}`, { method: 'DELETE' });
      if (res.ok) {
        onStatusChange?.();
        onClose();
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Determina quem é a instância "principal" (lado direito no chat)
  const mainInstance = logs[0]?.fromInstance || campaign?.sourceInstance || '';

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  // Agrupar mensagens por dia para separadores visuais
  const groupedLogs: { date: string; messages: Log[] }[] = [];
  for (const log of logs) {
    const date = new Date(log.createdAt).toLocaleDateString('pt-BR');
    const last = groupedLogs[groupedLogs.length - 1];
    if (!last || last.date !== date) {
      groupedLogs.push({ date, messages: [log] });
    } else {
      last.messages.push(log);
    }
  }

  const statusColor = campaign?.status === 'RUNNING'
    ? '#10b981' : campaign?.status === 'PAUSED'
    ? '#f59e0b' : campaign?.status === 'COMPLETED'
    ? '#3b82f6' : '#6b7280';

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{
        maxWidth: '600px',
        height: '88vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
      }}>
        {/* Header estilo WhatsApp */}
        <div style={{
          background: 'linear-gradient(135deg, #075e54, #128c7e)',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexShrink: 0,
        }}>
          {/* Avatar */}
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            flexShrink: 0,
          }}>
            📱
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {campaign?.name || campaign?.sourceInstance || 'Aquecimento'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 6, height: 6, background: statusColor, borderRadius: '50%', display: 'inline-block' }} />
              {campaign?.status === 'RUNNING' ? 'Ativo' : campaign?.status === 'PAUSED' ? 'Pausado' : campaign?.status}
              {campaign && ` • Dia ${campaign.currentDay}/${campaign.totalDays}`}
              {loading && <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />}
            </div>
          </div>

          {/* Controles */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {campaign?.status === 'RUNNING' && (
              <button
                onClick={() => handleAction('pause')}
                disabled={actionLoading}
                title="Pausar"
                style={{
                  padding: '0.35rem',
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'white',
                  display: 'flex',
                }}
              >
                <Pause size={16} />
              </button>
            )}
            {campaign?.status === 'PAUSED' && (
              <button
                onClick={() => handleAction('resume')}
                disabled={actionLoading}
                title="Retomar"
                style={{
                  padding: '0.35rem',
                  background: 'rgba(16,185,129,0.3)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'white',
                  display: 'flex',
                }}
              >
                <Play size={16} />
              </button>
            )}
            {(campaign?.status === 'RUNNING' || campaign?.status === 'PAUSED') && (
              <button
                onClick={() => handleAction('stop')}
                disabled={actionLoading}
                title="Encerrar"
                style={{
                  padding: '0.35rem',
                  background: 'rgba(239,68,68,0.3)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'white',
                  display: 'flex',
                }}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>✗</span>
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              title="Remover campanha"
              style={{
                padding: '0.35rem',
                background: 'rgba(239,68,68,0.2)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#fca5a5',
                display: 'flex',
              }}
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '0.35rem',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'white',
                display: 'flex',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {campaign && (
          <div style={{
            background: 'rgba(7,94,84,0.3)',
            padding: '0.5rem 1rem',
            display: 'flex',
            gap: '1.5rem',
            fontSize: '0.72rem',
            color: 'rgba(255,255,255,0.7)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}>
            <span>📊 Hoje: <strong style={{ color: 'white' }}>{campaign.msgsSentToday}/{campaign.targetMsgsToday}</strong></span>
            <span>🔥 Heat: <strong style={{ color: '#f59e0b' }}>{campaign.heatScore}/100</strong></span>
            <span>📅 Dia: <strong style={{ color: 'white' }}>{campaign.currentDay}/{campaign.totalDays}</strong></span>
            {/* Progress bar */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (campaign.msgsSentToday / Math.max(1, campaign.targetMsgsToday)) * 100)}%`,
                  background: 'linear-gradient(90deg, #10b981, #34d399)',
                  borderRadius: 2,
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>
          </div>
        )}

        {/* Chat area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'400\' height=\'400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'400\' height=\'400\' fill=\'%23e5ddd5\'/%3E%3C/svg%3E")',
          backgroundColor: '#e5ddd5',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}>
          {logs.length === 0 && !loading ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#667781',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}>
              <span style={{ fontSize: '2.5rem' }}>🔥</span>
              <strong>Aguardando primeiras mensagens</strong>
              <span style={{ fontSize: '0.85rem' }}>O Worker iniciará em breve. Aguarde...</span>
            </div>
          ) : (
            groupedLogs.map(group => (
              <React.Fragment key={group.date}>
                {/* Separador de data */}
                <div style={{ textAlign: 'center', margin: '0.5rem 0' }}>
                  <span style={{
                    background: 'rgba(11,20,26,0.3)',
                    color: 'white',
                    padding: '2px 10px',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                  }}>
                    {group.date}
                  </span>
                </div>

                {group.messages.map(log => {
                  const isRight = log.fromInstance === mainInstance;
                  const typeIcon = MESSAGE_TYPE_ICONS[log.messageType] || '';

                  return (
                    <div key={log.id} style={{
                      display: 'flex',
                      justifyContent: isRight ? 'flex-end' : 'flex-start',
                      marginBottom: '2px',
                    }}>
                      <div style={{
                        background: isRight ? '#dcf8c6' : '#ffffff',
                        padding: '6px 10px 4px',
                        borderRadius: isRight ? '8px 0 8px 8px' : '0 8px 8px 8px',
                        maxWidth: '78%',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                        position: 'relative',
                      }}>
                        {/* Nome da instância */}
                        <div style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: isRight ? '#075e54' : '#7c5b96',
                          marginBottom: '2px',
                        }}>
                          {typeIcon && <span style={{ marginRight: 4 }}>{typeIcon}</span>}
                          {log.fromInstance}
                        </div>

                        {/* Mensagem */}
                        <div style={{
                          fontSize: '0.9rem',
                          color: '#303030',
                          lineHeight: 1.4,
                          wordBreak: 'break-word',
                        }}>
                          {log.message}
                        </div>

                        {/* Footer: hora + status */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          gap: '3px',
                          marginTop: '2px',
                        }}>
                          <span style={{ fontSize: '0.62rem', color: '#667781' }}>
                            {formatTime(log.createdAt)}
                          </span>
                          {isRight && (
                            <span style={{
                              fontSize: '0.65rem',
                              color: log.status === 'SENT' ? '#667781' : log.status === 'FAILED' ? '#ef4444' : '#53bdeb',
                            }}>
                              {log.status === 'SENT' ? '✓✓' : log.status === 'FAILED' ? '✗' : '✓'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

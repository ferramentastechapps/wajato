'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, RefreshCw, Pause, Play, Trash2 } from 'lucide-react';

interface Props {
  poolId: string;
  onClose: () => void;
  onStatusChange?: () => void;
}

interface Log {
  id: string;
  fromInstance: string;
  toInstance: string;
  message: string;
  messageType: string;
  status: string;
  createdAt: string;
}

interface Pool {
  id: string;
  name: string;
  instanceNames: string[];
  status: string;
  currentDay: number;
  totalDays: number;
  msgsSentToday: number;
  targetMsgsToday: number;
  heatScore: number;
}

const MESSAGE_TYPE_ICONS: Record<string, string> = {
  TEXT: '',
  EMOJI: '😊',
  REACTION: '👍',
  STICKER: '🎭',
  AUDIO: '🎤',
};

export default function WarmupPoolChatViewer({ poolId, onClose, onStatusChange }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [logsRes, poolRes] = await Promise.all([
        // Rota de logs
        fetch(`/api/warmup/pools/${poolId}`),
        fetch(`/api/warmup/pools`),
      ]);

      if (logsRes.ok) {
        const poolDetail = await logsRes.json();
        setLogs(poolDetail.logs || []);
      }

      if (poolRes.ok) {
        const all = await poolRes.json();
        const found = all.find((p: Pool) => p.id === poolId);
        if (found) setPool(found);
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
  }, [poolId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleAction = async (action: 'pause' | 'resume' | 'stop') => {
    if (!confirm(`Confirmar: ${action === 'pause' ? 'pausar' : action === 'resume' ? 'retomar' : 'encerrar'} grupo?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/warmup/pools/${poolId}`, {
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
    if (!confirm('Remover grupo permanentemente? Todos os logs do pool serão apagados.')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/warmup/pools/${poolId}`, { method: 'DELETE' });
      if (res.ok) {
        onStatusChange?.();
        onClose();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Agrupar mensagens por dia
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

  const statusColor = pool?.status === 'RUNNING'
    ? '#10b981' : pool?.status === 'PAUSED'
    ? '#f59e0b' : pool?.status === 'COMPLETED'
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
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexShrink: 0,
        }}>
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
            👥
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pool?.name || 'Pool de Aquecimento'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 6, height: 6, background: statusColor, borderRadius: '50%', display: 'inline-block' }} />
              {pool?.status === 'RUNNING' ? 'Ativo' : pool?.status === 'PAUSED' ? 'Pausado' : pool?.status}
              {pool && ` • Dia ${pool.currentDay}/${pool.totalDays}`}
              {loading && <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {pool?.status === 'RUNNING' && (
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
            {pool?.status === 'PAUSED' && (
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
            {(pool?.status === 'RUNNING' || pool?.status === 'PAUSED') && (
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
              title="Remover Pool"
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
        {pool && (
          <div style={{
            background: 'rgba(30,58,138,0.3)',
            padding: '0.5rem 1rem',
            display: 'flex',
            gap: '1.5rem',
            fontSize: '0.72rem',
            color: 'rgba(255,255,255,0.7)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}>
            <span>📊 Hoje: <strong style={{ color: 'white' }}>{pool.msgsSentToday}/{pool.targetMsgsToday}</strong></span>
            <span>🔥 Heat: <strong style={{ color: '#f59e0b' }}>{pool.heatScore}/100</strong></span>
            <span>👥 Integrantes: <strong style={{ color: 'white' }}>{pool.instanceNames.length} chips</strong></span>
          </div>
        )}

        {/* Chat area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#f1f5f9',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}>
          {logs.length === 0 && !loading ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#475569',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}>
              <span style={{ fontSize: '2.5rem' }}>👥</span>
              <strong>Aguardando conversas no pool</strong>
              <span style={{ fontSize: '0.85rem' }}>Os chips participantes conversarão de forma cruzada em breve.</span>
            </div>
          ) : (
            groupedLogs.map(group => (
              <React.Fragment key={group.date}>
                {/* Separador de data */}
                <div style={{ textAlign: 'center', margin: '0.5rem 0' }}>
                  <span style={{
                    background: 'rgba(71,85,105,0.2)',
                    color: '#475569',
                    padding: '2px 10px',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                  }}>
                    {group.date}
                  </span>
                </div>

                {group.messages.map(log => {
                  const typeIcon = MESSAGE_TYPE_ICONS[log.messageType] || '';

                  return (
                    <div key={log.id} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      background: '#ffffff',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      borderLeft: '4px solid #3b82f6',
                      maxWidth: '90%',
                      alignSelf: 'flex-start',
                    }}>
                      {/* Remetente ➔ Destinatário */}
                      <div style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#1e3a8a',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        <span>{log.fromInstance}</span>
                        <span style={{ color: '#94a3b8' }}>➔</span>
                        <span style={{ color: '#0f766e' }}>{log.toInstance}</span>
                        {typeIcon && <span style={{ marginLeft: 4 }}>{typeIcon}</span>}
                      </div>

                      {/* Mensagem */}
                      <div style={{
                        fontSize: '0.88rem',
                        color: '#334155',
                        lineHeight: 1.4,
                      }}>
                        {log.message}
                      </div>

                      {/* Footer */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '4px',
                        fontSize: '0.62rem',
                        color: '#94a3b8',
                      }}>
                        <span>{formatTime(log.createdAt)}</span>
                        <span style={{ color: log.status === 'SENT' ? '#10b981' : '#ef4444' }}>
                          {log.status === 'SENT' ? '✓✓' : '✗'}
                        </span>
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

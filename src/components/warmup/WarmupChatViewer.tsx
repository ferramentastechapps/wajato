'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, RefreshCw, Pause, Play, Trash2, User } from 'lucide-react';

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
  messageId?: string | null;
  senderName?: string | null;
}

interface Campaign {
  id: string;
  name?: string;
  sourceInstance: string;
  targetPhone: string;
  targetPhones?: string;
  isGroup?: boolean;
  status: string;
  currentDay: number;
  totalDays: number;
  msgsSentToday: number;
  targetMsgsToday: number;
  heatScore: number;
  lastMessageAt?: string;
}

interface ContactInfo {
  name: string | null;
  pushName: string | null;
  profilePicUrl: string | null;
  isGroup: boolean;
  groupSubject: string | null;
}

const MESSAGE_TYPE_ICONS: Record<string, string> = {
  TEXT: '',
  EMOJI: '',
  REACTION: '👍',
  STICKER: '🎭',
  AUDIO: '🎤',
  IMAGE: '📷',
  LOCATION: '📍',
  STATUS: '📖',
};

function Avatar({ src, name, size = 40 }: { src?: string | null; name?: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initials = (name || '?').replace(/[^a-zA-Z\u00C0-\u024F\s]/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const colors = ['#075e54', '#128c7e', '#25d366', '#7c5b96', '#ef4444', '#3b82f6', '#f59e0b'];
  const colorIdx = (name || '?').charCodeAt(0) % colors.length;

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name || ''}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '2px solid rgba(255,255,255,0.15)',
        }}
      />
    );
  }

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: colors[colorIdx],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.35,
      fontWeight: 700,
      color: 'white',
      flexShrink: 0,
      border: '2px solid rgba(255,255,255,0.15)',
    }}>
      {initials}
    </div>
  );
}

export default function WarmupChatViewer({ campaignId, onClose, onStatusChange }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchContactInfo = useCallback(async (camp: Campaign) => {
    const phone = camp.targetPhone;
    if (!phone || phone === 'STATUS') return;
    try {
      const res = await fetch(`/api/warmup/${campaignId}/contact-info?phone=${encodeURIComponent(phone)}`);
      if (res.ok) {
        const info = await res.json();
        setContactInfo(info);
      }
    } catch {}
  }, [campaignId]);

  const fetchData = useCallback(async () => {
    try {
      const [logsRes, campRes] = await Promise.all([
        fetch(`/api/warmup/${campaignId}/logs`),
        fetch(`/api/warmup`),
      ]);

      if (logsRes.ok) setLogs(await logsRes.json());
      if (campRes.ok) {
        const all = await campRes.json();
        const found = all.find((c: Campaign) => c.id === campaignId);
        if (found) {
          setCampaign(found);
          // Busca info do contato na primeira carga
          if (!contactInfo) fetchContactInfo(found);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [campaignId, contactInfo, fetchContactInfo]);

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
      if (res.ok) { await fetchData(); onStatusChange?.(); }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remover campanha permanentemente? Todos os logs serão apagados.')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/warmup/${campaignId}`, { method: 'DELETE' });
      if (res.ok) { onStatusChange?.(); onClose(); }
    } finally {
      setActionLoading(false);
    }
  };

  // A instância de origem é quem enviou as primeiras mensagens (lado direito no chat)
  const sourceInstance = campaign?.sourceInstance || '';

  // Calcular "Disparos Sem Resposta":
  // São mensagens enviadas pelo chip (fromInstance = sourceInstance) consecutivamente
  // sem nenhuma resposta do destinatário entre elas
  const unrepliedCount = (() => {
    let count = 0;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].fromInstance !== sourceInstance) break; // parou ao ver uma resposta
      if (logs[i].status !== 'FAILED') count++;
    }
    return count;
  })();

  // Nome a exibir no header
  const displayName = contactInfo?.name || contactInfo?.groupSubject || campaign?.name || campaign?.targetPhone || 'Aquecimento';
  const subTitle = contactInfo?.groupSubject || campaign?.targetPhone || '';

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Agrupar mensagens por dia
  const groupedLogs: { date: string; messages: Log[] }[] = [];
  for (const log of logs) {
    const date = new Date(log.createdAt).toLocaleDateString('pt-BR');
    const last = groupedLogs[groupedLogs.length - 1];
    if (!last || last.date !== date) groupedLogs.push({ date, messages: [log] });
    else last.messages.push(log);
  }

  const statusColor = campaign?.status === 'RUNNING'
    ? '#10b981' : campaign?.status === 'PAUSED'
    ? '#f59e0b' : campaign?.status === 'COMPLETED'
    ? '#3b82f6' : '#6b7280';

  const iconBtn = (style: React.CSSProperties = {}) => ({
    padding: '0.35rem',
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  });

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
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexShrink: 0,
        }}>
          {/* Avatar com foto real */}
          <Avatar
            src={contactInfo?.profilePicUrl}
            name={displayName}
            size={42}
          />

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contactInfo?.isGroup ? '👥 ' : ''}{displayName}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 6, height: 6, background: statusColor, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
              {campaign?.status === 'RUNNING' ? 'Ativo' : campaign?.status === 'PAUSED' ? 'Pausado' : campaign?.status}
              {campaign && ` • Dia ${campaign.currentDay}/${campaign.totalDays}`}
              {subTitle && subTitle !== displayName && (
                <span style={{ color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  • {subTitle}
                </span>
              )}
              {loading && <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />}
            </div>
          </div>

          {/* Controles */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {campaign?.status === 'RUNNING' && (
              <button onClick={() => handleAction('pause')} disabled={actionLoading} title="Pausar" style={iconBtn()}>
                <Pause size={16} />
              </button>
            )}
            {campaign?.status === 'PAUSED' && (
              <button onClick={() => handleAction('resume')} disabled={actionLoading} title="Retomar" style={iconBtn({ background: 'rgba(16,185,129,0.3)' })}>
                <Play size={16} />
              </button>
            )}
            {(campaign?.status === 'RUNNING' || campaign?.status === 'PAUSED') && (
              <button onClick={() => handleAction('stop')} disabled={actionLoading} title="Encerrar" style={iconBtn({ background: 'rgba(239,68,68,0.3)' })}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>✗</span>
              </button>
            )}
            <button onClick={handleDelete} disabled={actionLoading} title="Remover campanha" style={iconBtn({ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' })}>
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} style={iconBtn()}>
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
            gap: '1.25rem',
            fontSize: '0.72rem',
            color: 'rgba(255,255,255,0.7)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}>
            <span>📊 Hoje: <strong style={{ color: 'white' }}>{campaign.msgsSentToday}/{campaign.targetMsgsToday}</strong></span>
            <span>🔥 Heat: <strong style={{ color: '#f59e0b' }}>{campaign.heatScore}/100</strong></span>
            <span>📅 Dia: <strong style={{ color: 'white' }}>{campaign.currentDay}/{campaign.totalDays}</strong></span>
            <span>
              ↩️ Sem resposta:{' '}
              <strong style={{ color: unrepliedCount > 0 ? '#f59e0b' : '#10b981' }}>
                {unrepliedCount}
              </strong>
            </span>
            <span>💬 Total: <strong style={{ color: 'white' }}>{logs.length}</strong></span>
            {/* Progress bar */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 80 }}>
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

        {/* Chat area com wallpaper WhatsApp */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#e5ddd5',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23e5ddd5'/%3E%3C/svg%3E")`,
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
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
                <div style={{ textAlign: 'center', margin: '0.75rem 0 0.25rem' }}>
                  <span style={{
                    background: 'rgba(11,20,26,0.3)',
                    color: 'white',
                    padding: '2px 12px',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                  }}>
                    {group.date}
                  </span>
                </div>

                {group.messages.map((log, idx) => {
                  const isSent = log.fromInstance === sourceInstance;
                  const typeIcon = MESSAGE_TYPE_ICONS[log.messageType] || '';
                  const prevLog = group.messages[idx - 1];
                  const showAvatar = !isSent && (!prevLog || prevLog.fromInstance === sourceInstance);

                  // Nome a exibir na bolha recebida
                  const senderName = isSent
                    ? (contactInfo?.name || sourceInstance)
                    : (log.senderName || contactInfo?.name || contactInfo?.pushName || log.fromInstance);

                  return (
                    <div key={log.id} style={{
                      display: 'flex',
                      justifyContent: isSent ? 'flex-end' : 'flex-start',
                      alignItems: 'flex-end',
                      gap: '6px',
                      marginBottom: '2px',
                    }}>
                      {/* Avatar do destinatário (lado esquerdo) */}
                      {!isSent && (
                        <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'flex-end' }}>
                          {showAvatar ? (
                            <Avatar src={contactInfo?.profilePicUrl} name={senderName} size={28} />
                          ) : (
                            <div style={{ width: 28 }} />
                          )}
                        </div>
                      )}

                      <div style={{
                        background: isSent ? '#dcf8c6' : '#ffffff',
                        padding: '6px 10px 4px',
                        borderRadius: isSent ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                        maxWidth: '75%',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                        position: 'relative',
                      }}>
                        {/* Nome do remetente */}
                        <div style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: isSent ? '#075e54' : '#7c5b96',
                          marginBottom: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          {typeIcon && <span>{typeIcon}</span>}
                          <span>{isSent ? (campaign?.name || sourceInstance) : senderName}</span>
                        </div>

                        {/* Mensagem */}
                        <div style={{
                          fontSize: '0.88rem',
                          color: '#303030',
                          lineHeight: 1.45,
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {log.message}
                        </div>

                        {/* Footer: hora + status ticks */}
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
                          {isSent && (
                            <span style={{
                              fontSize: '0.65rem',
                              color: log.status === 'SENT' ? '#667781' : log.status === 'FAILED' ? '#ef4444' : '#53bdeb',
                            }}>
                              {log.status === 'SENT' ? '✓✓' : log.status === 'FAILED' ? '✗' : '✓'}
                            </span>
                          )}
                          {!isSent && (
                            <span style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 700 }}>
                              ↩
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

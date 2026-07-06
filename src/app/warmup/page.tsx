'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Flame, Plus, MessageSquare, Pause, Play, TrendingUp, Clock, Activity } from 'lucide-react';
import CreateWarmupModal from '@/components/warmup/CreateWarmupModal';
import WarmupChatViewer from '@/components/warmup/WarmupChatViewer';
import WarmupHeatGauge from '@/components/warmup/WarmupHeatGauge';
import WarmupDayChart from '@/components/warmup/WarmupDayChart';

interface Campaign {
  id: string;
  name?: string;
  sourceInstance: string;
  targetInstance?: string;
  targetPhone: string;
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';
  currentDay: number;
  totalDays: number;
  msgsSentToday: number;
  targetMsgsToday: number;
  heatScore: number;
  startHour: number;
  endHour: number;
  lastMessageAt?: string;
  createdAt: string;
  stats?: {
    total: number;
    successful: number;
    successRate: number;
    msgsToday: number;
    lastMessage?: { text: string; at: string; type: string };
    messageTypeBreakdown: Record<string, number>;
  };
}

const STATUS_CONFIG = {
  RUNNING: { label: 'Ativo', color: '#10b981', bg: 'rgba(16,185,129,0.15)', dot: '#10b981' },
  PAUSED: { label: 'Pausado', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', dot: '#f59e0b' },
  STOPPED: { label: 'Encerrado', color: '#6b7280', bg: 'rgba(107,114,128,0.15)', dot: '#6b7280' },
  COMPLETED: { label: 'Concluído', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', dot: '#3b82f6' },
};

const TYPE_ICONS: Record<string, string> = {
  TEXT: '💬',
  EMOJI: '😊',
  REACTION: '👍',
  STICKER: '🎭',
  AUDIO: '🎤',
};

export default function WarmupPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/warmup');
      if (res.ok) setCampaigns(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickAction = async (id: string, action: 'pause' | 'resume' | 'stop') => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/warmup/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) await fetchCampaigns();
    } finally {
      setActionLoading(null);
    }
  };

  const totalRunning = campaigns.filter(c => c.status === 'RUNNING').length;
  const totalMsgsToday = campaigns.reduce((acc, c) => acc + (c.msgsSentToday || 0), 0);
  const avgHeat = campaigns.length > 0
    ? Math.round(campaigns.reduce((acc, c) => acc + c.heatScore, 0) / campaigns.length)
    : 0;

  return (
    <AppLayout title="Aquecimento IA">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Flame style={{ color: '#f59e0b' }} size={24} />
            Aquecimento de Números
          </h1>
          <p className="page-description">
            Sistema profissional de aquecimento com IA — simula conversas humanas reais com jitter gaussiano, mix de mídias e ramp-up progressivo.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          <span>Novo Aquecimento</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>{totalRunning}</div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>🟢 Campanhas Ativas</div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>{totalMsgsToday}</div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>📨 Mensagens Hoje</div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>{avgHeat}</div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>🔥 Heat Score Médio</div>
        </div>
      </div>

      {/* Campaigns Grid */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>Carregando campanhas...</div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔥</div>
          <h3 style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.8)' }}>Nenhum ciclo de aquecimento</h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
            Crie o primeiro ciclo para começar a aquecer seus números com IA
          </p>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            Iniciar Aquecimento
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {campaigns.map(camp => {
            const statusCfg = STATUS_CONFIG[camp.status] || STATUS_CONFIG.STOPPED;
            const progressPct = Math.min(100, (camp.msgsSentToday / Math.max(1, camp.targetMsgsToday)) * 100);
            const dayProgressPct = Math.min(100, (camp.currentDay / Math.max(1, camp.totalDays)) * 100);
            const typeBreakdown = camp.stats?.messageTypeBreakdown || {};
            const isLoading = actionLoading === camp.id;

            return (
              <div
                key={camp.id}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  border: camp.status === 'RUNNING' ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: 'default',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                }}
              >
                {/* Card Header */}
                <div style={{
                  padding: '1rem 1rem 0.75rem',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: statusCfg.dot,
                        boxShadow: camp.status === 'RUNNING' ? `0 0 6px ${statusCfg.dot}` : 'none',
                        flexShrink: 0,
                        animation: camp.status === 'RUNNING' ? 'pulse 2s infinite' : 'none',
                      }} />
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusCfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {camp.name || camp.sourceInstance}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                      📱 {camp.sourceInstance}
                      {camp.targetInstance && ` ⇄ ${camp.targetInstance}`}
                      {' → '}📞 {camp.targetPhone}
                    </div>
                  </div>

                  {/* Heat Gauge */}
                  <WarmupHeatGauge score={camp.heatScore} size={70} />
                </div>

                {/* Progress section */}
                <div style={{ padding: '0.75rem 1rem' }}>
                  {/* Dia */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>Progresso geral</span>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                      Dia {camp.currentDay} / {camp.totalDays}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: '0.75rem' }}>
                    <div style={{
                      height: '100%',
                      width: `${dayProgressPct}%`,
                      background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                      borderRadius: 3,
                      transition: 'width 0.5s',
                    }} />
                  </div>

                  {/* Msgs hoje */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>Mensagens hoje</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: camp.msgsSentToday >= camp.targetMsgsToday ? '#10b981' : 'white' }}>
                      {camp.msgsSentToday} / {camp.targetMsgsToday}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: '0.75rem' }}>
                    <div style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      background: progressPct >= 100 ? '#10b981' : 'linear-gradient(90deg, #10b981, #34d399)',
                      borderRadius: 3,
                      boxShadow: progressPct > 0 ? '0 0 6px rgba(16,185,129,0.4)' : 'none',
                      transition: 'width 0.5s',
                    }} />
                  </div>

                  {/* Horário + Mix de tipos */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                      <Clock size={12} />
                      <span>{camp.startHour}h – {camp.endHour}h</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', fontSize: '0.75rem' }}>
                      {Object.entries(typeBreakdown).map(([type, count]) => (
                        <span key={type} title={`${type}: ${count}`} style={{ cursor: 'default' }}>
                          {TYPE_ICONS[type] || '💬'}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Gráfico de barras */}
                  <WarmupDayChart campaignId={camp.id} />

                  {/* Última mensagem */}
                  {camp.stats?.lastMessage && (
                    <div style={{
                      marginTop: '0.6rem',
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '8px',
                      borderLeft: '3px solid rgba(16,185,129,0.4)',
                    }}>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>
                        Última mensagem • {new Date(camp.stats.lastMessage.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {TYPE_ICONS[camp.stats.lastMessage.type] || ''} {camp.stats.lastMessage.text}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions footer */}
                <div style={{
                  padding: '0.6rem 1rem',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  gap: '0.5rem',
                  background: 'rgba(0,0,0,0.15)',
                }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '0.4rem', fontSize: '0.78rem', justifyContent: 'center' }}
                    onClick={() => setSelectedCampaign(camp.id)}
                  >
                    <MessageSquare size={14} />
                    Ver Conversa
                  </button>

                  {camp.status === 'RUNNING' && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                      onClick={() => handleQuickAction(camp.id, 'pause')}
                      disabled={isLoading}
                      title="Pausar"
                    >
                      {isLoading ? '...' : <Pause size={14} />}
                    </button>
                  )}

                  {camp.status === 'PAUSED' && (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                      onClick={() => handleQuickAction(camp.id, 'resume')}
                      disabled={isLoading}
                      title="Retomar"
                    >
                      {isLoading ? '...' : <Play size={14} />}
                    </button>
                  )}

                  {(camp.status === 'RUNNING' || camp.status === 'PAUSED') && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', color: '#fca5a5' }}
                      onClick={() => { if (confirm('Encerrar campanha?')) handleQuickAction(camp.id, 'stop'); }}
                      disabled={isLoading}
                      title="Encerrar"
                    >
                      ✗
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {isModalOpen && (
        <CreateWarmupModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => { setIsModalOpen(false); fetchCampaigns(); }}
        />
      )}

      {selectedCampaign && (
        <WarmupChatViewer
          campaignId={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onStatusChange={fetchCampaigns}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </AppLayout>
  );
}

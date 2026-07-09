'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Flame, Plus, MessageSquare, Pause, Play, TrendingUp, Clock, Activity, Users, HeartPulse } from 'lucide-react';
import CreateWarmupModal from '@/components/warmup/CreateWarmupModal';
import CreateWarmupPoolModal from '@/components/warmup/CreateWarmupPoolModal';
import WarmupChatViewer from '@/components/warmup/WarmupChatViewer';
import WarmupPoolChatViewer from '@/components/warmup/WarmupPoolChatViewer';
import WarmupHeatGauge from '@/components/warmup/WarmupHeatGauge';
import WarmupDayChart from '@/components/warmup/WarmupDayChart';
import ChipHealthDashboard from '@/components/warmup/ChipHealthDashboard';

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

interface Pool {
  id: string;
  name: string;
  instanceNames: string[];
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
    lastMessage?: { text: string; from: string; to: string; at: string; type: string };
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
  const [activeTab, setActiveTab] = useState<'single' | 'pool' | 'chips'>('single');
  
  // Data lists
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal open states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);

  // Chat viewer states
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);

  // Loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // API Key Status state
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean>(true);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/warmup');
      if (res.ok) setCampaigns(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPools = async () => {
    try {
      const res = await fetch('/api/warmup/pools');
      if (res.ok) setPools(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const checkApiKeyStatus = async () => {
    try {
      const res = await fetch('/api/chatbot/config');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setApiKeyConfigured(!!data.config.geminiApiKey);
        }
      }
    } catch (err) {
      console.error('Erro ao verificar API Key:', err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchCampaigns(), fetchPools(), checkApiKeyStatus()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => {
      fetchCampaigns();
      fetchPools();
    }, 10000); // refresh 10s
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

  const handlePoolQuickAction = async (id: string, action: 'pause' | 'resume' | 'stop') => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/warmup/pools/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) await fetchPools();
    } finally {
      setActionLoading(null);
    }
  };

  // Stats
  const activeSingleCount = campaigns.filter(c => c.status === 'RUNNING').length;
  const activePoolCount = pools.filter(p => p.status === 'RUNNING').length;

  const msgsTodaySingle = campaigns.reduce((acc, c) => acc + (c.msgsSentToday || 0), 0);
  const msgsTodayPool = pools.reduce((acc, p) => acc + (p.msgsSentToday || 0), 0);

  const avgHeatSingle = campaigns.length > 0
    ? Math.round(campaigns.reduce((acc, c) => acc + c.heatScore, 0) / campaigns.length)
    : 0;

  const avgHeatPool = pools.length > 0
    ? Math.round(pools.reduce((acc, p) => acc + p.heatScore, 0) / pools.length)
    : 0;

  return (
    <AppLayout title="Aquecimento IA">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Flame style={{ color: '#f59e0b' }} size={24} />
            Aquecimento de Chips (WhatsApp)
          </h1>
          <p className="page-description">
            Evite banimentos simulando comportamento humano realista com atrasos gaussianos, rest periods e variação de conteúdo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {activeTab === 'single' ? (
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} />
              <span>Novo Ciclo Individual</span>
            </button>
          ) : (
            <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }} onClick={() => setIsPoolModalOpen(true)}>
              <Users size={18} style={{ marginRight: '0.4rem' }} />
              <span>Novo Grupo Mútuo (P2P)</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert banner if Gemini API Key is missing */}
      {!apiKeyConfigured && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: '0.88rem',
        }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <strong style={{ color: '#f59e0b', marginRight: '4px' }}>Chave da API do Google AI Studio Ausente:</strong>
            O sistema de aquecimento usará mensagens estáticas prontas (Spintax) até que você configure sua chave. 
            Você pode cadastrar sua chave em <a href="/chatbot" style={{ color: '#f59e0b', textDecoration: 'underline', fontWeight: 600 }}>Configurações do Chatbot</a>.
          </div>
        </div>
      )}

      {/* Tabs navigation */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: '0.5rem',
        marginBottom: '1.5rem',
      }}>
        <button
          onClick={() => setActiveTab('single')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'single' ? '2px solid #f59e0b' : 'none',
            color: activeTab === 'single' ? '#f59e0b' : 'rgba(255,255,255,0.5)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'color 0.2s',
          }}
        >
          <Flame size={16} />
          Chips Individuais ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('pool')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'pool' ? '2px solid #3b82f6' : 'none',
            color: activeTab === 'pool' ? '#3b82f6' : 'rgba(255,255,255,0.5)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'color 0.2s',
          }}
        >
          <Users size={16} />
          Grupos Mútuos / P2P ({pools.length})
        </button>
        <button
          onClick={() => setActiveTab('chips')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'chips' ? '2px solid #10b981' : 'none',
            color: activeTab === 'chips' ? '#10b981' : 'rgba(255,255,255,0.5)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'color 0.2s',
            marginLeft: 'auto',
          }}
        >
          <HeartPulse size={16} />
          Saúde dos Chips
        </button>
      </div>

      {/* Stats Overview */}
      {activeTab === 'single' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>{activeSingleCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>🟢 Ciclos Ativos</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>{msgsTodaySingle}</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>📨 Mensagens Hoje</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>{avgHeatSingle}</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>🔥 Heat Score Médio</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#3b82f6' }}>{activePoolCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>🟢 Grupos P2P Ativos</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#06b6d4' }}>{msgsTodayPool}</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>📨 Mensagens Trocadas</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>{avgHeatPool}</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>🔥 Heat Score Médio</div>
          </div>
        </div>
      )}

      {/* Main Grid Content */}
      {activeTab === 'chips' ? (
        /* --- SAÚDE DOS CHIPS --- */
        <ChipHealthDashboard />
      ) : loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>Carregando dados...</div>
        </div>
      ) : activeTab === 'single' ? (
        /* --- CHIPS INDIVIDUAIS --- */
        campaigns.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔥</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.8)' }}>Nenhum ciclo de aquecimento individual</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
              Crie o primeiro ciclo individual para começar.
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
                    transition: 'transform 0.2s',
                    cursor: 'default',
                  }}
                >
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
                          flexShrink: 0,
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

                    <WarmupHeatGauge score={camp.heatScore} size={70} />
                  </div>

                  <div style={{ padding: '0.75rem 1rem' }}>
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
                      }} />
                    </div>

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
                      }} />
                    </div>

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

                    <WarmupDayChart campaignId={camp.id} />

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
                      >
                        {isLoading ? '...' : <Play size={14} />}
                      </button>
                    )}

                    {(camp.status === 'RUNNING' || camp.status === 'PAUSED') && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', color: '#fca5a5' }}
                        onClick={() => { if (confirm('Encerrar aquecimento individual?')) handleQuickAction(camp.id, 'stop'); }}
                        disabled={isLoading}
                      >
                        ✗
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* --- GRUPOS MÚTUOS (P2P) --- */
        pools.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.8)' }}>Nenhum grupo de aquecimento mútuo (P2P)</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
              Selecione múltiplos chips conectados para que eles conversem entre si automaticamente.
            </p>
            <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }} onClick={() => setIsPoolModalOpen(true)}>
              <Plus size={16} />
              Criar Grupo de Aquecimento
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {pools.map(pool => {
              const statusCfg = STATUS_CONFIG[pool.status] || STATUS_CONFIG.STOPPED;
              const progressPct = Math.min(100, (pool.msgsSentToday / Math.max(1, pool.targetMsgsToday)) * 100);
              const dayProgressPct = Math.min(100, (pool.currentDay / Math.max(1, pool.totalDays)) * 100);
              const typeBreakdown = pool.stats?.messageTypeBreakdown || {};
              const isLoading = actionLoading === pool.id;

              return (
                <div
                  key={pool.id}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    border: pool.status === 'RUNNING' ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    transition: 'transform 0.2s',
                    cursor: 'default',
                  }}
                >
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
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusCfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pool.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                        👥 {pool.instanceNames.length} chips participando
                      </div>
                    </div>

                    <WarmupHeatGauge score={pool.heatScore} size={70} />
                  </div>

                  <div style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>Progresso do grupo</span>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                        Dia {pool.currentDay} / {pool.totalDays}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: '0.75rem' }}>
                      <div style={{
                        height: '100%',
                        width: `${dayProgressPct}%`,
                        background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                        borderRadius: 3,
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>Mensagens trocadas hoje</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pool.msgsSentToday >= pool.targetMsgsToday ? '#10b981' : 'white' }}>
                        {pool.msgsSentToday} / {pool.targetMsgsToday}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: '0.75rem' }}>
                      <div style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: progressPct >= 100 ? '#10b981' : 'linear-gradient(90deg, #10b981, #34d399)',
                        borderRadius: 3,
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                        <Clock size={12} />
                        <span>{pool.startHour}h – {pool.endHour}h</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', fontSize: '0.75rem' }}>
                        {Object.entries(typeBreakdown).map(([type, count]) => (
                          <span key={type} title={`${type}: ${count}`} style={{ cursor: 'default' }}>
                            {TYPE_ICONS[type] || '💬'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ padding: '0.2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      Integrantes: {pool.instanceNames.join(', ')}
                    </div>

                    {pool.stats?.lastMessage && (
                      <div style={{
                        marginTop: '0.6rem',
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '8px',
                        borderLeft: '3px solid #3b82f6',
                      }}>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginBottom: '2px' }}>
                          Conversa ativa • {pool.stats.lastMessage.from} ➔ {pool.stats.lastMessage.to}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {TYPE_ICONS[pool.stats.lastMessage.type] || ''} {pool.stats.lastMessage.text}
                        </div>
                      </div>
                    )}
                  </div>

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
                      onClick={() => setSelectedPool(pool.id)}
                    >
                      <MessageSquare size={14} />
                      Ver Conversas
                    </button>

                    {pool.status === 'RUNNING' && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => handlePoolQuickAction(pool.id, 'pause')}
                        disabled={isLoading}
                      >
                        {isLoading ? '...' : <Pause size={14} />}
                      </button>
                    )}

                    {pool.status === 'PAUSED' && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                        onClick={() => handlePoolQuickAction(pool.id, 'resume')}
                        disabled={isLoading}
                      >
                        {isLoading ? '...' : <Play size={14} />}
                      </button>
                    )}

                    {(pool.status === 'RUNNING' || pool.status === 'PAUSED') && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', color: '#fca5a5' }}
                        onClick={() => { if (confirm('Encerrar aquecimento deste grupo?')) handlePoolQuickAction(pool.id, 'stop'); }}
                        disabled={isLoading}
                      >
                        ✗
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Modals */}
      {isModalOpen && (
        <CreateWarmupModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => { setIsModalOpen(false); fetchCampaigns(); }}
        />
      )}

      {isPoolModalOpen && (
        <CreateWarmupPoolModal
          onClose={() => setIsPoolModalOpen(false)}
          onCreated={() => { setIsPoolModalOpen(false); fetchPools(); }}
        />
      )}

      {selectedCampaign && (
        <WarmupChatViewer
          campaignId={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onStatusChange={fetchCampaigns}
        />
      )}

      {selectedPool && (
        <WarmupPoolChatViewer
          poolId={selectedPool}
          onClose={() => setSelectedPool(null)}
          onStatusChange={fetchPools}
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

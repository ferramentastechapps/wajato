'use client';

import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Flame, Plus, MessageSquare, Pause, Play, TrendingUp, Clock, Activity, Users, HeartPulse, ChevronDown, ChevronRight, Smartphone, Edit, AlertTriangle, RotateCw, Sliders, Check, X } from 'lucide-react';
import CreateWarmupModal from '@/components/warmup/CreateWarmupModal';
import CreateWarmupPoolModal from '@/components/warmup/CreateWarmupPoolModal';
import EditWarmupModal from '@/components/warmup/EditWarmupModal';
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
  continuousMode?: boolean;
  isPrimaryContact?: boolean;
  stage?: string;
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
    consecutiveFailures?: number;
    lastMessage?: { text: string; at: string; type: string };
    messageTypeBreakdown: Record<string, number>;
  };
}

interface Pool {
  id: string;
  name: string;
  instanceNames: string[];
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';
  continuousMode?: boolean;
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

  interface WhatsAppInst {
    name: string;
    status: string;
    phone: string | null;
    dailyMsgCount?: number;
    maxDailyLimit?: number;
    dailyLimitToday?: number;
    warmupStage?: string;
  }
  const [instances, setInstances] = useState<WhatsAppInst[]>([]);
  const [selectedInstanceForNewCampaign, setSelectedInstanceForNewCampaign] = useState<string | null>(null);

  // Chip capacity editing modal
  const [editingCapacityInst, setEditingCapacityInst] = useState<{
    name: string;
    currentBase: number;
    currentToday: number;
  } | null>(null);
  const [capacityInput, setCapacityInput] = useState<number>(200);
  const [savingCapacity, setSavingCapacity] = useState<boolean>(false);

  const handleSaveCapacity = async () => {
    if (!editingCapacityInst) return;
    setSavingCapacity(true);
    try {
      const res = await fetch(`/api/whatsapp/instances/${editingCapacityInst.name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxDailyLimit: capacityInput }),
      });
      if (res.ok) {
        setEditingCapacityInst(null);
        await fetchInstancesList();
      }
    } catch (e) {
      console.error('Erro ao salvar capacidade:', e);
    } finally {
      setSavingCapacity(false);
    }
  };

  // Modal open states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  // Chat viewer states
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);

  // Loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Collapsed chips state (set of instance names that are collapsed)
  const [collapsedChips, setCollapsedChips] = useState<Set<string>>(new Set());

  const toggleChip = (instanceName: string) => {
    setCollapsedChips(prev => {
      const next = new Set(prev);
      if (next.has(instanceName)) next.delete(instanceName);
      else next.add(instanceName);
      return next;
    });
  };

  // Group campaigns by sourceInstance (using all known instances as starting point)
  const campaignsByChip = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    
    // Inicializa cada instância conhecida no mapa
    instances.forEach(inst => {
      map.set(inst.name, []);
    });

    campaigns.forEach(c => {
      const key = c.sourceInstance;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });

    // Ordena chips: chips com campanhas ATIVAS (RUNNING) primeiro, depois outros conectados, depois o resto
    return Array.from(map.entries()).sort(([nameA, campaignsA], [nameB, campaignsB]) => {
      const instA = instances.find(i => i.name === nameA);
      const instB = instances.find(i => i.name === nameB);

      const aRunning = campaignsA.some(c => c.status === 'RUNNING') ? 0 : 1;
      const bRunning = campaignsB.some(c => c.status === 'RUNNING') ? 0 : 1;
      if (aRunning !== bRunning) return aRunning - bRunning;

      const aConnected = instA?.status === 'CONNECTED' ? 0 : 1;
      const bConnected = instB?.status === 'CONNECTED' ? 0 : 1;
      return aConnected - bConnected;
    });
  }, [campaigns, instances]);

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

  const fetchInstancesList = async () => {
    try {
      const res = await fetch('/api/whatsapp/connect');
      if (res.ok) setInstances(await res.json());
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
    await Promise.all([fetchCampaigns(), fetchPools(), fetchInstancesList(), checkApiKeyStatus()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => {
      fetchCampaigns();
      fetchPools();
      fetchInstancesList();
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
        instances.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.8)' }}>Nenhuma instância conectada</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
              Conecte uma instância de WhatsApp primeiro na aba Conexões para começar.
            </p>
            <a href="/connections" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Ir para Conexões
            </a>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔥</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.8)' }}>Nenhum ciclo de aquecimento individual</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
              Crie o primeiro ciclo individual para começar.
            </p>
            <button
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '0.75rem 1.5rem', fontWeight: 700, margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              onClick={() => {
                setSelectedInstanceForNewCampaign(null);
                setIsModalOpen(true);
              }}
            >
              <Plus size={18} />
              <span>Iniciar Aquecimento</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {campaignsByChip.map(([instanceName, chipCampaigns]) => {
              const isCollapsed = collapsedChips.has(instanceName);
              const runningCount = chipCampaigns.filter(c => c.status === 'RUNNING').length;
              const pausedCount = chipCampaigns.filter(c => c.status === 'PAUSED').length;
              const chipCampaignsSentToday = chipCampaigns.reduce((acc, c) => acc + (c.msgsSentToday || 0), 0);
              const chipAvgHeat = chipCampaigns.length > 0
                ? Math.round(chipCampaigns.reduce((acc, c) => acc + c.heatScore, 0) / chipCampaigns.length)
                : 0;
              const chipHasActive = runningCount > 0;
              const inst = instances.find(i => i.name === instanceName);

              // Capacidade diária real do chip com jitter
              const baseLimit = inst?.maxDailyLimit || 200;
              const dailyLimitToday = inst?.dailyLimitToday || baseLimit;
              const chipTotalMsgsToday = Math.max(inst?.dailyMsgCount || 0, chipCampaignsSentToday);
              const coldRemaining = Math.max(0, dailyLimitToday - chipTotalMsgsToday);

              // Estágio de Maturação do Chip
              const hasCompletedFoundation = chipCampaigns.some(c => c.currentDay >= c.totalDays);
              const distinctContacts = new Set(chipCampaigns.map(c => c.targetPhone)).size;

              let currentStage: 'FOUNDATION' | 'EXPANSION' | 'MATURED' = 'FOUNDATION';
              if (inst?.warmupStage === 'MATURED' || (hasCompletedFoundation && distinctContacts >= 2)) {
                currentStage = 'MATURED';
              } else if (inst?.warmupStage === 'EXPANSION' || hasCompletedFoundation) {
                currentStage = 'EXPANSION';
              } else {
                currentStage = 'FOUNDATION';
              }

              // Heat Score ponderado do Chip
              let realChipHeat = chipAvgHeat;
              if (currentStage === 'FOUNDATION') {
                realChipHeat = Math.min(75, chipAvgHeat);
              } else if (currentStage === 'EXPANSION') {
                realChipHeat = Math.min(95, Math.max(75, 75 + (distinctContacts - 1) * 8));
              } else {
                realChipHeat = 100;
              }

              return (
                <div
                  key={instanceName}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    border: chipHasActive ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  {/* ── Chip Header ── */}
                  <div
                    onClick={() => toggleChip(instanceName)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.9rem 1.1rem',
                      cursor: 'pointer',
                      background: chipHasActive ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.02)',
                      borderBottom: isCollapsed ? 'none' : '1px solid rgba(255,255,255,0.07)',
                      transition: 'background 0.2s',
                    }}
                  >
                    {/* Collapse arrow */}
                    <div style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </div>

                    {/* Chip icon + name */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: chipHasActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Smartphone size={16} color={chipHasActive ? '#10b981' : '#6b7280'} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.97rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {instanceName}
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: inst?.status === 'CONNECTED' ? '#10b981' : (inst?.status === 'INITIALIZING' ? '#f59e0b' : '#ef4444'),
                          display: 'inline-block'
                        }} title={inst?.status || 'OFFLINE'} />

                        {/* Badge de Estágio de Maturação */}
                        {currentStage === 'FOUNDATION' && (
                          <span style={{
                            fontSize: '0.68rem',
                            background: 'rgba(245, 158, 11, 0.12)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            borderRadius: '5px',
                            padding: '1px 7px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }} title="Fase 1: Aquecendo primeiro contato base para criar histórico e confiança.">
                            🌱 Fase 1: Fundação
                          </span>
                        )}

                        {currentStage === 'EXPANSION' && (
                          <span style={{
                            fontSize: '0.68rem',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '5px',
                            padding: '1px 7px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }} title="Fase 2: Contato base concluído! Adicionando novas conversas para acostumar a Meta com novos contatos antes de disparos frios.">
                            🚀 Fase 2: Expansão ({distinctContacts} contatos)
                          </span>
                        )}

                        {currentStage === 'MATURED' && (
                          <span style={{
                            fontSize: '0.68rem',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '5px',
                            padding: '1px 7px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }} title="Fase 3: Chip maturado e rede expandida com sucesso! Liberado para disparos frios em massa.">
                            🛡️ 100% Maturado (Pronto)
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                        {chipCampaigns.length} conversa{chipCampaigns.length !== 1 ? 's' : ''}
                        {runningCount > 0 && <span style={{ color: '#10b981', marginLeft: 6 }}>● {runningCount} ativa{runningCount !== 1 ? 's' : ''}</span>}
                        {pausedCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 6 }}>⏸ {pausedCount} pausada{pausedCount !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>

                    {/* Chip aggregate stats & actions */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      {/* Heat */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: realChipHeat >= 80 ? '#10b981' : realChipHeat >= 50 ? '#f59e0b' : '#6b7280' }}>
                          {realChipHeat}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>🔥 Heat</div>
                      </div>

                      {/* Hoje com jitter */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: chipTotalMsgsToday >= dailyLimitToday ? '#ef4444' : 'white' }}>
                          {chipTotalMsgsToday}<span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}>/{dailyLimitToday}</span>
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#38bdf8', whiteSpace: 'nowrap' }} title={`Cota de hoje com variação anti-robô (base ${baseLimit}): ${dailyLimitToday} msgs`}>
                          🎲 Hoje (±10)
                        </div>
                      </div>

                      {/* Frias disponíveis */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: coldRemaining > 0 ? '#38bdf8' : '#6b7280' }}>
                          +{coldRemaining}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }} title={`Capacidade segura livre hoje para disparos frios em campanhas.`}>
                          ❄️ Frias Livres
                        </div>
                      </div>

                      {/* Botão de Ajustar Limite */}
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.65rem', fontSize: '0.76rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => {
                          setEditingCapacityInst({
                            name: instanceName,
                            currentBase: baseLimit,
                            currentToday: dailyLimitToday,
                          });
                          setCapacityInput(baseLimit);
                        }}
                        title="Ajustar capacidade base diária (ex: 200, 250, 300...) e ver jitter diário"
                      >
                        <Sliders size={13} />
                        <span>Limites</span>
                      </button>

                      {/* Botão Nova Conversa */}
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedInstanceForNewCampaign(instanceName);
                          setIsModalOpen(true);
                        }}
                        title="Adicionar nova conversa de aquecimento para este chip"
                      >
                        <Plus size={13} />
                        <span>+ Conversa</span>
                      </button>
                    </div>
                  </div>

                  {/* ── Conversation Rows ── */}
                  {!isCollapsed && (
                    <div>
                      {chipCampaigns.length === 0 && (
                        <div style={{ padding: '2rem 1.5rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                          Nenhum aquecimento configurado para este chip. Clique em "+ Conversa" para iniciar a Fundação.
                        </div>
                      )}
                      {chipCampaigns.map((camp, idx) => {
                        const statusCfg = STATUS_CONFIG[camp.status] || STATUS_CONFIG.STOPPED;
                        const progressPct = Math.min(100, (camp.msgsSentToday / Math.max(1, camp.targetMsgsToday)) * 100);
                        const dayPct = Math.min(100, (camp.currentDay / Math.max(1, camp.totalDays)) * 100);
                        const isLoading = actionLoading === camp.id;
                        const isMatured = camp.currentDay >= camp.totalDays;
                        const isBaseContact = idx === 0;

                        return (
                          <div
                            key={camp.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.7rem 1.1rem',
                              borderBottom: idx < chipCampaigns.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                              background: camp.status === 'RUNNING' ? 'rgba(16,185,129,0.02)' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                          >
                            {/* Status dot */}
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: statusCfg.dot, flexShrink: 0,
                            }} />

                            {/* Name + target */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {camp.name || camp.targetPhone}
                                </span>

                                {/* Papel no Aquecimento: Base vs Expansão */}
                                {isBaseContact ? (
                                  <span style={{
                                    fontSize: '0.62rem',
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: '#fbbf24',
                                    border: '1px solid rgba(245, 158, 11, 0.25)',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    flexShrink: 0,
                                  }} title="Primeiro contato do chip (Fundação). Cria o histórico e a confiança inicial.">
                                    ⭐ Contato Base
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '0.62rem',
                                    background: 'rgba(59, 130, 246, 0.15)',
                                    color: '#60a5fa',
                                    border: '1px solid rgba(59, 130, 246, 0.25)',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    flexShrink: 0,
                                  }} title="Contato de Expansão de Rede. Prepara o chip para falar com pessoas novas.">
                                    🔄 Expansão
                                  </span>
                                )}

                                {isMatured ? (
                                  <span
                                    style={{
                                      fontSize: '0.62rem',
                                      background: 'rgba(16, 185, 129, 0.12)',
                                      color: '#34d399',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid rgba(16, 185, 129, 0.25)',
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      flexShrink: 0,
                                    }}
                                    title="Ciclo concluído. Mantendo atividade contínua de segurança."
                                  >
                                    <RotateCw size={9} /> Maturado
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '0.62rem',
                                      background: 'rgba(255, 255, 255, 0.06)',
                                      color: 'rgba(255, 255, 255, 0.65)',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid rgba(255, 255, 255, 0.12)',
                                      fontWeight: 600,
                                      flexShrink: 0,
                                    }}
                                  >
                                    Dia {Math.min(camp.currentDay, camp.totalDays)}/{camp.totalDays}
                                  </span>
                                )}

                                {camp.stats?.consecutiveFailures !== undefined && camp.stats.consecutiveFailures >= 3 && (
                                  <span 
                                    style={{
                                      fontSize: '0.62rem',
                                      background: 'rgba(239, 68, 68, 0.15)',
                                      color: '#f87171',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      fontWeight: 600,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      flexShrink: 0
                                    }}
                                    title="O aquecimento foi pausado automaticamente após 3 falhas consecutivas de envio."
                                  >
                                    <AlertTriangle size={10} />
                                    Falha
                                  </span>
                                )}
                              </div>
                              {camp.stats?.lastMessage && (
                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                                  {TYPE_ICONS[camp.stats.lastMessage.type] || ''} {camp.stats.lastMessage.text}
                                </div>
                              )}
                            </div>

                            {/* Progress & msgs column */}
                            <div style={{ width: 140, flexShrink: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                <span style={{ fontSize: '0.72rem', color: camp.msgsSentToday >= camp.targetMsgsToday ? '#10b981' : 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
                                  {camp.msgsSentToday}/{camp.targetMsgsToday} msgs
                                </span>
                                <span style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.4)' }}>
                                  {Math.round(progressPct)}%
                                </span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${progressPct}%`,
                                    background: progressPct >= 100 ? '#10b981' : 'linear-gradient(90deg, #10b981, #34d399)',
                                    borderRadius: 2,
                                    transition: 'width 0.3s',
                                  }}
                                />
                              </div>
                            </div>

                            {/* Hour range */}
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', flexShrink: 0, minWidth: 52, textAlign: 'center' }}>
                              <Clock size={10} style={{ marginBottom: 1 }} /><br/>
                              {camp.startHour}h–{camp.endHour}h
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                                onClick={() => setSelectedCampaign(camp.id)}
                                title="Ver conversa"
                              >
                                <MessageSquare size={13} />
                              </button>

                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                                onClick={() => setEditingCampaignId(camp.id)}
                                title="Editar ciclo"
                              >
                                <Edit size={13} />
                              </button>

                              {camp.status === 'RUNNING' && (
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                                  onClick={() => handleQuickAction(camp.id, 'pause')}
                                  disabled={isLoading}
                                  title="Pausar"
                                >
                                  {isLoading ? '…' : <Pause size={13} />}
                                </button>
                              )}

                              {camp.status === 'PAUSED' && (
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                                  onClick={() => handleQuickAction(camp.id, 'resume')}
                                  disabled={isLoading}
                                  title="Retomar"
                                >
                                  {isLoading ? '…' : <Play size={13} />}
                                </button>
                              )}

                              {camp.status === 'COMPLETED' && (
                                <button
                                  className="btn btn-primary"
                                  style={{
                                    padding: '0.3rem 0.6rem',
                                    fontSize: '0.72rem',
                                    background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: 'none',
                                  }}
                                  onClick={() => handleQuickAction(camp.id, 'resume')}
                                  disabled={isLoading}
                                  title="Continuar Aquecendo em Modo Manutenção Perpétua"
                                >
                                  {isLoading ? '…' : <RotateCw size={11} />}
                                  <span>Continuar</span>
                                </button>
                              )}

                              {(camp.status === 'RUNNING' || camp.status === 'PAUSED') && (
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem', color: '#fca5a5' }}
                                  onClick={() => { if (confirm('Encerrar este aquecimento?')) handleQuickAction(camp.id, 'stop'); }}
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
                        {pool.continuousMode && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              background: 'rgba(59, 130, 246, 0.12)',
                              color: '#60a5fa',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              border: '1px solid rgba(59, 130, 246, 0.25)',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                            title="Modo Contínuo Ativo"
                          >
                            <RotateCw size={9} /> Contínuo
                          </span>
                        )}
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
                        Dia {Math.min(pool.currentDay, pool.totalDays)} / {pool.totalDays}
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

                    {pool.status === 'COMPLETED' && (
                      <button
                        className="btn btn-primary"
                        style={{
                          padding: '0.4rem 0.75rem',
                          fontSize: '0.78rem',
                          background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: 'none',
                        }}
                        onClick={() => handlePoolQuickAction(pool.id, 'resume')}
                        disabled={isLoading}
                        title="Continuar Aquecendo Grupo em Modo Contínuo"
                      >
                        {isLoading ? '...' : <RotateCw size={12} />}
                        <span>Continuar</span>
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
          initialSourceInstance={selectedInstanceForNewCampaign || undefined}
          onClose={() => { setIsModalOpen(false); setSelectedInstanceForNewCampaign(null); }}
          onCreated={() => { setIsModalOpen(false); setSelectedInstanceForNewCampaign(null); fetchCampaigns(); }}
        />
      )}

      {isPoolModalOpen && (
        <CreateWarmupPoolModal
          onClose={() => setIsPoolModalOpen(false)}
          onCreated={() => { setIsPoolModalOpen(false); fetchPools(); }}
        />
      )}

      {editingCampaignId && (
        <EditWarmupModal
          campaignId={editingCampaignId}
          onClose={() => setEditingCampaignId(null)}
          onUpdated={() => {
            setEditingCampaignId(null);
            fetchCampaigns();
          }}
        />
      )}

      {selectedCampaign && (
        <WarmupChatViewer
          campaignId={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onStatusChange={fetchCampaigns}
        />
      )}

      {/* Modal de Ajuste de Capacidade e Jitter Anti-Robô */}
      {editingCapacityInst && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div className="card" style={{
            maxWidth: 480,
            width: '100%',
            padding: '1.5rem',
            background: '#131b26',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '8px',
                  background: 'rgba(59,130,246,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#60a5fa',
                }}>
                  <Sliders size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'white' }}>
                  Capacidade do Chip: {editingCapacityInst.name}
                </h3>
              </div>
              <button
                onClick={() => setEditingCapacityInst(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              Defina a capacidade máxima diária do chip. Para simular comportamento humano autêntico e evitar detecção pela Meta, o sistema aplica automaticamente uma <strong>variação aleatória diária de ±10 mensagens</strong> sobre a base configurada.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>
                Capacidade Base Diária (mensagens/dia):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="number"
                  min="20"
                  max="1000"
                  step="10"
                  value={capacityInput}
                  onChange={(e) => setCapacityInput(Number(e.target.value))}
                  style={{
                    flex: 1,
                    padding: '0.65rem 0.9rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: 700,
                  }}
                />
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>msgs/dia</span>
              </div>
            </div>

            {/* Quick buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[150, 200, 250, 300, 400].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCapacityInput(val)}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0.2rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: capacityInput === val ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                    background: capacityInput === val ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                    color: capacityInput === val ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                  }}
                >
                  {val}
                </button>
              ))}
            </div>

            {/* Jitter preview box */}
            <div style={{
              padding: '0.85rem 1rem',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: '10px',
              marginBottom: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>Faixa Diária Anti-Robô (Jitter ±10):</span>
                <strong style={{ fontSize: '0.9rem', color: '#34d399' }}>
                  {Math.max(10, capacityInput - 10)} a {capacityInput + 10} msgs
                </strong>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                Todo dia à meia-noite, um teto único dentro dessa faixa é sorteado para este chip.
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setEditingCapacityInst(null)}
                style={{ padding: '0.55rem 1.1rem' }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveCapacity}
                disabled={savingCapacity}
                style={{ padding: '0.55rem 1.25rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {savingCapacity ? 'Salvando...' : (
                  <>
                    <Check size={16} />
                    <span>Salvar Capacidade</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
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

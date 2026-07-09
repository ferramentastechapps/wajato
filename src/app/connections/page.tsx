'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { 
  Smartphone, 
  Plus, 
  Wifi, 
  WifiOff, 
  Trash2, 
  RefreshCw, 
  Flame, 
  Activity, 
  Layers,
  LogOut,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Key,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Clock,
  Globe,
  Snowflake,
  BookOpen,
  Info
} from 'lucide-react';
import Link from 'next/link';

interface Alert {
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface Instance {
  id: string;
  name: string;
  status: 'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED';
  phone: string | null;
  qrCode: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  warmupProgress: number;
  heatScore: number;
  activeWarmupType: 'SINGLE' | 'POOL' | 'NONE';
  warmupCampaignId: string | null;
  warmupPoolId: string | null;
  proxy: string | null;
  // Novos campos de proteção
  dailyMsgCount: number;
  hourlyMsgCount: number;
  healthScore: number;
  lastMessageAt: string | null;
  isInCooldown: boolean;
  protectionScore: number;
  alerts: Alert[];
}

const MAX_DAILY = 200;
const MAX_HOURLY = 60;

function LimitBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const isDanger = pct >= 90;
  const isWarning = pct > 75;
  const barColor = isDanger ? '#ef4444' : isWarning ? '#f59e0b' : color;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>{label}</span>
        <span style={{ 
          fontSize: '0.7rem', fontWeight: 700, 
          color: isDanger ? '#ef4444' : isWarning ? '#f59e0b' : 'rgba(255,255,255,0.6)' 
        }}>
          {value}/{max}
        </span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

function ProtectionBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Protegido' : score >= 50 ? 'Parcial' : 'Em Risco';
  const Icon = score >= 80 ? ShieldCheck : score >= 50 ? Shield : ShieldAlert;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      padding: '2px 8px', borderRadius: 999,
      background: `${color}18`,
      border: `1px solid ${color}30`,
      fontSize: '0.65rem', fontWeight: 700, color,
    }}>
      <Icon size={11} />
      {label} ({score}%)
    </div>
  );
}

const PROTECTION_GUIDE = [
  { icon: '🌐', title: 'Configure um Proxy para cada chip', desc: 'Cada número precisa de um IP dedicado. Sem proxy, todos os chips compartilham o mesmo IP do servidor, facilitando o ban em cascata pela Meta.' },
  { icon: '🔥', title: 'Aqueça antes de disparar', desc: 'Nunca use um chip novo/frio para campanhas. Inicie um ciclo de aquecimento de 7-30 dias com conversas naturais antes de fazer envios em massa.' },
  { icon: '📊', title: 'Respeite os limites', desc: 'Máximo 200 mensagens/dia e 60 mensagens/hora por chip. O sistema bloqueia automaticamente ao atingir esses limites.' },
  { icon: '⏸️', title: 'Não force chips com saúde baixa', desc: 'Se a saúde cair abaixo de 40%, pause todos os envios por 24h. O chip precisa de descanso para recuperar.' },
  { icon: '💬', title: 'Interaja naturalmente', desc: 'Responda mensagens recebidas, não só envie. O WhatsApp penaliza contas que só disparam sem receber respostas.' },
  { icon: '🔄', title: 'Use múltiplos chips em rodízio', desc: 'O Chip Router distribui envios automaticamente entre chips saudáveis. Quanto mais chips, menor a carga individual.' },
];

export default function ConnectionsPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [proxy, setProxy] = useState('');
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  
  // Integração Webshare
  const [webshareAvailable, setWebshareAvailable] = useState(false);
  const [loadingWebshare, setLoadingWebshare] = useState(false);
  
  // Ações de carregamento individuais por instância
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Estados para Código de Pareamento por instância
  const [activeConnectTab, setActiveConnectTab] = useState<Record<string, 'qr' | 'code'>>({});
  const [pairingPhones, setPairingPhones] = useState<Record<string, string>>({});
  const [pairingCodes, setPairingCodes] = useState<Record<string, string>>({});
  const [pairingLoading, setPairingLoading] = useState<Record<string, boolean>>({});
  const [pairingErrors, setPairingErrors] = useState<Record<string, string>>({});
  const [copiedInstance, setCopiedInstance] = useState<string | null>(null);

  const fetchInstances = async () => {
    try {
      const res = await fetch('/api/whatsapp/instances');
      if (res.ok) setInstances(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const checkWebshareStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/webshare-proxies?action=status');
      const data = await res.json();
      if (data.success && data.configured) {
        setWebshareAvailable(true);
      }
    } catch (err) {
      console.error('Erro ao checar status do Webshare:', err);
    }
  };

  const handleGetWebshareProxy = async () => {
    setLoadingWebshare(true);
    setModalError('');
    try {
      const res = await fetch('/api/whatsapp/webshare-proxies?action=random');
      const data = await res.json();
      if (res.ok && data.success) {
        setProxy(data.proxy);
      } else {
        setModalError(data.error || 'Nenhum proxy disponível na sua conta Webshare.');
      }
    } catch (err) {
      setModalError('Falha ao conectar na API da Webshare.');
    } finally {
      setLoadingWebshare(false);
    }
  };

  useEffect(() => {
    fetchInstances();
    checkWebshareStatus();
    const interval = setInterval(fetchInstances, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!newInstanceName.trim()) {
      setModalError('O nome é obrigatório.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newInstanceName.trim(),
          proxy: proxy.trim() || null
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        setNewInstanceName('');
        setProxy('');
        await fetchInstances();
      } else {
        setModalError(data.error || 'Erro ao criar instância.');
      }
    } catch (err) {
      setModalError('Erro de conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async (name: string) => {
    setActionLoading(name);
    try {
      await fetch(`/api/whatsapp/instances/${name}`);
      await fetchInstances();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async (name: string) => {
    if (!confirm('Deseja realmente desconectar este chip do WhatsApp?')) return;
    setActionLoading(name);
    try {
      await fetch(`/api/whatsapp/instances/${name}/logout`, { method: 'POST' });
      // Limpa os estados de pareamento salvos localmente ao desconectar
      setPairingCodes(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      await fetchInstances();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm('ATENÇÃO: Excluir a conexão removerá todos os dados locais e de aquecimento dela. Confirmar exclusão?')) return;
    setActionLoading(name);
    try {
      await fetch(`/api/whatsapp/instances/${name}`, { method: 'DELETE' });
      await fetchInstances();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGeneratePairingCode = async (instanceName: string) => {
    const rawPhone = pairingPhones[instanceName];
    if (!rawPhone || !rawPhone.trim()) {
      setPairingErrors(prev => ({ ...prev, [instanceName]: 'Informe o telefone com DDI e DDD.' }));
      return;
    }

    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setPairingErrors(prev => ({ ...prev, [instanceName]: 'Número muito curto. Digite com DDD.' }));
      return;
    }

    setPairingErrors(prev => ({ ...prev, [instanceName]: '' }));
    setPairingLoading(prev => ({ ...prev, [instanceName]: true }));

    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();
      if (res.ok) {
        setPairingCodes(prev => ({ ...prev, [instanceName]: data.code }));
      } else {
        setPairingErrors(prev => ({ ...prev, [instanceName]: data.error || 'Falha ao obter código.' }));
      }
    } catch (err) {
      setPairingErrors(prev => ({ ...prev, [instanceName]: 'Erro ao conectar ao servidor.' }));
    } finally {
      setPairingLoading(prev => ({ ...prev, [instanceName]: false }));
    }
  };

  const copyToClipboard = (text: string, name: string) => {
    navigator.clipboard.writeText(text);
    setCopiedInstance(name);
    setTimeout(() => setCopiedInstance(null), 2000);
  };

  // Estatísticas do topo
  const total = instances.length;
  const connected = instances.filter(i => i.status === 'CONNECTED').length;
  const avgProtection = total > 0
    ? Math.round(instances.reduce((acc, i) => acc + (i.protectionScore || 0), 0) / total)
    : 0;
  const totalAlerts = instances.reduce((acc, i) => acc + (i.alerts?.length || 0), 0);
  const highAlerts = instances.reduce((acc, i) => acc + (i.alerts?.filter(a => a.severity === 'HIGH').length || 0), 0);

  // Score de proteção global
  const globalProtectionColor = avgProtection >= 80 ? '#10b981' : avgProtection >= 50 ? '#f59e0b' : '#ef4444';
  const globalProtectionLabel = avgProtection >= 80 ? 'Excelente' : avgProtection >= 50 ? 'Parcial' : 'Em Risco';
  const GlobalIcon = avgProtection >= 80 ? ShieldCheck : avgProtection >= 50 ? Shield : ShieldAlert;

  // Todos os alertas agrupados
  const allAlerts = instances.flatMap(i => 
    (i.alerts || []).map(a => ({ ...a, chipName: i.profileName || i.name }))
  );

  return (
    <AppLayout title="Conexões WhatsApp">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Smartphone style={{ color: '#10b981' }} size={24} />
            Conexões WhatsApp
          </h1>
          <p className="page-description">
            Gerencie múltiplos chips com proteção anti-ban inteligente.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          <span>Nova Conexão</span>
        </button>
      </div>

      {/* ═══════════════ PAINEL DE PROTEÇÃO GLOBAL ═══════════════ */}
      {total > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}>
          {/* Score Global */}
          <div className="card-glass" style={{
            padding: '1.25rem',
            display: 'flex', alignItems: 'center', gap: '1rem',
            border: `1px solid ${globalProtectionColor}25`,
          }}>
            <div style={{
              padding: '0.75rem',
              background: `${globalProtectionColor}15`,
              color: globalProtectionColor,
              borderRadius: '12px',
            }}>
              <GlobalIcon size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: globalProtectionColor }}>
                {avgProtection}%
              </div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                Proteção {globalProtectionLabel}
              </div>
            </div>
          </div>

          {/* Total de Chips */}
          <div className="card-glass" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: '12px' }}>
              <Smartphone size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>{total}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Chips Cadastrados</div>
            </div>
          </div>

          {/* Conectados */}
          <div className="card-glass" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: '12px' }}>
              <Wifi size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{connected}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Conectados</div>
            </div>
          </div>

          {/* Alertas */}
          <div className="card-glass" style={{
            padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem',
            border: highAlerts > 0 ? '1px solid rgba(239,68,68,0.2)' : undefined,
          }}>
            <div style={{
              padding: '0.75rem',
              background: highAlerts > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              color: highAlerts > 0 ? '#ef4444' : '#f59e0b',
              borderRadius: '12px',
            }}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: highAlerts > 0 ? '#ef4444' : totalAlerts > 0 ? '#f59e0b' : '#10b981' }}>
                {totalAlerts}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                {totalAlerts === 0 ? 'Sem Alertas' : `Alertas Ativos (${highAlerts} críticos)`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ ALERTAS PROATIVOS ═══════════════ */}
      {allAlerts.length > 0 && (
        <div className="card-glass" style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          border: '1px solid rgba(245,158,11,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <AlertTriangle size={16} color="#f59e0b" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>
              Ações Recomendadas para Proteger Seus Números
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {allAlerts.slice(0, 8).map((alert, i) => {
              const sevColor = alert.severity === 'HIGH' ? '#ef4444' : alert.severity === 'MEDIUM' ? '#f59e0b' : '#3b82f6';
              const sevIcon = alert.severity === 'HIGH' ? '🔴' : alert.severity === 'MEDIUM' ? '⚠️' : '💡';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.65rem',
                  background: `${sevColor}08`,
                  borderRadius: '6px',
                  borderLeft: `3px solid ${sevColor}`,
                  fontSize: '0.75rem',
                }}>
                  <span>{sevIcon}</span>
                  <span style={{ fontWeight: 700, color: sevColor, minWidth: '80px' }}>
                    {alert.chipName}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {alert.message}
                  </span>
                </div>
              );
            })}
            {allAlerts.length > 8 && (
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '0.25rem' }}>
                +{allAlerts.length - 8} alertas adicionais
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ GUIA DE PROTEÇÃO ═══════════════ */}
      <div className="card-glass" style={{
        marginBottom: '1.25rem',
        border: '1px solid rgba(59,130,246,0.1)',
        overflow: 'hidden',
      }}>
        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'white',
            padding: '0.85rem 1.25rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={16} color="#3b82f6" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3b82f6' }}>
              📖 Como Proteger Seus Números — Guia Anti-Ban
            </span>
          </div>
          {showGuide ? <ChevronUp size={16} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={16} color="rgba(255,255,255,0.4)" />}
        </button>
        {showGuide && (
          <div style={{
            padding: '0 1.25rem 1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '0.75rem',
          }}>
            {PROTECTION_GUIDE.map((item, i) => (
              <div key={i} style={{
                padding: '0.85rem 1rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>
                    {i + 1}. {item.title}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.45 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════ GRID DE INSTÂNCIAS ═══════════════ */}
      {loading && instances.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>Buscando chips conectados...</div>
        </div>
      ) : instances.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
          <h3 style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.8)' }}>Nenhuma conexão de WhatsApp ativa</h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
            Para começar a aquecer ou enviar mensagens, crie e conecte sua primeira instância de chip.
          </p>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            Cadastrar Primeiro Chip
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))', gap: '1.25rem' }}>
          {instances.map(inst => {
            const isConnected = inst.status === 'CONNECTED';
            const isInitializing = inst.status === 'INITIALIZING';
            const isActLoading = actionLoading === inst.name;
            const currentTab = activeConnectTab[inst.name] || 'qr';
            const pairingCode = pairingCodes[inst.name];
            const isPairLoading = pairingLoading[inst.name];
            const pairError = pairingErrors[inst.name];
            const chipAlerts = inst.alerts || [];
            const hasHighAlert = chipAlerts.some(a => a.severity === 'HIGH');

            return (
              <div
                key={inst.id}
                className="card-glass card-glow"
                style={{
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  border: hasHighAlert 
                    ? '1px solid rgba(239,68,68,0.25)' 
                    : isConnected 
                      ? '1px solid rgba(16,185,129,0.2)' 
                      : '1px solid rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                {/* ── Perfil & Status ── */}
                <div style={{
                  padding: '1.25rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}>
                  {/* Foto de Perfil */}
                  {isConnected && inst.profilePicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inst.profilePicUrl}
                      alt="Avatar"
                      style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #10b981' }}
                    />
                  ) : (
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #1e293b, #334155)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      color: isConnected ? '#10b981' : '#6b7280',
                      border: isConnected ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.05)',
                    }}>
                      {inst.profileName ? inst.profileName[0]?.toUpperCase() : inst.name[0]?.toUpperCase()}
                    </div>
                  )}

                  {/* Nome da Instância e Telefone */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inst.profileName || inst.name}
                      </h4>
                      {inst.profileName && (
                        <span style={{ fontSize: '0.65rem', padding: '1px 5px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', color: 'rgba(255,255,255,0.5)' }}>
                          {inst.name}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {inst.phone ? `+${inst.phone}` : 'Não conectado'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 4, flexWrap: 'wrap' }}>
                      {/* Status badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{
                          width: 6, height: 6,
                          background: isConnected ? '#10b981' : isInitializing ? '#f59e0b' : '#ef4444',
                          borderRadius: '50%',
                          animation: isInitializing ? 'pulse 1.2s infinite' : 'none',
                        }} />
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700,
                          color: isConnected ? '#10b981' : isInitializing ? '#f59e0b' : '#ef4444',
                        }}>
                          {isConnected ? 'ONLINE' : isInitializing ? 'GERANDO...' : 'DESCONECTADO'}
                        </span>
                      </div>

                      {/* Protection badge */}
                      {isConnected && inst.protectionScore !== undefined && (
                        <ProtectionBadge score={inst.protectionScore} />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Área Interna ── */}
                <div style={{ padding: '1rem 1.25rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '250px' }}>
                  {isConnected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {/* Barras de limite */}
                      <LimitBar value={inst.dailyMsgCount || 0} max={MAX_DAILY} label="📤 Mensagens Hoje" color="#3b82f6" />
                      <LimitBar value={inst.hourlyMsgCount || 0} max={MAX_HOURLY} label="⏱️ Última Hora (sliding)" color="#10b981" />
                      
                      {/* Grau de Aquecimento */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: 3 }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Flame size={11} color="#f59e0b" /> Aquecimento
                          </span>
                          <strong style={{ color: '#f59e0b' }}>{inst.warmupProgress}%</strong>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{
                            height: '100%',
                            width: `${inst.warmupProgress}%`,
                            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                            borderRadius: 2,
                            transition: 'width 0.6s ease',
                          }} />
                        </div>
                      </div>

                      {/* Status de Proteção detalhado */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.4rem',
                        marginTop: '0.15rem',
                      }}>
                        {/* Proxy */}
                        <div style={{
                          padding: '0.4rem 0.6rem',
                          background: inst.proxy ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                          borderRadius: '6px',
                          border: `1px solid ${inst.proxy ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}`,
                          fontSize: '0.65rem',
                        }}>
                          <div style={{ color: inst.proxy ? '#10b981' : '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Globe size={10} />
                            {inst.proxy ? '✓ Proxy Ativo' : '✗ Sem Proxy'}
                          </div>
                          {inst.proxy && (
                            <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inst.proxy.includes('@') ? inst.proxy.split('@')[1] : inst.proxy}
                            </div>
                          )}
                        </div>

                        {/* Saúde */}
                        <div style={{
                          padding: '0.4rem 0.6rem',
                          background: (inst.healthScore || 0) >= 70 ? 'rgba(16,185,129,0.06)' : (inst.healthScore || 0) >= 40 ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
                          borderRadius: '6px',
                          border: `1px solid ${(inst.healthScore || 0) >= 70 ? 'rgba(16,185,129,0.12)' : (inst.healthScore || 0) >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'}`,
                          fontSize: '0.65rem',
                        }}>
                          <div style={{
                            color: (inst.healthScore || 0) >= 70 ? '#10b981' : (inst.healthScore || 0) >= 40 ? '#f59e0b' : '#ef4444',
                            fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}>
                            <Activity size={10} />
                            Saúde: {inst.healthScore ?? 0}%
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                            {(inst.healthScore || 0) >= 70 ? 'Excelente' : (inst.healthScore || 0) >= 40 ? 'Degradada' : 'Crítica — pause!'}
                          </div>
                        </div>

                        {/* Warmup */}
                        <div style={{
                          padding: '0.4rem 0.6rem',
                          background: inst.activeWarmupType !== 'NONE' ? 'rgba(245,158,11,0.06)' : 'rgba(100,116,139,0.06)',
                          borderRadius: '6px',
                          border: `1px solid ${inst.activeWarmupType !== 'NONE' ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.12)'}`,
                          fontSize: '0.65rem',
                        }}>
                          <div style={{
                            color: inst.activeWarmupType !== 'NONE' ? '#f59e0b' : '#64748b',
                            fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}>
                            {inst.activeWarmupType !== 'NONE' ? <Flame size={10} /> : <Snowflake size={10} />}
                            {inst.activeWarmupType === 'SINGLE' ? '🔥 Aquecendo' : inst.activeWarmupType === 'POOL' ? '👥 Pool Ativo' : '🧊 Chip Frio'}
                          </div>
                        </div>

                        {/* Cooldown / Último envio */}
                        <div style={{
                          padding: '0.4rem 0.6rem',
                          background: inst.isInCooldown ? 'rgba(59,130,246,0.06)' : 'rgba(100,116,139,0.06)',
                          borderRadius: '6px',
                          border: `1px solid ${inst.isInCooldown ? 'rgba(59,130,246,0.12)' : 'rgba(100,116,139,0.12)'}`,
                          fontSize: '0.65rem',
                        }}>
                          <div style={{
                            color: inst.isInCooldown ? '#3b82f6' : '#64748b',
                            fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}>
                            <Clock size={10} />
                            {inst.isInCooldown ? '⏸️ Em Descanso' : 'Último Envio'}
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                            {inst.lastMessageAt
                              ? new Date(inst.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                              : 'Nenhum'}
                          </div>
                        </div>
                      </div>

                      {/* Alertas do chip */}
                      {chipAlerts.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.2rem' }}>
                          {chipAlerts.slice(0, 3).map((alert, i) => {
                            const ac = alert.severity === 'HIGH' ? '#ef4444' : alert.severity === 'MEDIUM' ? '#f59e0b' : '#3b82f6';
                            return (
                              <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                padding: '0.3rem 0.5rem',
                                background: `${ac}08`,
                                borderLeft: `2px solid ${ac}`,
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                color: 'rgba(255,255,255,0.55)',
                              }}>
                                <AlertTriangle size={10} color={ac} />
                                {alert.message}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Mostrar Conexão Alternativa (QR Code ou Código de Pareamento)
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      {/* Sub-abas de Conexão */}
                      {!pairingCode && (
                        <div style={{
                          display: 'flex',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          marginBottom: '0.75rem',
                          fontSize: '0.75rem',
                        }}>
                          <button
                            type="button"
                            onClick={() => setActiveConnectTab(prev => ({ ...prev, [inst.name]: 'qr' }))}
                            style={{
                              flex: 1,
                              background: 'none',
                              border: 'none',
                              borderBottom: currentTab === 'qr' ? '2px solid #10b981' : 'none',
                              color: currentTab === 'qr' ? '#10b981' : 'rgba(255,255,255,0.4)',
                              padding: '0.4rem',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            QR Code
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveConnectTab(prev => ({ ...prev, [inst.name]: 'code' }))}
                            style={{
                              flex: 1,
                              background: 'none',
                              border: 'none',
                              borderBottom: currentTab === 'code' ? '2px solid #10b981' : 'none',
                              color: currentTab === 'code' ? '#10b981' : 'rgba(255,255,255,0.4)',
                              padding: '0.4rem',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Código de Celular
                          </button>
                        </div>
                      )}

                      {/* Conteúdo da Aba QR Code */}
                      {currentTab === 'qr' && !pairingCode && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                          {inst.qrCode ? (
                            <div style={{ textAlign: 'center' }}>
                              <div style={{
                                backgroundColor: 'white',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                display: 'inline-block',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                marginBottom: '0.4rem',
                              }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={inst.qrCode}
                                  alt="Scan me"
                                  style={{ width: '120px', height: '120px', display: 'block' }}
                                />
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                                QR Code Ativo! Escaneie no WhatsApp.
                              </div>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                              <div style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                                Clique em &quot;Gerar QR Code&quot; abaixo.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Conteúdo da Aba Código de Celular */}
                      {currentTab === 'code' && !pairingCode && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', justifyContent: 'center', flex: 1 }}>
                          <div>
                            <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>
                              Número do Celular (com DDI e DDD)
                            </label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Ex: 5516999999999"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                              value={pairingPhones[inst.name] || ''}
                              onChange={e => setPairingPhones(prev => ({ ...prev, [inst.name]: e.target.value }))}
                            />
                          </div>

                          {pairError && (
                            <div style={{ color: '#ef4444', fontSize: '0.7rem', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: '4px' }}>
                              {pairError}
                            </div>
                          )}

                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', justifyContent: 'center', width: '100%' }}
                            onClick={() => handleGeneratePairingCode(inst.name)}
                            disabled={isPairLoading}
                          >
                            {isPairLoading ? 'Obtendo Código...' : 'Gerar Código de Conexão'}
                          </button>
                        </div>
                      )}

                      {/* Exibição do Código de Pareamento Gerado */}
                      {pairingCode && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.5rem', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Key size={12} color="#10b981" /> Código de Pareamento WhatsApp
                          </div>
                          
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: 'rgba(16,185,129,0.08)',
                            border: '1px solid rgba(16,185,129,0.2)',
                            borderRadius: '10px',
                            cursor: 'pointer',
                          }}
                            onClick={() => copyToClipboard(pairingCode, inst.name)}
                            title="Clique para copiar"
                          >
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', letterSpacing: '2px', fontFamily: 'monospace' }}>
                              {pairingCode}
                            </span>
                            {copiedInstance === inst.name ? (
                              <Check size={16} color="#10b981" />
                            ) : (
                              <Copy size={16} color="rgba(255,255,255,0.4)" />
                            )}
                          </div>

                          <div style={{
                            fontSize: '0.65rem',
                            color: 'rgba(255,255,255,0.5)',
                            lineHeight: '1.3',
                            background: 'rgba(0,0,0,0.15)',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            textAlign: 'left'
                          }}>
                            <strong>Como conectar:</strong><br />
                            1. Abra o WhatsApp no celular.<br />
                            2. Vá em Aparelhos Conectados &gt; Conectar aparelho.<br />
                            3. Toque em <strong>&quot;Conectar com número de telefone&quot;</strong> e insira o código acima.
                          </div>

                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'rgba(255,255,255,0.4)',
                              fontSize: '0.7rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                              marginTop: 2
                            }}
                            onClick={() => {
                              setPairingCodes(prev => {
                                const copy = { ...prev };
                                delete copy[inst.name];
                                return copy;
                              });
                            }}
                          >
                            <ChevronLeft size={12} /> Voltar/Alterar número
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Footer / Ações ── */}
                <div style={{
                  padding: '0.6rem 1rem',
                  background: 'rgba(0,0,0,0.15)',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  gap: '0.5rem',
                }}>
                  {isConnected ? (
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                      onClick={() => handleLogout(inst.name)}
                      disabled={isActLoading}
                    >
                      <LogOut size={13} />
                      Desconectar
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                      onClick={() => currentTab === 'qr' ? handleRefresh(inst.name) : handleGeneratePairingCode(inst.name)}
                      disabled={isActLoading || isPairLoading}
                    >
                      <RefreshCw size={13} className={(isActLoading || isPairLoading) ? 'spin' : ''} />
                      {(isActLoading || isPairLoading) ? 'Gerando...' : (currentTab === 'qr' ? 'Gerar QR Code' : 'Gerar Código')}
                    </button>
                  )}

                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.5rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
                    onClick={() => handleDelete(inst.name)}
                    disabled={isActLoading}
                    title="Excluir Conexão"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal - Nova Conexão */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Smartphone size={18} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Cadastrar Nova Conexão</h3>
              </div>
              <button className="btn-close" onClick={() => { setIsModalOpen(false); setNewInstanceName(''); setModalError(''); }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateInstance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: 6, display: 'block' }}>
                  Nome Identificador da Instância (Apenas letras e números)
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ex: vendas-1, suporte-sp"
                  value={newInstanceName}
                  onChange={e => setNewInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                    Proxy de Conexão (Opcional)
                  </label>
                  {webshareAvailable && (
                    <button
                      type="button"
                      onClick={handleGetWebshareProxy}
                      disabled={loadingWebshare}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#10b981',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0
                      }}
                    >
                      {loadingWebshare ? 'Buscando IP...' : '⚡ Gerar via Webshare'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: http://usuario:senha@ip:porta"
                  value={proxy}
                  onChange={e => setProxy(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', outline: 'none' }}
                />
                <small style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem', marginTop: 2, display: 'block' }}>
                  Suporta HTTP ou SOCKS5 para evitar bloqueios de IP pela Meta.
                </small>
              </div>

              {/* Dica de proteção no modal */}
              <div style={{
                padding: '0.5rem 0.7rem',
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.12)',
                borderRadius: '6px',
                fontSize: '0.7rem',
                color: 'rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
              }}>
                <Info size={14} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong style={{ color: '#3b82f6' }}>Dica:</strong> Configure um proxy ao cadastrar para proteger seu número desde o início. Chips sem proxy compartilham o IP do servidor.
                </span>
              </div>

              {modalError && (
                <div style={{ color: '#ef4444', fontSize: '0.78rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>
                  ⚠️ {modalError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => { setIsModalOpen(false); setNewInstanceName(''); setModalError(''); }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  {submitting ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </AppLayout>
  );
}

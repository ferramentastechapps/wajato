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
  Info,
  Edit3
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
  // Mensagens sem resposta
  unrepliedMsgCount: number;
  maxUnrepliedLimit: number;
  unrepliedBlockEnabled: boolean;
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

  // Estados para edição manual de proxy
  const [editingInstance, setEditingInstance] = useState<string | null>(null);
  const [editProxy, setEditProxy] = useState('');

  // Estados para Edição de Perfil do WhatsApp
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editingProfileInstance, setEditingProfileInstance] = useState<Instance | null>(null);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfileStatus, setEditProfileStatus] = useState('');
  const [editProfilePic, setEditProfilePic] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState('');

  const handleOpenEditProfile = async (inst: Instance) => {
    setEditingProfileInstance(inst);
    setEditProfileName(inst.profileName || '');
    setEditProfilePic(inst.profilePicUrl || '');
    setEditProfileStatus('');
    setEditProfileError('');
    setIsEditProfileOpen(true);

    try {
      const res = await fetch(`/api/whatsapp/instances/${inst.name}`);
      if (res.ok) {
        const data = await res.json();
        if (data.about) {
          setEditProfileStatus(data.about);
        }
        if (data.profileName) {
          setEditProfileName(data.profileName);
        }
        if (data.profilePicUrl) {
          setEditProfilePic(data.profilePicUrl);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar bio do perfil:', err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileInstance) return;

    setUpdatingProfile(true);
    setEditProfileError('');

    try {
      const payload: any = {};
      
      if (editProfileName !== editingProfileInstance.profileName) {
        payload.profileName = editProfileName.trim();
      }
      
      payload.profileStatus = editProfileStatus.trim();
      
      if (editProfilePic !== editingProfileInstance.profilePicUrl) {
        payload.profilePic = editProfilePic.trim();
      }

      const res = await fetch(`/api/whatsapp/instances/${editingProfileInstance.name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsEditProfileOpen(false);
        setEditingProfileInstance(null);
        await fetchInstances();
      } else {
        const data = await res.json();
        setEditProfileError(data.error || 'Erro ao atualizar dados do perfil.');
      }
    } catch (err: any) {
      console.error(err);
      setEditProfileError('Erro de conexão ao atualizar perfil.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setEditProfileError('A imagem deve ter no máximo 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setEditProfilePic(reader.result);
      }
    };
    reader.onerror = () => {
      setEditProfileError('Erro ao ler o arquivo de imagem.');
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProxy = async (name: string) => {
    let formattedProxy = editProxy.trim();
    if (formattedProxy) {
      if (!formattedProxy.startsWith('http://') && !formattedProxy.startsWith('https://') && !formattedProxy.startsWith('socks5://')) {
        const parts = formattedProxy.split(':');
        if (parts.length === 4) {
          formattedProxy = `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
        } else {
          formattedProxy = `http://${formattedProxy}`;
        }
      }
    }

    setActionLoading(name);
    try {
      const res = await fetch(`/api/whatsapp/instances/${name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: formattedProxy || null }),
      });
      if (res.ok) {
        setEditingInstance(null);
        await fetchInstances();
      } else {
        alert('Erro ao atualizar proxy da conexão.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao atualizar proxy.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGetWebshareProxyForEdit = async () => {
    setLoadingWebshare(true);
    try {
      const res = await fetch('/api/whatsapp/webshare-proxies?action=random');
      const data = await res.json();
      if (res.ok && data.proxy) {
        setEditProxy(data.proxy);
      } else {
        alert(data.error || 'Nenhum proxy disponível na sua conta Webshare.');
      }
    } catch (err) {
      alert('Falha ao conectar na API da Webshare.');
    } finally {
      setLoadingWebshare(false);
    }
  };

  // Estados para Proteção anti-ban por mensagens sem resposta
  const [protectionEnabled, setProtectionEnabled] = useState<Record<string, boolean>>({});
  const [protectionLimit, setProtectionLimit] = useState<Record<string, number>>({});
  const [savingProtection, setSavingProtection] = useState<Record<string, boolean>>({});

  const handleToggleProtection = (name: string, checked: boolean, defaultLimit: number) => {
    setProtectionEnabled(prev => ({ ...prev, [name]: checked }));
    if (protectionLimit[name] === undefined) {
      setProtectionLimit(prev => ({ ...prev, [name]: defaultLimit }));
    }
  };

  const handleLimitChange = (name: string, limit: number) => {
    setProtectionLimit(prev => ({ ...prev, [name]: limit }));
  };

  const handleSaveProtectionSettings = async (name: string, inst: Instance) => {
    const enabled = protectionEnabled[name] !== undefined ? protectionEnabled[name] : inst.unrepliedBlockEnabled;
    const limit = protectionLimit[name] !== undefined ? protectionLimit[name] : inst.maxUnrepliedLimit;

    setSavingProtection(prev => ({ ...prev, [name]: true }));
    try {
      const res = await fetch(`/api/whatsapp/instances/${name}/protection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unrepliedBlockEnabled: enabled,
          maxUnrepliedLimit: limit,
        }),
      });
      if (res.ok) {
        await fetchInstances();
        alert(`Configurações de proteção do chip "${inst.profileName || name}" salvas com sucesso!`);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao salvar configurações de proteção.');
      }
    } catch (err) {
      alert('Erro de conexão ao salvar.');
    } finally {
      setSavingProtection(prev => ({ ...prev, [name]: false }));
    }
  };

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
                    <div 
                      style={{ position: 'relative', cursor: 'pointer' }} 
                      onClick={() => handleOpenEditProfile(inst)}
                      title="Editar Perfil"
                    >
                      <img
                        src={inst.profilePicUrl}
                        alt="Avatar"
                        style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #10b981', transition: 'opacity 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      />
                      <div style={{
                        position: 'absolute', bottom: 0, right: 0,
                        background: '#10b981', borderRadius: '50%',
                        width: '16px', height: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid #222e35'
                      }}>
                        <Edit3 size={9} color="#111b21" />
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={() => isConnected && handleOpenEditProfile(inst)}
                      style={{
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
                        position: 'relative',
                        cursor: isConnected ? 'pointer' : 'default',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={e => { if (isConnected) e.currentTarget.style.opacity = '0.8'; }}
                      onMouseLeave={e => { if (isConnected) e.currentTarget.style.opacity = '1'; }}
                      title={isConnected ? "Editar Perfil" : undefined}
                    >
                      {inst.profileName ? inst.profileName[0]?.toUpperCase() : inst.name[0]?.toUpperCase()}
                      {isConnected && (
                        <div style={{
                          position: 'absolute', bottom: 0, right: 0,
                          background: '#10b981', borderRadius: '50%',
                          width: '16px', height: '16px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '2px solid #222e35'
                        }}>
                          <Edit3 size={9} color="#111b21" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Nome da Instância e Telefone */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inst.profileName || inst.name}
                      </h4>
                      {isConnected && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditProfile(inst)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'rgba(255,255,255,0.45)', padding: '2px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = '#10b981'}
                          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
                          title="Editar Perfil"
                        >
                          <Edit3 size={11} />
                        </button>
                      )}
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

                      {/* Status de Bloqueio por falta de resposta */}
                      {isConnected && inst.unrepliedBlockEnabled && inst.unrepliedMsgCount >= inst.maxUnrepliedLimit && (
                        <div style={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ef4444',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          animation: 'pulse 1.5s infinite'
                        }}>
                          🚫 PAUSADO (SEM RESPOSTA)
                        </div>
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
                      
                      {inst.unrepliedBlockEnabled && (
                        <LimitBar 
                          value={inst.unrepliedMsgCount || 0} 
                          max={inst.maxUnrepliedLimit || 20} 
                          label="⚠️ Disparos Sem Resposta (outbound)" 
                          color="#f59e0b" 
                        />
                      )}
                      
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
                          {editingInstance === inst.name ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <input
                                type="text"
                                value={editProxy}
                                onChange={e => setEditProxy(e.target.value)}
                                placeholder="http://user:pass@host:port"
                                style={{
                                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
                                  borderRadius: 4, color: 'white', fontSize: '0.68rem', padding: '3px 4px',
                                  width: '100%', outline: 'none'
                                }}
                              />
                              {webshareAvailable && (
                                <button
                                  type="button"
                                  onClick={handleGetWebshareProxyForEdit}
                                  disabled={loadingWebshare}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#3b82f6', fontSize: '0.62rem', fontWeight: 700,
                                    textDecoration: 'underline', padding: 0, textAlign: 'left',
                                    marginBottom: 2
                                  }}
                                >
                                  {loadingWebshare ? 'Gerando...' : '⚡ Gerar via Webshare'}
                                </button>
                              )}
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateProxy(inst.name)}
                                  disabled={actionLoading === inst.name}
                                  style={{
                                    flex: 1, background: '#10b981', border: 'none', color: '#111b21',
                                    fontSize: '0.65rem', fontWeight: 700, borderRadius: 4, padding: '2px 4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {actionLoading === inst.name ? '...' : 'OK'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingInstance(null)}
                                  style={{
                                    flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                                    fontSize: '0.65rem', fontWeight: 600, borderRadius: 4, padding: '2px 4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Canc
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ color: inst.proxy ? '#10b981' : '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Globe size={10} />
                                  {inst.proxy ? '✓ Proxy' : '✗ Sem Proxy'}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingInstance(inst.name);
                                    setEditProxy(inst.proxy || '');
                                  }}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#10b981', fontSize: '0.62rem', fontWeight: 700,
                                    textDecoration: 'underline', padding: 0
                                  }}
                                >
                                  Alt
                                </button>
                              </div>
                              {inst.proxy && (
                                <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inst.proxy}>
                                  {inst.proxy.includes('@') ? inst.proxy.split('@')[1] : inst.proxy}
                                </div>
                              )}
                            </>
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

                      {/* Configurações de Proteção do Chip */}
                      <div style={{
                        padding: '0.65rem 0.8rem',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={protectionEnabled[inst.name] !== undefined ? protectionEnabled[inst.name] : inst.unrepliedBlockEnabled}
                              onChange={(e) => handleToggleProtection(inst.name, e.target.checked, inst.maxUnrepliedLimit)}
                            />
                            Pausar chip se ficar sem respostas
                          </label>
                        </div>
                        
                        {(protectionEnabled[inst.name] !== undefined ? protectionEnabled[inst.name] : inst.unrepliedBlockEnabled) && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: 2 }}>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>
                              Limite de disparos sem resposta:
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <input
                                type="number"
                                min="1"
                                max="1000"
                                className="form-input"
                                style={{ width: '50px', padding: '0.15rem 0.3rem', fontSize: '0.72rem', textAlign: 'center', height: '24px' }}
                                value={protectionLimit[inst.name] !== undefined ? protectionLimit[inst.name] : inst.maxUnrepliedLimit}
                                onChange={(e) => handleLimitChange(inst.name, parseInt(e.target.value) || 20)}
                              />
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.68rem', height: '24px', whiteSpace: 'nowrap' }}
                                onClick={() => handleSaveProtectionSettings(inst.name, inst)}
                                disabled={savingProtection[inst.name]}
                              >
                                {savingProtection[inst.name] ? 'Salvar...' : 'Salvar'}
                              </button>
                            </div>
                          </div>
                        )}
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

      {/* Modal - Editar Perfil */}
      {isEditProfileOpen && editingProfileInstance && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 20, 26, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, transition: 'all 0.3s ease'
        }}>
          <div className="modal-content" style={{
            maxWidth: '450px', width: '100%', background: '#222e35',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.4)',
            overflow: 'hidden', padding: '1.5rem', animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div className="modal-header" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Edit3 size={18} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'white' }}>
                  Editar Perfil — {editingProfileInstance.name}
                </h3>
              </div>
              <button 
                type="button"
                className="btn-close" 
                onClick={() => { setIsEditProfileOpen(false); setEditingProfileInstance(null); }}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', padding: '4px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Foto de perfil */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ position: 'relative', width: '90px', height: '90px' }}>
                  {editProfilePic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editProfilePic}
                      alt="Preview Avatar"
                      style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #10b981' }}
                    />
                  ) : (
                    <div style={{
                      width: '90px', height: '90px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, #1e293b, #334155)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '2rem', fontWeight: 700, color: '#10b981',
                      border: '3px solid rgba(255,255,255,0.05)'
                    }}>
                      {editProfileName ? editProfileName[0]?.toUpperCase() : editingProfileInstance.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <label htmlFor="profile-pic-file" style={{
                    position: 'absolute', bottom: 0, right: 0,
                    background: '#10b981', borderRadius: '50%',
                    width: '28px', height: '28px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '3px solid #222e35', cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s'
                  }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <Edit3 size={12} color="#111b21" />
                    <input
                      type="file"
                      id="profile-pic-file"
                      accept="image/*"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>
                  Clique no ícone para fazer upload de uma imagem (máx. 2MB)
                </span>
                
                {/* Fallback de URL de Imagem */}
                <div style={{ width: '100%', marginTop: '0.25rem' }}>
                  <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>
                    Ou insira uma URL de Imagem Pública
                  </label>
                  <input
                    type="text"
                    value={editProfilePic.startsWith('data:') ? '' : editProfilePic}
                    onChange={e => setEditProfilePic(e.target.value)}
                    placeholder="https://exemplo.com/minha-foto.jpg"
                    style={{
                      width: '100%', padding: '0.45rem 0.6rem', background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff',
                      fontSize: '0.8rem', outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Nome do perfil */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                    Nome de Perfil (WhatsApp)
                  </label>
                  <span style={{ fontSize: '0.68rem', color: editProfileName.length > 25 ? '#ef4444' : 'rgba(255,255,255,0.3)' }}>
                    {editProfileName.length}/25
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={25}
                  required
                  placeholder="Nome exibido nos contatos"
                  value={editProfileName}
                  onChange={e => setEditProfileName(e.target.value)}
                  style={{
                    width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff',
                    fontSize: '0.82rem', outline: 'none'
                  }}
                />
              </div>

              {/* Recado / Bio */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                    Recado (Status / Bio)
                  </label>
                  <span style={{ fontSize: '0.68rem', color: editProfileStatus.length > 139 ? '#ef4444' : 'rgba(255,255,255,0.3)' }}>
                    {editProfileStatus.length}/139
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={139}
                  placeholder="Recado no perfil (ex: Disponível)"
                  value={editProfileStatus}
                  onChange={e => setEditProfileStatus(e.target.value)}
                  style={{
                    width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff',
                    fontSize: '0.82rem', outline: 'none'
                  }}
                />
              </div>

              {editProfileError && (
                <div style={{
                  color: '#ef4444', fontSize: '0.78rem', padding: '0.6rem 0.8rem',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  {editProfileError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600 }}
                  onClick={() => { setIsEditProfileOpen(false); setEditingProfileInstance(null); }}
                  disabled={updatingProfile}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 1, padding: '0.55rem', borderRadius: '8px', fontSize: '0.82rem',
                    fontWeight: 700, background: '#10b981', color: '#111b21', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                  disabled={updatingProfile || editProfileName.length === 0}
                >
                  {updatingProfile ? 'Salvando...' : 'Salvar Alterações'}
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
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </AppLayout>
  );
}

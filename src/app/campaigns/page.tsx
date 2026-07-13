'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Send, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  X, 
  StopCircle, 
  AlertTriangle,
  AlertCircle,
  Clock,
  Eye,
  Calendar,
  Smartphone
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Campaign {
  id: string;
  name: string;
  status: 'DRAFT' | 'QUEUED' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  delayMin: number;
  delayMax: number;
  groupId?: string | null;
  segmentId?: string | null;
  group?: { id: string; name: string } | null;
  segment?: { id: string; name: string } | null;
  template: { id: string; name: string };
  stats: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    pending: number;
  };
  createdAt: string;
  scheduledAt?: string | null;
}

interface Group {
  id: string;
  name: string;
  _count?: {
    contacts: number;
  };
}

interface Template {
  id: string;
  name: string;
  body: string;
  imageUrl?: string | null;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddCampaign, setShowAddCampaign] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<'GROUP' | 'SEGMENT'>('GROUP');
  const [groupId, setGroupId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [delayMin, setDelayMin] = useState(15); // Padrão seguro
  const [delayMax, setDelayMax] = useState(45); // Padrão seguro
  const [errorMsg, setErrorMsg] = useState('');

  // Novas features de agendamento e presets
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [delayPreset, setDelayPreset] = useState<'safe' | 'medium' | 'fast' | 'custom'>('medium');

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/campaigns');
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error('Erro ao carregar campanhas:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupsAndTemplates = async () => {
    try {
      const response = await fetch('/api/contacts');
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups || []);
      }

      const templatesRes = await fetch('/api/templates');
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }

      const segmentsRes = await fetch('/api/contacts/segments');
      if (segmentsRes.ok) {
        const data = await segmentsRes.json();
        setSegments(data.segments || []);
      }
    } catch (err) {
      console.error('Erro ao carregar grupos/templates/segmentos:', err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchGroupsAndTemplates();
  }, []);

  const handleOpenModal = () => {
    setName('');
    setTargetType('GROUP');
    setGroupId(groups[0]?.id || '');
    setSegmentId(segments[0]?.id || '');
    setTemplateId(templates[0]?.id || '');
    setDelayMin(15);
    setDelayMax(45);
    setIsScheduled(false);
    setScheduledAt('');
    setDelayPreset('medium');
    setErrorMsg('');
    setShowAddCampaign(true);
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const targetId = targetType === 'GROUP' ? groupId : segmentId;
    if (!name || !targetId || !templateId) {
      setErrorMsg('Todos os campos marcados são obrigatórios');
      return;
    }

    if (isScheduled && !scheduledAt) {
      setErrorMsg('Selecione uma data e hora para o agendamento.');
      return;
    }
    
    if (delayMin < 5) {
      setErrorMsg('O delay mínimo recomendado é de 5 segundos para segurança.');
      return;
    }

    if (delayMax <= delayMin) {
      setErrorMsg('O delay máximo deve ser maior que o mínimo.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          groupId: targetType === 'GROUP' ? groupId : null,
          segmentId: targetType === 'SEGMENT' ? segmentId : null,
          templateId,
          delayMin,
          delayMax,
          scheduledAt: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null
        }),
      });

      if (response.ok) {
        setShowAddCampaign(false);
        fetchCampaigns();
      } else {
        const data = await response.json();
        setErrorMsg(data.message || 'Erro ao criar campanha.');
      }
    } catch (err) {
      setErrorMsg('Erro de conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCampaignAction = async (id: string, action: 'START' | 'PAUSE' | 'CANCEL') => {
    try {
      const response = await fetch(`/api/campaigns/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.message || 'Erro ao processar ação.');
      }
      
      fetchCampaigns();
    } catch (err) {
      console.error('Erro na ação:', err);
      alert('Erro de conexão ao executar a ação.');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta campanha? Seus logs serão apagados permanentemente.')) return;

    try {
      const response = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchCampaigns();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = (status: string, scheduledAtVal?: string | null) => {
    switch (status) {
      case 'DRAFT':
        return scheduledAtVal 
          ? <span className="badge" style={{ backgroundColor: '#6366f1', color: '#fff', borderColor: '#6366f1' }}>Agendada</span>
          : <span className="badge badge-info">Rascunho</span>;
      case 'QUEUED':
        return <span className="badge badge-warning">Na Fila</span>;
      case 'SENDING':
        return <span className="badge badge-success pulse-glow">Enviando</span>;
      case 'PAUSED':
        return <span className="badge badge-warning">Pausada</span>;
      case 'COMPLETED':
        return <span className="badge badge-success">Concluída</span>;
      case 'CANCELLED':
        return <span className="badge badge-error">Cancelada</span>;
      default:
        return <span className="badge badge-info">{status}</span>;
    }
  };

  // Cálculo da quantidade estimada de contatos no Grupo Estático
  const selectedGroup = groups.find(g => g.id === groupId);
  const contactsCount = targetType === 'GROUP' && selectedGroup ? selectedGroup._count?.contacts || 0 : 0;

  // Formata duração em segundos de maneira amigável
  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec} segundos`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minutos`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return remMin > 0 ? `${hr}h e ${remMin}m` : `${hr} horas`;
  };

  return (
    <AppLayout title="Campanhas">
      {/* Botão de nova ação */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button onClick={handleOpenModal} className="btn btn-primary">
          <Plus size={16} />
          Nova Campanha
        </button>
      </div>

      {/* Lista de campanhas */}
      {loading ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando campanhas...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>
          <Send size={48} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
          <p>Nenhuma campanha de disparos criada.</p>
          <button onClick={handleOpenModal} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Criar Primeira Campanha
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {campaigns.map((camp) => {
            const hasLogs = camp.stats.total > 0;
            const percent = hasLogs ? (camp.stats.sent / camp.stats.total) * 100 : 0;

            return (
              <div key={camp.id} className="card-glass" style={{ padding: '1.5rem 2rem' }}>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{camp.name}</h3>
                    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#9ca3af', alignItems: 'center' }}>
                      <span>Template: <strong>{camp.template.name}</strong></span>
                      {camp.group ? (
                        <span>Grupo-Alvo: <strong>{camp.group.name}</strong></span>
                      ) : camp.segment ? (
                        <span>Segmentação: <strong>{camp.segment.name}</strong></span>
                      ) : (
                        <span>Destino: <strong>Nenhum</strong></span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} />
                        Delay: {camp.delayMin}s - {camp.delayMax}s
                      </span>
                      {camp.scheduledAt && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#818cf8', fontWeight: 600 }}>
                          <Calendar size={12} />
                          Agendado: {new Date(camp.scheduledAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {getStatusBadge(camp.status, camp.scheduledAt)}
                    
                    {/* Controles de Execução */}
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      borderLeft: '1px solid var(--border)',
                      paddingLeft: '1rem'
                    }}>
                      {camp.status !== 'SENDING' && camp.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleCampaignAction(camp.id, 'START')}
                          className="btn btn-primary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                          title="Iniciar/Retomar Envio"
                        >
                          <Play size={12} />
                          Disparar
                        </button>
                      )}
                      {camp.status === 'SENDING' && (
                        <button
                          onClick={() => handleCampaignAction(camp.id, 'PAUSE')}
                          className="btn btn-secondary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#d97706', color: '#fff', borderColor: '#d97706' }}
                          title="Pausar Envio"
                        >
                          <Pause size={12} />
                          Pausar
                        </button>
                      )}
                      {(camp.status === 'SENDING' || camp.status === 'PAUSED') && (
                        <button
                          onClick={() => handleCampaignAction(camp.id, 'CANCEL')}
                          className="btn btn-danger"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                          title="Cancelar Campanha"
                        >
                          <StopCircle size={12} />
                          Cancelar
                        </button>
                      )}
                      <Link href={`/campaigns/${camp.id}`} className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>
                        <Eye size={12} />
                        Detalhes
                      </Link>
                      <button
                        onClick={() => handleDeleteCampaign(camp.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.375rem', color: '#ef4444' }}
                        title="Deletar Campanha"
                        disabled={camp.status === 'SENDING'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Seção de Métricas de Progresso */}
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Total Contatos</span>
                      <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem' }}>{camp.stats.total}</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#25d366' }}>Enviadas</span>
                      <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: '#25d366' }}>{camp.stats.sent}</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>Entregues</span>
                      <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: '#3b82f6' }}>{camp.stats.delivered}</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Lidas</span>
                      <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: '#10b981' }}>{camp.stats.read}</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Falhas</span>
                      <p style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.25rem', color: '#ef4444' }}>{camp.stats.failed}</p>
                    </div>
                  </div>

                  {/* Barra de Progresso */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                      <span>Progresso da Campanha</span>
                      <span>{camp.stats.sent} / {camp.stats.total} ({percent.toFixed(1)}%)</span>
                    </div>
                    <div className="progress-container" style={{ height: '10px' }}>
                      <div 
                        className={`progress-bar ${camp.status === 'SENDING' ? 'progress-bar-animated' : ''}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Nova Campanha (Upgraded with Real-time Preview and Custom Columns) */}
      {showAddCampaign && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '880px', width: '100%', animation: 'modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '1.15rem', fontWeight: 700 }}>🚀 Configurar Campanha de Disparos</h3>
              <X className="modal-close" onClick={() => setShowAddCampaign(false)} />
            </div>
            <form onSubmit={handleCreateCampaign}>
              {/* Modal Body: Two Column Grid */}
              <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', padding: '1.5rem' }}>
                
                {/* COLUNA 1: CONFIGURAÇÕES E FORMULÁRIO */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  {errorMsg && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.8125rem'
                    }}>
                      <AlertCircle size={16} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0' }}>Nome da Campanha</label>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="Ex: Campanha Grupo Promoções Domingo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0' }}>Destinatários</label>
                    <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', color: '#94a3b8' }}>
                        <input 
                          type="radio" 
                          name="targetType" 
                          value="GROUP" 
                          checked={targetType === 'GROUP'} 
                          onChange={() => {
                            setTargetType('GROUP');
                            setGroupId(groups[0]?.id || '');
                            setSegmentId('');
                          }}
                        />
                        Grupo Estático
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', color: '#94a3b8' }}>
                        <input 
                          type="radio" 
                          name="targetType" 
                          value="SEGMENT" 
                          checked={targetType === 'SEGMENT'} 
                          onChange={() => {
                            setTargetType('SEGMENT');
                            setSegmentId(segments[0]?.id || '');
                            setGroupId('');
                          }}
                        />
                        Segmentação Dinâmica
                      </label>
                    </div>

                    {targetType === 'GROUP' ? (
                      <select
                        className="input-control"
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        required
                      >
                        {groups.length === 0 ? (
                          <option value="">Crie um grupo de contatos primeiro!</option>
                        ) : (
                          groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name} ({g._count?.contacts || 0} contatos)</option>
                          ))
                        )}
                      </select>
                    ) : (
                      <select
                        className="input-control"
                        value={segmentId}
                        onChange={(e) => setSegmentId(e.target.value)}
                        required
                      >
                        {segments.length === 0 ? (
                          <option value="">Crie uma segmentação primeiro!</option>
                        ) : (
                          segments.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))
                        )}
                      </select>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0' }}>Template de Mensagem</label>
                    <select
                      className="input-control"
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      required
                    >
                      {templates.length === 0 ? (
                        <option value="">Crie um template primeiro!</option>
                      ) : (
                        templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Agendamento inteligente */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 10, padding: '0.75rem 1rem', marginTop: '0.2rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>
                      <input 
                        type="checkbox" 
                        checked={isScheduled} 
                        onChange={(e) => {
                          setIsScheduled(e.target.checked);
                          if (e.target.checked && !scheduledAt) {
                            // Define amanhã no mesmo horário como padrão
                            const d = new Date(); d.setDate(d.getDate() + 1);
                            setScheduledAt(d.toISOString().slice(0, 16));
                          }
                        }} 
                      />
                      📅 Agendar envio para depois
                    </label>

                    {isScheduled && (
                      <div style={{ marginTop: '0.65rem', animation: 'wa-fadeUp 0.15s ease' }}>
                        <input
                          type="datetime-local"
                          className="input-control"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          required
                          min={new Date().toISOString().slice(0, 16)}
                          style={{ fontSize: '0.78rem' }}
                        />
                        <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.3)', marginTop: 4, display: 'block' }}>
                          A campanha ficará na fila e começará a disparar automaticamente no horário definido.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Configurações de Delay Seguro Anti-Ban */}
                  <div className="form-group" style={{ marginTop: '0.2rem' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem' }}>⚙️ Presets de Velocidade Anti-Ban</label>
                    <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem' }}>
                      {[
                        { id: 'safe', label: '🐢 Seguro' },
                        { id: 'medium', label: '⚖️ Padrão' },
                        { id: 'fast', label: '⚡ Rápido' },
                        { id: 'custom', label: '⚙️ Manual' }
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setDelayPreset(preset.id as any);
                            if (preset.id === 'safe') { setDelayMin(30); setDelayMax(90); }
                            else if (preset.id === 'medium') { setDelayMin(15); setDelayMax(45); }
                            else if (preset.id === 'fast') { setDelayMin(5); setDelayMax(15); }
                          }}
                          className={`btn ${delayPreset === preset.id ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, padding: '0.35rem 0', fontSize: '0.68rem', fontWeight: 600 }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {delayPreset === 'custom' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', animation: 'wa-fadeUp 0.15s ease' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Mínimo (segundos)</label>
                          <input
                            type="number"
                            className="input-control"
                            min={5}
                            value={delayMin}
                            onChange={(e) => setDelayMin(parseInt(e.target.value || '5', 10))}
                            required
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Máximo (segundos)</label>
                          <input
                            type="number"
                            className="input-control"
                            min={6}
                            value={delayMax}
                            onChange={(e) => setDelayMax(parseInt(e.target.value || '10', 10))}
                            required
                          />
                        </div>
                      </div>
                    )}

                    <div style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.03)',
                      border: '1px solid rgba(245, 158, 11, 0.12)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.7rem',
                      color: 'rgba(255,255,255,0.48)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.4rem',
                      lineHeight: '1.35',
                      marginTop: '0.6rem'
                    }}>
                      <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
                      <span>
                        O delay determina a pausa aleatória entre mensagens. O preset <strong>Padrão</strong> ou <strong>Seguro</strong> é recomendado para evitar bloqueios.
                      </span>
                    </div>
                  </div>
                </div>

                {/* COLUNA 2: LIVE WHATSAPP PREVIEW */}
                <div style={{ display: 'flex', flexDirection: 'column', background: '#0b141a', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', height: '100%' }}>
                  
                  {/* Phone header */}
                  <div style={{ background: '#202c33', padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <Smartphone size={16} color="#25d366" />
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'white' }}>Live Preview do Cliente</div>
                      <div style={{ fontSize: '0.59rem', color: '#8696a0' }}>Simulação real de recepção</div>
                    </div>
                  </div>

                  {/* Phone Chat Container */}
                  <div style={{
                    flex: 1, padding: '1rem',
                    display: 'flex', flexDirection: 'column',
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px)',
                    backgroundSize: '16px 16px', backgroundColor: '#0b141a',
                    minHeight: '260px', overflowY: 'auto'
                  }}>
                    {templateId ? (
                      (() => {
                        const selTemplate = templates.find(t => t.id === templateId);
                        if (!selTemplate) return (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.22)', fontSize: '0.75rem' }}>
                            Erro ao carregar o template selecionado
                          </div>
                        );

                        // Substitui as variáveis por simulações reais
                        const mockBody = selTemplate.body
                          .replace(/{{nome}}/g, 'João Silva')
                          .replace(/{{link}}/g, 'https://grupo-promocao.com/ftech');

                        return (
                          <div style={{
                            alignSelf: 'flex-start',
                            maxWidth: '92%',
                            background: '#005c4b',
                            color: 'white',
                            padding: '0.55rem 0.8rem',
                            borderRadius: '0 8px 8px 8px',
                            fontSize: '0.8rem',
                            lineHeight: 1.45,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.03)',
                            wordBreak: 'break-word',
                            animation: 'wa-fadeUp 0.15s ease'
                          }}>
                            {selTemplate.imageUrl && (
                              <img
                                src={selTemplate.imageUrl}
                                alt="Mídia Anexada"
                                style={{ borderRadius: '6px', width: '100%', maxHeight: '170px', objectFit: 'cover', marginBottom: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}
                              />
                            )}
                            <div style={{ whiteSpace: 'pre-wrap' }}>
                              {mockBody}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.56rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                              <span>12:35</span>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>
                        Selecione um template de mensagem para ver a simulação.
                      </div>
                    )}
                  </div>

                  {/* Estimates and calculation bottom section */}
                  {contactsCount > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.04)', padding: '0.65rem 1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>
                        <span>Total de Contatos:</span>
                        <span style={{ fontWeight: 700, color: 'white' }}>{contactsCount}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>
                        <span>Tempo Total Estimado:</span>
                        <span style={{ fontWeight: 700, color: '#10b981' }}>
                          {formatDuration(contactsCount * delayMin)} ~ {formatDuration(contactsCount * delayMax)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowAddCampaign(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={
                    isSubmitting || 
                    (targetType === 'GROUP' && groups.length === 0) || 
                    (targetType === 'SEGMENT' && segments.length === 0) || 
                    templates.length === 0
                  }
                >
                  {isSubmitting ? 'Agendando...' : 'Criar Campanha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes wa-fadeUp {
          from { transform: translateY(6px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </AppLayout>
  );
}

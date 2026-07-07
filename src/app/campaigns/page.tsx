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
  CheckCircle2, 
  AlertTriangle,
  AlertCircle,
  Clock,
  Eye
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
}

interface Group {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
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
    setErrorMsg('');
    setShowAddCampaign(true);
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!name || !groupId || !templateId) {
      setErrorMsg('Todos os campos marcados são obrigatórios');
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
          delayMax
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="badge badge-info">Rascunho</span>;
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
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#9ca3af' }}>
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
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {getStatusBadge(camp.status)}
                    
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

      {/* Modal: Nova Campanha */}
      {showAddCampaign && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Nova Campanha de Disparos</h3>
              <X className="modal-close" onClick={() => setShowAddCampaign(false)} />
            </div>
            <form onSubmit={handleCreateCampaign}>
              <div className="modal-body">
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
                    marginBottom: '1rem',
                    fontSize: '0.8125rem'
                  }}>
                    <AlertCircle size={16} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Nome da Campanha</label>
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
                  <label className="form-label">Destinatários</label>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', cursor: 'pointer' }}>
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', cursor: 'pointer' }}>
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
                          <option key={g.id} value={g.id}>{g.name}</option>
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
                  <label className="form-label">Template de Mensagem</label>
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

                {/* Configurações de Delay Seguro */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Delay Mínimo (segundos)</label>
                    <input
                      type="number"
                      className="input-control"
                      min={5}
                      value={delayMin}
                      onChange={(e) => setDelayMin(parseInt(e.target.value || '5', 10))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Delay Máximo (segundos)</label>
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

                <div style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.04)',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  fontSize: '0.75rem',
                  color: '#9ca3af',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  lineHeight: '1.4',
                  marginTop: '0.5rem'
                }}>
                  <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    <strong>Dica Anti-Ban:</strong> O delay padrão de 15s a 45s é altamente recomendado para evitar bloqueios automáticos do WhatsApp. Evite diminuir muito esses valores.
                  </span>
                </div>
              </div>
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
                  {isSubmitting ? 'Salvando...' : 'Criar Campanha'}
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
      `}</style>
    </AppLayout>
  );
}

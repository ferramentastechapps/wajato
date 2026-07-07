'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  X, 
  Filter, 
  Folder, 
  Tag, 
  Activity,
  AlertCircle
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: {
    groupId?: string | null;
    tags?: string[];
    excludedTags?: string[];
    engagement?: 'ALL' | 'READ' | 'DELIVERED' | 'UNENGAGED';
  };
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddSegment, setShowAddSegment] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [excludedTagsInput, setExcludedTagsInput] = useState('');
  const [engagement, setEngagement] = useState<'ALL' | 'READ' | 'DELIVERED' | 'UNENGAGED'>('ALL');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchSegmentsAndGroups = async () => {
    setLoading(true);
    try {
      const segRes = await fetch('/api/contacts/segments');
      if (segRes.ok) {
        const segData = await segRes.json();
        setSegments(segData.segments || []);
      }

      const groupsRes = await fetch('/api/contacts');
      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        setGroups(groupsData.groups || []);
      }
    } catch (err) {
      console.error('Erro ao buscar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSegmentsAndGroups();
  }, []);

  const handleOpenModal = () => {
    setName('');
    setDescription('');
    setGroupId('');
    setTagsInput('');
    setExcludedTagsInput('');
    setEngagement('ALL');
    setErrorMsg('');
    setShowAddSegment(true);
  };

  const handleCreateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('O nome do segmento é obrigatório');
      return;
    }

    const tags = tagsInput
      ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const excludedTags = excludedTagsInput
      ? excludedTagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contacts/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          filters: {
            groupId: groupId || null,
            tags,
            excludedTags,
            engagement,
          },
        }),
      });

      if (response.ok) {
        setShowAddSegment(false);
        fetchSegmentsAndGroups();
      } else {
        const data = await response.json();
        setErrorMsg(data.message || 'Erro ao criar segmento.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro de conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSegment = async (id: string) => {
    if (!confirm('Deseja realmente excluir este segmento?')) return;

    try {
      const response = await fetch(`/api/contacts/segments?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchSegmentsAndGroups();
      } else {
        const data = await response.json();
        alert(data.message || 'Erro ao excluir segmento.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão.');
    }
  };

  const getEngagementLabel = (lvl: string) => {
    switch (lvl) {
      case 'READ': return 'Mensagem lida';
      case 'DELIVERED': return 'Mensagem entregue ou lida';
      case 'UNENGAGED': return 'Não engajado (sem leituras/entregas)';
      default: return 'Qualquer histórico';
    }
  };

  return (
    <AppLayout title="Segmentações Dinâmicas">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>
          Crie filtros avançados e dinâmicos para campanhas segmentadas (tags inclusas/exclusas e engajamento).
        </p>
        <button onClick={handleOpenModal} className="btn btn-primary">
          <Plus size={16} />
          Nova Segmentação
        </button>
      </div>

      {loading ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando segmentações...</span>
        </div>
      ) : segments.length === 0 ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>
          <Filter size={48} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
          <p>Nenhuma segmentação dinâmica criada.</p>
          <button onClick={handleOpenModal} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Criar Primeira Segmentação
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {segments.map((seg) => {
            const f = typeof seg.filters === 'string' ? JSON.parse(seg.filters) : seg.filters;
            
            return (
              <div key={seg.id} className="card-glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>{seg.name}</h3>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', minHeight: '36px', margin: '0 0 1rem 0' }}>
                    {seg.description || <span style={{ fontStyle: 'italic', color: '#4b5563' }}>Sem descrição</span>}
                  </p>
                  
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d1d5db' }}>
                      <Folder size={14} style={{ color: 'var(--primary)' }} />
                      <span>Grupo: {f.groupId ? groups.find(g => g.id === f.groupId)?.name || 'Carregando...' : 'Qualquer Grupo'}</span>
                    </div>

                    {f.tags && f.tags.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#d1d5db' }}>
                        <Tag size={14} style={{ color: '#10b981', marginTop: '2px' }} />
                        <div>
                          <span>Tags inclusas:</span>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                            {f.tags.map((t: string) => (
                              <span key={t} style={{ fontSize: '0.7rem', padding: '0.05rem 0.35rem', backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: '4px' }}>{t}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {f.excludedTags && f.excludedTags.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#d1d5db' }}>
                        <Tag size={14} style={{ color: '#ef4444', marginTop: '2px' }} />
                        <div>
                          <span>Blacklist (excluir):</span>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                            {f.excludedTags.map((t: string) => (
                              <span key={t} style={{ fontSize: '0.7rem', padding: '0.05rem 0.35rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '4px' }}>{t}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d1d5db' }}>
                      <Activity size={14} style={{ color: '#3b82f6' }} />
                      <span>Engajamento: {getEngagementLabel(f.engagement)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <button onClick={() => handleDeleteSegment(seg.id)} className="btn" style={{ padding: '0.35rem 0.75rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Trash2 size={14} />
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Nova Segmentação */}
      {showAddSegment && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Nova Segmentação Dinâmica</h3>
              <X className="modal-close" onClick={() => setShowAddSegment(false)} />
            </div>
            <form onSubmit={handleCreateSegment}>
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
                  <label className="form-label">Nome da Segmentação</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ex: Leads VIPs Recentes"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ex: Clientes premium que leram mensagens recentemente"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Grupo de Contatos Base (Opcional)</label>
                  <select
                    className="input-control"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                  >
                    <option value="">Qualquer Grupo</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Tags Inclusas (separadas por vírgula)</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ex: vip, comprou_recentemente"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Blacklist / Tags Excluídas (separadas por vírgula)</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ex: blacklist, nao_perturbe"
                    value={excludedTagsInput}
                    onChange={(e) => setExcludedTagsInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Nível de Engajamento</label>
                  <select
                    className="input-control"
                    value={engagement}
                    onChange={(e) => setEngagement(e.target.value as any)}
                  >
                    <option value="ALL">Qualquer Histórico</option>
                    <option value="READ">Apenas contatos que já Leram mensagens</option>
                    <option value="DELIVERED">Apenas contatos que Receberam/Leram mensagens</option>
                    <option value="UNENGAGED">Apenas contatos Não Engajados (sem leituras/entregas)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowAddSegment(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : 'Criar Segmento'}
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
      `}</style>
    </AppLayout>
  );
}

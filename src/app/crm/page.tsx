'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Columns, 
  Plus, 
  Trash2, 
  Tag, 
  Settings, 
  X,
  Phone,
  User,
  Search,
  DollarSign,
  MessageSquare,
  ExternalLink,
  Filter,
  CheckCircle2,
  TrendingUp,
  Inbox,
  StickyNote,
  Award,
  Sparkles,
  Edit3,
  Save,
  ChevronDown
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  tags: string[];
  value?: number | null;
  notes?: string | null;
  optOut?: boolean;
  createdAt?: string;
  updatedAt?: string;
  group?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  contacts: Contact[];
}

interface PipelineMetrics {
  totalLeads: number;
  totalPipelineValue: number;
  totalWonValue: number;
  wonCount: number;
  unassignedCount: number;
}

// ── Helpers de Formatação ───────────────────────────────────────────────────

function formatCurrency(val: number = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    // 55 16 98209 9178
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
}

const AVATAR_PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#06b6d4', '#14b8a6',
];

function getAvatarBg(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export default function CrmPage() {
  const router = useRouter();

  const [stages, setStages] = useState<Stage[]>([]);
  const [unassigned, setUnassigned] = useState<Contact[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetrics>({
    totalLeads: 0,
    totalPipelineValue: 0,
    totalWonValue: 0,
    wonCount: 0,
    unassignedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  // ── Filtros e Busca ─────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('');

  // ── Drag and Drop ───────────────────────────────────────────────────────────
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // ── Modais & Drawers ────────────────────────────────────────────────────────
  const [showConfig, setShowConfig] = useState(false);
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [newLeadStageId, setNewLeadStageId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Contact | null>(null);
  const [selectedLeadStageId, setSelectedLeadStageId] = useState<string | null>(null);
  const [isSavingLead, setIsSavingLead] = useState(false);

  // ── Formulários ─────────────────────────────────────────────────────────────
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#3b82f6');
  const [newStageOrder, setNewStageOrder] = useState(0);
  const [isSubmittingStage, setIsSubmittingStage] = useState(false);

  // Formulário de Novo Lead
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadValue, setNewLeadValue] = useState<number | ''>('');
  const [newLeadTags, setNewLeadTags] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');

  // Formulário do Drawer de Lead
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editValue, setEditValue] = useState<number | ''>('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // ── Carregar Dados do CRM ───────────────────────────────────────────────────
  const fetchCrmData = async () => {
    try {
      const response = await fetch('/api/crm/stages');
      if (response.ok) {
        const data = await response.json();
        setStages(data.stages || []);
        setUnassigned(data.unassignedContacts || []);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar dados do CRM:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrmData();
  }, []);

  // ── Lista de Todas as Tags Existentes ───────────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set<string>();
    stages.forEach(st => st.contacts.forEach(c => c.tags.forEach(t => set.add(t))));
    unassigned.forEach(c => c.tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [stages, unassigned]);

  // ── Filtro de Contatos ──────────────────────────────────────────────────────
  const filterContact = (c: Contact) => {
    if (selectedTagFilter && !c.tags.includes(selectedTagFilter)) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const phoneMatch = c.phone.includes(q);
    const tagsMatch = c.tags.some(t => t.toLowerCase().includes(q));
    const notesMatch = (c.notes || '').toLowerCase().includes(q);
    return nameMatch || phoneMatch || tagsMatch || notesMatch;
  };

  // ── Drag and Drop Handlers ──────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, contactId: string) => {
    setDraggedContactId(contactId);
    e.dataTransfer.setData('text/plain', contactId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string | null) => {
    e.preventDefault();
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStageId: string | null) => {
    e.preventDefault();
    setDragOverStageId(null);
    const contactId = e.dataTransfer.getData('text/plain') || draggedContactId;
    if (!contactId) return;

    // Localizar o contato em trânsito
    let movedContact: Contact | undefined;

    const updatedStages = stages.map(stage => {
      const found = stage.contacts.find(c => c.id === contactId);
      if (found) {
        movedContact = found;
        return {
          ...stage,
          contacts: stage.contacts.filter(c => c.id !== contactId),
        };
      }
      return stage;
    });

    let updatedUnassigned = unassigned;
    if (!movedContact) {
      movedContact = unassigned.find(c => c.id === contactId);
      if (movedContact) {
        updatedUnassigned = unassigned.filter(c => c.id !== contactId);
      }
    }

    if (!movedContact) return;

    // Inserir no destino
    if (targetStageId === null) {
      updatedUnassigned = [movedContact, ...updatedUnassigned];
    } else {
      updatedStages.forEach(stage => {
        if (stage.id === targetStageId) {
          stage.contacts = [movedContact!, ...stage.contacts];
        }
      });
    }

    // Atualização otimista imediata
    setStages(updatedStages);
    setUnassigned(updatedUnassigned);
    setDraggedContactId(null);

    // Salvar no backend
    try {
      await fetch('/api/crm/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MOVE',
          contactId,
          stageId: targetStageId,
        }),
      });
      // Recalcular métricas
      fetchCrmData();
    } catch (err) {
      console.error('Erro ao salvar movimentação:', err);
      fetchCrmData();
    }
  };

  // ── Abrir Drawer de Detalhes do Lead ────────────────────────────────────────
  const openLeadDrawer = (contact: Contact, stageId: string | null) => {
    setSelectedLead(contact);
    setSelectedLeadStageId(stageId);
    setEditName(contact.name || '');
    setEditPhone(contact.phone);
    setEditValue(contact.value ?? '');
    setEditTags(contact.tags || []);
    setEditNotes(contact.notes || '');
  };

  const closeLeadDrawer = () => {
    setSelectedLead(null);
    setSelectedLeadStageId(null);
  };

  // ── Salvar Alterações do Lead ───────────────────────────────────────────────
  const handleSaveLeadDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    setIsSavingLead(true);
    try {
      const response = await fetch('/api/crm/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_CONTACT',
          contactId: selectedLead.id,
          name: editName,
          phone: editPhone,
          value: editValue === '' ? 0 : Number(editValue),
          tags: editTags,
          notes: editNotes,
          stageId: selectedLeadStageId,
        }),
      });

      if (response.ok) {
        closeLeadDrawer();
        fetchCrmData();
      } else {
        const data = await response.json();
        alert(data.message || 'Erro ao atualizar lead.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao salvar lead.');
    } finally {
      setIsSavingLead(false);
    }
  };

  // ── Adicionar Lead Rápido ───────────────────────────────────────────────────
  const handleQuickAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadPhone.trim()) return;

    try {
      const tagsArray = newLeadTags
        ? newLeadTags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const response = await fetch('/api/crm/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'QUICK_ADD_LEAD',
          name: newLeadName.trim() || null,
          phone: newLeadPhone.trim(),
          value: newLeadValue === '' ? 0 : Number(newLeadValue),
          tags: tagsArray,
          notes: newLeadNotes.trim() || null,
          stageId: newLeadStageId,
        }),
      });

      if (response.ok) {
        setShowNewLeadModal(false);
        setNewLeadName('');
        setNewLeadPhone('');
        setNewLeadValue('');
        setNewLeadTags('');
        setNewLeadNotes('');
        fetchCrmData();
      } else {
        const data = await response.json();
        alert(data.message || 'Erro ao criar lead.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao criar lead.');
    }
  };

  // ── Navegar para o Chat do Contato ──────────────────────────────────────────
  const handleOpenChat = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    router.push(`/chat?phone=${clean}`);
  };

  // ── Adicionar / Deletar Estágio ─────────────────────────────────────────────
  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim()) return;

    setIsSubmittingStage(true);
    try {
      const response = await fetch('/api/crm/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStageName.trim(),
          color: newStageColor,
          order: newStageOrder,
        }),
      });

      if (response.ok) {
        setNewStageName('');
        setNewStageColor('#3b82f6');
        setNewStageOrder(0);
        fetchCrmData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingStage(false);
    }
  };

  const handleDeleteStage = async (id: string) => {
    if (!confirm('Excluir este estágio? Os contatos contidos nele voltarão para "Inbox / Sem Estágio".')) return;

    try {
      const response = await fetch(`/api/crm/stages?id=${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchCrmData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Tag Pills Helper ────────────────────────────────────────────────────────
  const handleAddTagInDrawer = () => {
    const val = newTagInput.trim();
    if (val && !editTags.includes(val)) {
      setEditTags([...editTags, val]);
      setNewTagInput('');
    }
  };

  const handleRemoveTagInDrawer = (tagToRemove: string) => {
    setEditTags(editTags.filter(t => t !== tagToRemove));
  };

  if (loading) {
    return (
      <AppLayout title="CRM Pipeline & Kanban">
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando Pipeline de Vendas...</span>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="CRM Pipeline & Kanban">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .kanban-card {
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .kanban-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.3) !important;
          border-color: rgba(255,255,255,0.12) !important;
        }
        .kanban-col {
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════
          1. HEADER DE KPIS DO PIPELINE (MÉTRICAS PROFISSIONAIS)
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
        animation: 'fadeIn 0.25s ease'
      }}>
        {/* Total Leads no Funil */}
        <div className="card-glass" style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(59,130,246,0.2)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(59,130,246,0.15)',
            color: '#60a5fa',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Leads no Funil
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white' }}>
              {metrics.totalLeads}
            </div>
          </div>
        </div>

        {/* Valor Total do Pipeline */}
        <div className="card-glass" style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          background: 'linear-gradient(135deg, rgba(37,211,102,0.08) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(37,211,102,0.2)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(37,211,102,0.15)',
            color: '#25d366',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <DollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pipeline Total
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#25d366' }}>
              {formatCurrency(metrics.totalPipelineValue)}
            </div>
          </div>
        </div>

        {/* Negócios Ganhos / Fechados */}
        <div className="card-glass" style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(245,158,11,0.15)',
            color: '#fbbf24',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Award size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Fechados / Ganhos ({metrics.wonCount})
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24' }}>
              {formatCurrency(metrics.totalWonValue)}
            </div>
          </div>
        </div>

        {/* Inbox / Sem Estágio */}
        <div className="card-glass" style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(168,85,247,0.2)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(168,85,247,0.15)',
            color: '#c084fc',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Inbox size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Novos Sem Estágio
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white' }}>
              {metrics.unassignedCount}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          2. BARRA DE FERRAMENTAS: BUSCA, FILTROS & AÇÕES RÁPIDAS
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.85rem',
        marginBottom: '1.25rem',
        padding: '0.75rem 1rem',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Campo de Busca & Filtros */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
          {/* Input de Busca */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Buscar por nome, telefone, tag ou anotação..."
              className="input-control"
              style={{ paddingLeft: '2.3rem', width: '100%', fontSize: '0.84rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <X 
                size={14} 
                onClick={() => setSearchTerm('')} 
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#9ca3af' }} 
              />
            )}
          </div>

          {/* Filtro por Tag */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Filter size={15} color="#9ca3af" />
              <select
                className="input-control"
                style={{ width: 'auto', fontSize: '0.84rem', padding: '0.4rem 0.8rem' }}
                value={selectedTagFilter}
                onChange={(e) => setSelectedTagFilter(e.target.value)}
              >
                <option value="">Todas as Tags ({allTags.length})</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>🏷️ {t}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setNewLeadStageId(stages[0]?.id || null);
              setShowNewLeadModal(true);
            }}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', padding: '0.45rem 0.9rem' }}
          >
            <Plus size={16} />
            Novo Lead
          </button>

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', padding: '0.45rem 0.9rem' }}
          >
            <Settings size={15} />
            Estágios do Funil
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          3. PAINEL DE CONFIGURAÇÃO DE ESTÁGIOS DO FUNIL
      ══════════════════════════════════════════════════════════════════════ */}
      {showConfig && (
        <div className="card-glass" style={{ padding: '1.5rem', marginBottom: '1.5rem', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Columns size={18} color="var(--primary)" />
              Configuração das Colunas do Funil Comercial
            </h3>
            <X size={18} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => setShowConfig(false)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {/* Adicionar Estágio */}
            <form onSubmit={handleAddStage} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px solid var(--border)', paddingRight: '1.5rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', margin: 0 }}>Criar Nova Etapa</h4>
              <input 
                type="text" 
                placeholder="Ex: Proposta Enviada" 
                className="input-control" 
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                required
              />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={newStageColor} 
                  onChange={(e) => setNewStageColor(e.target.value)} 
                  style={{ width: '42px', height: '38px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'transparent' }}
                  title="Cor do Estágio"
                />
                <input 
                  type="number" 
                  placeholder="Ordem" 
                  className="input-control" 
                  style={{ width: '80px' }}
                  value={newStageOrder}
                  onChange={(e) => setNewStageOrder(parseInt(e.target.value || '0', 10))}
                  required
                />
                <button type="submit" disabled={isSubmittingStage} className="btn btn-primary" style={{ flex: 1 }}>
                  Adicionar Coluna
                </button>
              </div>
            </form>

            {/* Listagem de Estágios */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }} className="custom-scrollbar">
              <h4 style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Etapas Atuais ({stages.length})</h4>
              {stages.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.8rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}60` }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{s.name}</span>
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', padding: '0.1rem 0.4rem', background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}>
                      {s.contacts.length} leads
                    </span>
                  </div>
                  <button type="button" onClick={() => handleDeleteStage(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }} title="Excluir estágio">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          4. BOARD KANBAN COM FEEDBACK DE DRAG AND DROP E VALORES
      ══════════════════════════════════════════════════════════════════════ */}
      <div 
        className="custom-scrollbar"
        style={{
          display: 'flex',
          gap: '1.25rem',
          overflowX: 'auto',
          paddingBottom: '1.5rem',
          alignItems: 'flex-start',
          minHeight: '68vh',
        }}
      >
        {/* Coluna 1: Sem Estágio (Inbox / Entrada de Novos Leads) */}
        {(() => {
          const filteredUnassigned = unassigned.filter(filterContact);
          const isOverThis = dragOverStageId === 'unassigned';
          return (
            <div 
              onDragOver={(e) => handleDragOver(e, 'unassigned')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, null)}
              className="kanban-col custom-scrollbar"
              style={{
                flexShrink: 0,
                width: '300px',
                backgroundColor: isOverThis ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.015)',
                border: isOverThis ? '2px dashed #9ca3af' : '1px dashed rgba(255,255,255,0.12)',
                borderRadius: '14px',
                padding: '1rem',
                maxHeight: '75vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isOverThis ? '0 0 15px rgba(255,255,255,0.08)' : 'none',
              }}
            >
              {/* Header da Coluna */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Inbox size={16} color="#9ca3af" />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e2e8f0' }}>Sem Estágio</span>
                </div>
                <span style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.5rem',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  color: '#9ca3af',
                  fontWeight: 600
                }}>
                  {filteredUnassigned.length}
                </span>
              </div>

              {/* Lista de Cards */}
              <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, minHeight: '120px' }}>
                {filteredUnassigned.map((contact) => renderCard(contact, null, '#6b7280'))}
                {filteredUnassigned.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '0.76rem', padding: '2.5rem 0.5rem', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                    {unassigned.length > 0 ? 'Nenhum lead com o filtro atual.' : 'Arraste um contato aqui para retirá-lo do funil.'}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Colunas do Funil Configurado */}
        {stages.map((stage) => {
          const filteredContacts = stage.contacts.filter(filterContact);
          const colValueSum = filteredContacts.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
          const isOverThis = dragOverStageId === stage.id;

          return (
            <div 
              key={stage.id}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
              className="kanban-col custom-scrollbar"
              style={{
                flexShrink: 0,
                width: '310px',
                backgroundColor: isOverThis ? `${stage.color}10` : 'rgba(255,255,255,0.02)',
                border: isOverThis ? `2px solid ${stage.color}` : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                padding: '1rem',
                maxHeight: '75vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isOverThis ? `0 0 20px ${stage.color}25` : 'none',
              }}
            >
              {/* Header da Coluna */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: stage.color, boxShadow: `0 0 8px ${stage.color}80` }} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'white', display: 'block' }}>
                      {stage.name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: stage.color, fontWeight: 600 }}>
                      {formatCurrency(colValueSum)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '0.15rem 0.5rem',
                    backgroundColor: `${stage.color}20`,
                    borderRadius: '12px',
                    color: stage.color,
                    fontWeight: 700
                  }}>
                    {filteredContacts.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewLeadStageId(stage.id);
                      setShowNewLeadModal(true);
                    }}
                    title={`Adicionar lead em ${stage.name}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 2,
                      borderRadius: 4
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Lista de Cards da Etapa */}
              <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, minHeight: '120px' }}>
                {filteredContacts.map((contact) => renderCard(contact, stage.id, stage.color))}
                {filteredContacts.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    color: '#4b5563',
                    fontSize: '0.76rem',
                    padding: '3rem 1rem',
                    border: '1px dashed rgba(255,255,255,0.04)',
                    borderRadius: '10px'
                  }}>
                    Arraste contatos para esta etapa.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          5. DRAWER SLIDE-OVER: DETALHES DO LEAD (EDIÇÃO & AÇÕES)
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedLead && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          zIndex: 999,
          display: 'flex',
          justifyContent: 'flex-end',
          backdropFilter: 'blur(3px)',
        }}
        onClick={closeLeadDrawer}
        >
          <div 
            style={{
              width: '420px',
              maxWidth: '90vw',
              height: '100%',
              backgroundColor: '#111b21',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Drawer */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.015)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  backgroundColor: getAvatarBg(selectedLead.name || selectedLead.phone),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, color: 'white', fontSize: '1rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}>
                  {getInitials(selectedLead.name)}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'white', margin: 0 }}>
                    {selectedLead.name || 'Lead Sem Nome'}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                    {formatPhone(selectedLead.phone)}
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                onClick={closeLeadDrawer}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Ação Primária: Conversar no WhatsApp */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <button
                type="button"
                onClick={() => handleOpenChat(selectedLead.phone)}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  borderRadius: 10,
                  backgroundColor: '#25d366',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 12px rgba(37,211,102,0.3)',
                  transition: 'opacity 0.15s ease'
                }}
              >
                <MessageSquare size={18} />
                Conversar no WhatsApp
              </button>
            </div>

            {/* Formulário de Edição */}
            <form onSubmit={handleSaveLeadDetails} className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Estágio do Funil */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>
                  Etapa no Funil Comercial
                </label>
                <select
                  className="input-control"
                  style={{ width: '100%', padding: '0.6rem' }}
                  value={selectedLeadStageId || ''}
                  onChange={(e) => setSelectedLeadStageId(e.target.value || null)}
                >
                  <option value="">📥 Sem Estágio (Inbox)</option>
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      ● {st.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Valor da Oportunidade */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>
                  Valor da Negociação (R$)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#25d366', fontWeight: 700, fontSize: '0.88rem' }}>
                    R$
                  </span>
                  <input
                    type="number"
                    step="any"
                    placeholder="0,00"
                    className="input-control"
                    style={{ paddingLeft: '2.5rem', width: '100%' }}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  />
                </div>
              </div>

              {/* Nome do Contato */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>
                  Nome Completo
                </label>
                <input
                  type="text"
                  className="input-control"
                  style={{ width: '100%' }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do cliente ou empresa"
                />
              </div>

              {/* Telefone */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  className="input-control"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Ex: 5516982099178"
                  required
                />
              </div>

              {/* Tags */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>
                  Tags / Etiquetas
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {editTags.map((t) => (
                    <span 
                      key={t}
                      style={{
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.5rem',
                        backgroundColor: 'rgba(59,130,246,0.12)',
                        border: '1px solid rgba(59,130,246,0.25)',
                        borderRadius: '6px',
                        color: '#60a5fa',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      {t}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleRemoveTagInDrawer(t)} />
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder="Adicionar tag..."
                    className="input-control"
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTagInDrawer();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTagInDrawer}
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}
                  >
                    + Tag
                  </button>
                </div>
              </div>

              {/* Anotações Internas da Equipe */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>
                  <StickyNote size={14} color="#f59e0b" />
                  Anotações Internas (Equipe)
                </label>
                <textarea
                  className="input-control"
                  style={{ width: '100%', minHeight: '110px', fontSize: '0.84rem', lineHeight: '1.4' }}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Registre pontos da negociação, preferências do cliente, propostas enviadas ou combinados..."
                />
              </div>

              {/* Botões do Rodapé do Drawer */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  type="submit"
                  disabled={isSavingLead}
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  <Save size={16} />
                  {isSavingLead ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                <button
                  type="button"
                  onClick={closeLeadDrawer}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          6. MODAL: NOVO LEAD RÁPIDO
      ══════════════════════════════════════════════════════════════════════ */}
      {showNewLeadModal && (
        <div style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0, left: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(3px)',
          padding: '1rem'
        }}
        onClick={() => setShowNewLeadModal(false)}
        >
          <div 
            className="card-glass" 
            style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', animation: 'fadeIn 0.2s ease' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={18} color="#25d366" />
                Cadastrar Nova Oportunidade
              </h3>
              <X size={18} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => setShowNewLeadModal(false)} />
            </div>

            <form onSubmit={handleQuickAddLead} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
                  Etapa de Entrada no Funil
                </label>
                <select
                  className="input-control"
                  style={{ width: '100%' }}
                  value={newLeadStageId || ''}
                  onChange={(e) => setNewLeadStageId(e.target.value || null)}
                >
                  <option value="">📥 Sem Estágio (Inbox)</option>
                  {stages.map((st) => (
                    <option key={st.id} value={st.id}>
                      ● {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
                  Telefone / WhatsApp *
                </label>
                <input
                  type="text"
                  placeholder="Ex: 5516982099178"
                  className="input-control"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
                  Nome do Lead
                </label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva"
                  className="input-control"
                  style={{ width: '100%' }}
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
                  Valor da Oportunidade (R$)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Ex: 1500"
                  className="input-control"
                  style={{ width: '100%' }}
                  value={newLeadValue}
                  onChange={(e) => setNewLeadValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
                  Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="ex: quente, decisor, campanha-agosto"
                  className="input-control"
                  style={{ width: '100%' }}
                  value={newLeadTags}
                  onChange={(e) => setNewLeadTags(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
                  Anotação Inicial
                </label>
                <textarea
                  placeholder="Observações sobre a demanda ou interesse do cliente..."
                  className="input-control"
                  style={{ width: '100%', minHeight: '65px' }}
                  value={newLeadNotes}
                  onChange={(e) => setNewLeadNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Cadastrar no Funil
                </button>
                <button type="button" onClick={() => setShowNewLeadModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AppLayout>
  );

  // ── Render Card Function ───────────────────────────────────────────────────
  function renderCard(contact: Contact, stageId: string | null, stageColor: string) {
    const hasValue = (Number(contact.value) || 0) > 0;
    const hasNotes = !!(contact.notes && contact.notes.trim());

    return (
      <div 
        key={contact.id}
        draggable
        onDragStart={(e) => handleDragStart(e, contact.id)}
        onClick={() => openLeadDrawer(contact, stageId)}
        className="card-glass kanban-card"
        style={{
          padding: '0.85rem 0.95rem',
          cursor: 'grab',
          borderLeft: `3px solid ${stageColor}`,
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          backgroundColor: 'rgba(255,255,255,0.025)',
          borderRadius: '10px',
          position: 'relative',
        }}
      >
        {/* Topo do Card: Avatar + Nome + Botão WhatsApp */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              backgroundColor: getAvatarBg(contact.name || contact.phone),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: 'white', fontSize: '0.72rem', flexShrink: 0
            }}>
              {getInitials(contact.name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontWeight: 600,
                fontSize: '0.86rem',
                color: '#f1f5f9',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {contact.name || 'Contato'}
              </div>
              <div style={{
                color: '#9ca3af',
                fontSize: '0.74rem',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {formatPhone(contact.phone)}
              </div>
            </div>
          </div>

          {/* Botão de Atalho para o Chat no WhatsApp */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenChat(contact.phone);
            }}
            title="Abrir Conversa no WhatsApp"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              backgroundColor: 'rgba(37,211,102,0.12)',
              border: '1px solid rgba(37,211,102,0.3)',
              color: '#25d366',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: '0.35rem',
              transition: 'background-color 0.15s'
            }}
          >
            <MessageSquare size={13} />
          </button>
        </div>

        {/* Valor da Oportunidade */}
        {hasValue && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.15rem 0.45rem',
            backgroundColor: 'rgba(37,211,102,0.1)',
            border: '1px solid rgba(37,211,102,0.2)',
            borderRadius: '6px',
            color: '#25d366',
            fontSize: '0.75rem',
            fontWeight: 700,
            marginBottom: '0.45rem'
          }}>
            💰 {formatCurrency(Number(contact.value))}
          </div>
        )}

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: hasNotes ? '0.35rem' : '0' }}>
            {contact.tags.slice(0, 3).map((t, idx) => (
              <span 
                key={idx} 
                style={{
                  fontSize: '0.64rem',
                  padding: '0.08rem 0.35rem',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px',
                  color: '#cbd5e1'
                }}
              >
                {t}
              </span>
            ))}
            {contact.tags.length > 3 && (
              <span style={{ fontSize: '0.62rem', color: '#9ca3af', alignSelf: 'center' }}>
                +{contact.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Indicador de Anotações Internas */}
        {hasNotes && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.7rem',
            color: '#f59e0b',
            background: 'rgba(245,158,11,0.06)',
            padding: '0.2rem 0.45rem',
            borderRadius: '4px',
            marginTop: '0.25rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            <StickyNote size={11} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contact.notes}
            </span>
          </div>
        )}
      </div>
    );
  }
}

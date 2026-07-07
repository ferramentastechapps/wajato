'use client';

import React, { useState, useEffect } from 'react';
import { 
  Columns, 
  Plus, 
  Trash2, 
  UserPlus, 
  Tag, 
  Settings, 
  X,
  Phone,
  User,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  tags: string[];
}

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  contacts: Contact[];
}

export default function CrmPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [unassigned, setUnassigned] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals & configuration
  const [showConfig, setShowConfig] = useState(false);
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);
  
  // Forms
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#3b82f6');
  const [newStageOrder, setNewStageOrder] = useState(0);

  const fetchCrmData = async () => {
    try {
      const response = await fetch('/api/crm/stages');
      if (response.ok) {
        const data = await response.json();
        setStages(data.stages || []);
        setUnassigned(data.unassignedContacts || []);
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

  const handleDragStart = (e: React.DragEvent, contactId: string) => {
    setDraggedContactId(contactId);
    e.dataTransfer.setData('text/plain', contactId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStageId: string | null) => {
    e.preventDefault();
    const contactId = e.dataTransfer.getData('text/plain') || draggedContactId;
    if (!contactId) return;

    // Lógica optimista para resposta imediata na UI
    let movedContact: Contact | undefined;

    // Remover do local de origem
    const updatedStages = stages.map((stage) => {
      const found = stage.contacts.find((c) => c.id === contactId);
      if (found) {
        movedContact = found;
        return {
          ...stage,
          contacts: stage.contacts.filter((c) => c.id !== contactId),
        };
      }
      return stage;
    });

    let updatedUnassigned = unassigned;
    if (!movedContact) {
      movedContact = unassigned.find((c) => c.id === contactId);
      if (movedContact) {
        updatedUnassigned = unassigned.filter((c) => c.id !== contactId);
      }
    }

    if (!movedContact) return;

    // Adicionar no local de destino
    if (targetStageId === null) {
      updatedUnassigned = [movedContact, ...updatedUnassigned];
    } else {
      updatedStages.forEach((stage) => {
        if (stage.id === targetStageId) {
          stage.contacts = [movedContact!, ...stage.contacts];
        }
      });
    }

    // Atualiza estado local
    setStages(updatedStages);
    setUnassigned(updatedUnassigned);
    setDraggedContactId(null);

    // Salva no banco via API
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
    } catch (err) {
      console.error('Erro ao salvar movimentação:', err);
      fetchCrmData(); // Restaura dados reais do banco em caso de falha
    }
  };

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/crm/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStageName,
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
      setIsSubmitting(false);
    }
  };

  const handleDeleteStage = async (id: string) => {
    if (!confirm('Excluir este estágio? Os contatos contidos nele voltarão para "Sem Estágio".')) return;

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

  if (loading) {
    return (
      <AppLayout title="Funil de Vendas CRM">
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando funil CRM...</span>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="CRM Kanban">
      
      {/* Menu Superior / Ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>
          Gerencie leads e arraste contatos entre etapas do funil comercial.
        </p>
        <button onClick={() => setShowConfig(!showConfig)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Settings size={16} />
          Estágios do Funil
        </button>
      </div>

      {/* Painel Configuração dos Estágios */}
      {showConfig && (
        <div className="card-glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Gerenciar Estágios do Funil CRM</h3>
            <X size={18} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => setShowConfig(false)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Adicionar Estágio */}
            <form onSubmit={handleAddStage} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px solid var(--border)', paddingRight: '1.5rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', margin: 0 }}>Novo Estágio</h4>
              <input 
                type="text" 
                placeholder="Ex: Pós-Venda" 
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
                  style={{ width: '40px', height: '36px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent' }}
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
                <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ flex: 1 }}>
                  Adicionar
                </button>
              </div>
            </form>

            {/* Listagem de estágios */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Estágios Atuais</h4>
              {stages.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: s.color }} />
                    <span style={{ fontSize: '0.85rem' }}>{s.name} ({s.contacts.length})</span>
                  </div>
                  <button type="button" onClick={() => handleDeleteStage(s.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Board Kanban */}
      <div style={{
        display: 'flex',
        gap: '1.25rem',
        overflowX: 'auto',
        paddingBottom: '1rem',
        alignItems: 'flex-start',
        minHeight: '65vh'
      }}>
        
        {/* Coluna: Sem Estágio (Novos Leads) */}
        <div 
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, null)}
          style={{
            flexShrink: 0,
            width: '280px',
            backgroundColor: 'rgba(255,255,255,0.01)',
            border: '1px dashed var(--border)',
            borderRadius: '12px',
            padding: '1rem',
            maxHeight: '65vh',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#9ca3af' }}>Sem Estágio</span>
            <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '10px', color: '#9ca3af' }}>
              {unassigned.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, minHeight: '100px' }}>
            {unassigned.map((contact) => (
              <div 
                key={contact.id}
                draggable
                onDragStart={(e) => handleDragStart(e, contact.id)}
                className="card-glass"
                style={{
                  padding: '0.75rem',
                  cursor: 'grab',
                  borderLeft: '3px solid #6b7280',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.8rem' }}>
                  <User size={12} style={{ color: '#9ca3af' }} />
                  <span>{contact.name || 'Cliente'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#9ca3af', fontSize: '0.75rem', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                  <Phone size={10} />
                  <span>{contact.phone}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {contact.tags.map((t, idx) => (
                    <span key={idx} style={{ fontSize: '0.65rem', padding: '0.05rem 0.25rem', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '3px', color: '#d1d5db' }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
            {unassigned.length === 0 && (
              <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '0.75rem', padding: '2rem 0' }}>
                Arraste um contato aqui para retirá-lo do funil.
              </div>
            )}
          </div>
        </div>

        {/* Colunas do Funil */}
        {stages.map((stage) => (
          <div 
            key={stage.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage.id)}
            style={{
              flexShrink: 0,
              width: '280px',
              backgroundColor: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem',
              maxHeight: '65vh',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: stage.color }} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{stage.name}</span>
              </div>
              <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', backgroundColor: `${stage.color}15`, borderRadius: '10px', color: stage.color, fontWeight: 600 }}>
                {stage.contacts.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, minHeight: '100px' }}>
              {stage.contacts.map((contact) => (
                <div 
                  key={contact.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, contact.id)}
                  className="card-glass"
                  style={{
                    padding: '0.75rem',
                    cursor: 'grab',
                    borderLeft: `3px solid ${stage.color}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.8rem' }}>
                    <User size={12} style={{ color: '#9ca3af' }} />
                    <span>{contact.name || 'Cliente'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#9ca3af', fontSize: '0.75rem', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                    <Phone size={10} />
                    <span>{contact.phone}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {contact.tags.map((t, idx) => (
                      <span key={idx} style={{ fontSize: '0.65rem', padding: '0.05rem 0.25rem', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '3px', color: '#d1d5db' }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
              {stage.contacts.length === 0 && (
                <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '0.75rem', padding: '4rem 0', border: '1px dashed rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  Arraste contatos para esta etapa.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

    </AppLayout>
  );
}

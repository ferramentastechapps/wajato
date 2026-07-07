'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Upload, 
  FolderPlus, 
  Search, 
  Tag, 
  AlertCircle, 
  X, 
  Check 
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  tags: string[];
  groupId: string | null;
  group?: {
    id: string;
    name: string;
  };
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  _count?: {
    contacts: number;
  };
}

export default function ContactsPage() {
  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);

  // Form inputs
  const [newContact, setNewContact] = useState({ name: '', phone: '', tags: '', groupId: '' });
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [importGroupId, setImportGroupId] = useState('');
  const [csvFileContent, setCsvFileContent] = useState<string | null>(null);
  const [csvError, setCsvError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Exclusão em Massa
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleteAction, setBulkDeleteAction] = useState<'clear_all' | 'delete_by_group' | 'delete_ungrouped'>('clear_all');
  const [bulkDeleteGroupId, setBulkDeleteGroupId] = useState('');
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
  const [bulkDeleteError, setBulkDeleteError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega dados iniciais
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/contacts');
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
        setGroups(data.groups || []);
      }
    } catch (err) {
      console.error('Erro ao buscar contatos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtros
  const filteredContacts = contacts.filter((c) => {
    const matchesSearch = 
      (c.name?.toLowerCase().includes(search.toLowerCase()) || false) ||
      c.phone.includes(search) ||
      c.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
      
    const matchesGroup = selectedGroupFilter === '' || c.groupId === selectedGroupFilter;
    
    return matchesSearch && matchesGroup;
  });

  // Ações de Seleção
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedContacts(filteredContacts.map((c) => c.id));
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSelectContact = (id: string) => {
    setSelectedContacts((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Envia formulário de novo contato
  const handleAddContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.phone) return;
    setIsSubmitting(true);

    try {
      const tagsArray = newContact.tags
        ? newContact.tags.split(',').map((t) => t.trim()).filter((t) => t !== '')
        : [];

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContact.name,
          phone: newContact.phone,
          tags: tagsArray,
          groupId: newContact.groupId || null,
        }),
      });

      if (response.ok) {
        setNewContact({ name: '', phone: '', tags: '', groupId: '' });
        setShowAddContact(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Envia formulário de novo grupo
  const handleAddGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroup.name) return;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contacts/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup),
      });

      if (response.ok) {
        setNewGroup({ name: '', description: '' });
        setShowAddGroup(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Processa arquivo CSV carregado
  const handleCSVChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError('');
    setCsvFileContent(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvFileContent(text);
      } else {
        setCsvError('Arquivo vazio ou inválido.');
      }
    };
    reader.onerror = () => {
      setCsvError('Erro ao ler arquivo.');
    };
    reader.readAsText(file);
  };

  // Envia contatos importados do CSV
  const handleImportCSVSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFileContent) {
      setCsvError('Por favor, carregue um arquivo CSV.');
      return;
    }
    setIsSubmitting(true);

    try {
      // Parsing robusto de CSV com mapeamento inteligente de colunas por cabeçalho
      const lines = csvFileContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setCsvError('Arquivo vazio.');
        setIsSubmitting(false);
        return;
      }

      // Detecta separador mais comum (vírgula ou ponto e vírgula)
      const firstLine = lines[0];
      const separator = firstLine.includes(';') ? ';' : ',';

      // Divide cabeçalhos
      const headers = firstLine.split(separator).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
      
      let nameIdx = -1;
      let phoneIdx = -1;
      let tagsIdx = -1;

      // Mapeamento semântico de telefone
      const phoneKeywords = ['phone number', 'telefone', 'phone', 'celular', 'number', 'numero', 'whatsapp', 'formatted phone', 'tel'];
      for (const keyword of phoneKeywords) {
        phoneIdx = headers.findIndex(h => h === keyword || h.includes(keyword));
        if (phoneIdx !== -1) break;
      }

      // Mapeamento semântico de nome
      const nameKeywords = ['saved name', 'name', 'nome', 'public name', 'display name', 'contato', 'contact'];
      for (const keyword of nameKeywords) {
        nameIdx = headers.findIndex(h => h === keyword || h.includes(keyword));
        if (nameIdx !== -1) break;
      }

      // Mapeamento semântico de tags/labels
      const tagsKeywords = ['tags', 'tag', 'labels', 'label', 'grupo', 'group'];
      for (const keyword of tagsKeywords) {
        tagsIdx = headers.findIndex(h => h === keyword || h.includes(keyword));
        if (tagsIdx !== -1) break;
      }

      const hasHeaders = nameIdx !== -1 || phoneIdx !== -1;
      const startIndex = hasHeaders ? 1 : 0;
      
      if (!hasHeaders) {
        // Fallback padrão se não houver cabeçalhos
        nameIdx = 0;
        phoneIdx = 1;
        tagsIdx = 2;
      } else {
        if (phoneIdx === -1) phoneIdx = 0;
        if (nameIdx === -1) nameIdx = phoneIdx === 0 ? 1 : 0;
      }

      const parsedContacts: Array<{ name: string; phone: string; tags: string[] }> = [];

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        
        let parts: string[] = [];
        if (line.includes('"') || line.includes("'")) {
          const regex = new RegExp(`\\s*${separator}\\s*(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)`);
          parts = line.split(regex).map(p => p.trim().replace(/^["']|["']$/g, ''));
        } else {
          parts = line.split(separator).map(p => p.trim());
        }

        const name = parts[nameIdx]?.trim() || '';
        const phone = parts[phoneIdx]?.trim() || '';
        const rawTags = tagsIdx !== -1 ? parts[tagsIdx]?.trim() || '' : '';
        
        const tags = rawTags
          ? rawTags.split('|').map((t) => t.trim()).filter((t) => t !== '')
          : [];

        const digitsOnly = phone.replace(/\D/g, '');
        if (digitsOnly.length >= 8) {
          parsedContacts.push({ name, phone, tags });
        }
      }

      if (parsedContacts.length === 0) {
        setCsvError('Nenhum contato válido encontrado. Formato esperado de cabeçalho: "saved name" e "phone number" ou similar.');
        setIsSubmitting(false);
        return;
      }

      const batchSize = 1000;
      const totalContacts = parsedContacts.length;
      setImportProgress({ current: 0, total: totalContacts });

      let importedCount = 0;

      for (let i = 0; i < totalContacts; i += batchSize) {
        const batch = parsedContacts.slice(i, i + batchSize);
        
        const response = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contacts: batch,
            groupId: importGroupId || null,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Erro ao processar lote de contatos no servidor.');
        }

        importedCount += batch.length;
        setImportProgress({ current: importedCount, total: totalContacts });
      }

      setCsvFileContent(null);
      setImportGroupId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowImportCSV(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setCsvError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setIsSubmitting(false);
      setImportProgress(null);
    }
  };

  const handleBulkDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkDeleteError('');

    if (bulkDeleteConfirmText !== 'EXCLUIR') {
      setBulkDeleteError('Digite EXCLUIR para confirmar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: bulkDeleteAction,
          groupId: bulkDeleteAction === 'delete_by_group' ? bulkDeleteGroupId : undefined,
        }),
      });

      if (response.ok) {
        setShowBulkDelete(false);
        setBulkDeleteConfirmText('');
        setBulkDeleteGroupId('');
        fetchData();
        setSelectedContacts([]);
      } else {
        const data = await response.json();
        setBulkDeleteError(data.message || 'Erro ao processar exclusão em massa.');
      }
    } catch (err) {
      console.error(err);
      setBulkDeleteError('Erro ao se conectar ao servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Excluir um único contato
  const handleDeleteContact = async (id: string) => {
    if (!confirm('Deseja excluir este contato?')) return;

    try {
      const response = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchData();
        setSelectedContacts((prev) => prev.filter((item) => item !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Excluir contatos selecionados
  const handleDeleteSelected = async () => {
    if (selectedContacts.length === 0) return;
    if (!confirm(`Deseja excluir ${selectedContacts.length} contatos selecionados?`)) return;

    try {
      const response = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedContacts }),
      });

      if (response.ok) {
        fetchData();
        setSelectedContacts([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AppLayout title="Contatos">
      {/* Barra de Ferramentas / Ações */}
      <div className="card-glass" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem'
        }}>
          {/* Ações primárias */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={() => setShowAddContact(true)} className="btn btn-primary">
              <Plus size={16} />
              Novo Contato
            </button>
            <button onClick={() => setShowAddGroup(true)} className="btn btn-secondary">
              <FolderPlus size={16} />
              Criar Grupo
            </button>
            <button onClick={() => setShowImportCSV(true)} className="btn btn-secondary">
              <Upload size={16} />
              Importar CSV
            </button>
            <button onClick={() => setShowBulkDelete(true)} className="btn btn-secondary" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <Trash2 size={16} />
              Excluir em Massa
            </button>
            {selectedContacts.length > 0 && (
              <button onClick={handleDeleteSelected} className="btn btn-danger">
                <Trash2 size={16} />
                Excluir Selecionados ({selectedContacts.length})
              </button>
            )}
          </div>

          {/* Filtros de Busca */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: '1', maxWidth: '500px' }}>
            {/* Filtro por grupo */}
            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              className="input-control"
              style={{ maxWidth: '180px', padding: '0.5rem' }}
            >
              <option value="">Todos os Grupos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g._count?.contacts || 0})
                </option>
              ))}
            </select>

            {/* Input de busca */}
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input
                type="text"
                placeholder="Buscar por nome, telefone ou tag..."
                className="input-control"
                style={{ padding: '0.5rem 0.75rem 0.5rem 2.25rem' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Contatos */}
      <div className="card-glass" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
            <span>Carregando contatos...</span>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>
            <Users size={48} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
            <p>Nenhum contato encontrado.</p>
            {contacts.length === 0 && (
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Comece criando um contato manualmente ou importando uma lista CSV.
              </p>
            )}
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={
                        filteredContacts.length > 0 &&
                        filteredContacts.every((c) => selectedContacts.includes(c.id))
                      }
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Grupo</th>
                  <th>Tags</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr key={contact.id}>
                    <td style={{ paddingRight: 0 }}>
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => handleSelectContact(contact.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td>{contact.name || <span style={{ color: '#6b7280', fontStyle: 'italic' }}>Sem nome</span>}</td>
                    <td style={{ fontFamily: 'monospace' }}>{contact.phone}</td>
                    <td>
                      {contact.group ? (
                        <span className="badge badge-info">{contact.group.name}</span>
                      ) : (
                        <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Sem grupo</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        {contact.tags.map((tag, i) => (
                          <span 
                            key={i} 
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.125rem 0.5rem',
                              backgroundColor: 'rgba(255,255,255,0.05)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <Tag size={10} />
                            {tag}
                          </span>
                        ))}
                        {contact.tags.length === 0 && (
                          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>-</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        style={{ color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                        title="Excluir Contato"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Novo Contato */}
      {showAddContact && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Novo Contato</h3>
              <X className="modal-close" onClick={() => setShowAddContact(false)} />
            </div>
            <form onSubmit={handleAddContactSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome (Opcional)</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Nome do cliente"
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone (Obrigatório)</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="DDI + DDD + Número (ex: 5511999999999)"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Grupo</label>
                  <select
                    className="input-control"
                    value={newContact.groupId}
                    onChange={(e) => setNewContact({ ...newContact, groupId: e.target.value })}
                  >
                    <option value="">Sem grupo</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tags (Separadas por vírgula)</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="promocoes, vip, novos"
                    value={newContact.tags}
                    onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowAddContact(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : 'Salvar Contato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Criar Grupo */}
      {showAddGroup && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Criar Grupo de Contatos</h3>
              <X className="modal-close" onClick={() => setShowAddGroup(false)} />
            </div>
            <form onSubmit={handleAddGroupSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome do Grupo</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ex: Clientes Grupo Ofertas"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <textarea
                    className="input-control"
                    rows={3}
                    placeholder="Descrição curta para controle interno"
                    value={newGroup.description}
                    onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowAddGroup(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Criando...' : 'Criar Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Importar CSV */}
      {showImportCSV && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Importar Contatos via CSV</h3>
              <X className="modal-close" onClick={() => setShowImportCSV(false)} />
            </div>
            <form onSubmit={handleImportCSVSubmit}>
              <div className="modal-body">
                {csvError && (
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
                    <span>{csvError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Salvar Contatos no Grupo</label>
                  <select
                    className="input-control"
                    value={importGroupId}
                    onChange={(e) => setImportGroupId(e.target.value)}
                  >
                    <option value="">Sem grupo (Contatos Soltos)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                {importProgress ? (
                  <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                      <span>Enviando contatos ao servidor...</span>
                      <strong>{importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()} ({Math.round((importProgress.current / importProgress.total) * 100)}%)</strong>
                    </div>
                    <div className="progress-container" style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        className="progress-bar progress-bar-animated"
                        style={{ height: '100%', width: `${(importProgress.current / importProgress.total) * 100}%`, background: '#25d366', borderRadius: '4px', transition: 'width 0.2s ease-out' }} 
                      />
                    </div>
                    <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.75rem', textAlign: 'center' }}>
                      Por favor, mantenha esta janela aberta até a conclusão.
                    </p>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Selecione o arquivo CSV</label>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      ref={fileInputRef}
                      onChange={handleCSVChange}
                      style={{
                        border: '1px dashed var(--border)',
                        padding: '1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        backgroundColor: 'rgba(255,255,255,0.01)',
                        width: '100%'
                      }}
                      required
                    />
                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#9ca3af', lineHeight: '1.4' }}>
                      <p style={{ fontWeight: 600 }}>Formato do arquivo esperado:</p>
                      <p style={{ fontFamily: 'monospace', color: '#25d366', marginTop: '0.25rem' }}>
                        Nome Cliente,5511999999999,tag1|tag2
                      </p>
                      <p style={{ marginTop: '0.5rem' }}>
                        * A primeira coluna é o nome, a segunda é o número com DDI e DDD (somente números), e a terceira coluna são as tags (separadas por barra vertical | ). A primeira e terceira colunas são opcionais.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowImportCSV(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isSubmitting || !csvFileContent}
                >
                  {isSubmitting ? 'Importando...' : 'Iniciar Importação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Exclusão em Massa */}
      {showBulkDelete && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#ef4444' }}>Excluir Contatos em Massa</h3>
              <X className="modal-close" onClick={() => { setShowBulkDelete(false); setBulkDeleteError(''); setBulkDeleteConfirmText(''); }} />
            </div>
            <form onSubmit={handleBulkDeleteSubmit}>
              <div className="modal-body">
                {bulkDeleteError && (
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
                    <span>{bulkDeleteError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>O que você deseja excluir?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'white' }}>
                      <input
                        type="radio"
                        name="bulkDeleteAction"
                        checked={bulkDeleteAction === 'clear_all'}
                        onChange={() => setBulkDeleteAction('clear_all')}
                      />
                      Excluir TODOS os contatos ({contacts.length.toLocaleString()})
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'white' }}>
                      <input
                        type="radio"
                        name="bulkDeleteAction"
                        checked={bulkDeleteAction === 'delete_by_group'}
                        onChange={() => setBulkDeleteAction('delete_by_group')}
                      />
                      Excluir contatos de um Grupo
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'white' }}>
                      <input
                        type="radio"
                        name="bulkDeleteAction"
                        checked={bulkDeleteAction === 'delete_ungrouped'}
                        onChange={() => setBulkDeleteAction('delete_ungrouped')}
                      />
                      Excluir contatos Avulsos (Sem grupo)
                    </label>
                  </div>
                </div>

                {bulkDeleteAction === 'delete_by_group' && (
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label">Selecione o Grupo</label>
                    <select
                      className="input-control"
                      value={bulkDeleteGroupId}
                      onChange={(e) => setBulkDeleteGroupId(e.target.value)}
                      required
                    >
                      <option value="">Selecione...</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name} ({g._count?.contacts || 0})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{
                  marginTop: '1.5rem',
                  padding: '0.75rem',
                  backgroundColor: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: '#9ca3af',
                  lineHeight: '1.4'
                }}>
                  <p style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>⚠️ ATENÇÃO: ESTA AÇÃO É IRREVERSÍVEL!</p>
                  Todos os dados de envio, histórico de mensagens e campanhas associadas a estes contatos serão removidos de forma permanente.
                </div>

                <div className="form-group" style={{ marginTop: '1.25rem' }}>
                  <label className="form-label">Confirme digitando <strong>EXCLUIR</strong> abaixo:</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="EXCLUIR"
                    style={{ borderColor: bulkDeleteConfirmText === 'EXCLUIR' ? '#25d366' : 'var(--border)' }}
                    value={bulkDeleteConfirmText}
                    onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowBulkDelete(false); setBulkDeleteError(''); setBulkDeleteConfirmText(''); }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isSubmitting || bulkDeleteConfirmText !== 'EXCLUIR'}
                >
                  {isSubmitting ? 'Excluindo...' : 'Confirmar Exclusão'}
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

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
      // Parsing simples de CSV
      const lines = csvFileContent.split(/\r?\n/);
      const parsedContacts: Array<{ name: string; phone: string; tags: string[] }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Suporta separador por vírgula ou ponto-e-vírgula
        const parts = line.split(/[;,]/);
        const name = parts[0]?.trim() || '';
        const phone = parts[1]?.trim() || '';
        const rawTags = parts[2]?.trim() || '';
        
        const tags = rawTags
          ? rawTags.split('|').map((t) => t.trim()).filter((t) => t !== '')
          : [];

        if (phone) {
          parsedContacts.push({ name, phone, tags });
        }
      }

      if (parsedContacts.length === 0) {
        setCsvError('Nenhum contato válido encontrado. Formato esperado: nome,telefone,tags (separadas por |)');
        setIsSubmitting(false);
        return;
      }

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: parsedContacts,
          groupId: importGroupId || null,
        }),
      });

      if (response.ok) {
        setCsvFileContent(null);
        setImportGroupId('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowImportCSV(false);
        fetchData();
      } else {
        const data = await response.json();
        setCsvError(data.message || 'Erro ao importar contatos.');
      }
    } catch (err) {
      console.error(err);
      setCsvError('Erro ao conectar com o servidor.');
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

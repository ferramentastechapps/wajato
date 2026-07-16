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
  Check,
  Smartphone,
  RefreshCw,
  CheckSquare,
  Square,
  Download
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

interface WAInstance {
  name: string;
  status: string;
}

interface WAGroup {
  id: string;
  subject: string;
  desc: string | null;
  size: number | null;
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
  const [showImportWA, setShowImportWA] = useState(false);

  // --- Estado do modal Importar do WhatsApp ---
  const [waStep, setWaStep] = useState<1 | 2 | 3>(1);
  const [waInstances, setWaInstances] = useState<WAInstance[]>([]);
  const [waSelectedInstance, setWaSelectedInstance] = useState('');
  const [waGroups, setWaGroups] = useState<WAGroup[]>([]);
  const [waSelectedGroupJids, setWaSelectedGroupJids] = useState<string[]>([]);
  const [waTargetGroupId, setWaTargetGroupId] = useState('');
  const [waNewGroupName, setWaNewGroupName] = useState('');
  const [waLoading, setWaLoading] = useState(false);
  const [waError, setWaError] = useState('');
  const [waResult, setWaResult] = useState<{ imported: number; updated: number; total: number } | null>(null);

  // Edit contact states
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showEditContact, setShowEditContact] = useState(false);

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

  // Paginação
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalContacts, setTotalContacts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce para busca
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Carrega dados iniciais e paginados
  const fetchData = async (currentPage = page, searchVal = debouncedSearch, groupFilter = selectedGroupFilter, currentLimit = limit) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(currentPage),
        limit: String(currentLimit),
        search: searchVal,
        groupId: groupFilter,
      });
      const response = await fetch(`/api/contacts?${query.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
        setGroups(data.groups || []);
        if (data.pagination) {
          setTotalContacts(data.pagination.total || 0);
          setTotalPages(data.pagination.totalPages || 1);
          // Atualiza apenas se mudou
          if (data.pagination.page !== page) {
            setPage(data.pagination.page);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar contatos:', err);
    } finally {
      setLoading(false);
    }
  };

  // Reseta página para 1 quando o filtro, busca ou limite de registros por página mudam
  useEffect(() => {
    setPage(1);
  }, [selectedGroupFilter, debouncedSearch, limit]);

  // Dispara o fetch sempre que a página, grupo, limite ou termo buscado mudarem
  useEffect(() => {
    fetchData(page, debouncedSearch, selectedGroupFilter, limit);
  }, [page, selectedGroupFilter, debouncedSearch, limit]);

  // Sem filtro local no frontend (feito 100% no banco de dados)
  const filteredContacts = contacts;

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

  const handleEditContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact || !editingContact.phone) return;
    setIsSubmitting(true);

    try {
      const tagsArray = Array.isArray(editingContact.tags)
        ? editingContact.tags.map((t) => t.trim()).filter((t) => t !== '')
        : (editingContact.tags as string).split(',').map((t) => t.trim()).filter((t) => t !== '');

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingContact.name,
          phone: editingContact.phone,
          tags: tagsArray,
          groupId: editingContact.groupId || null,
        }),
      });

      if (response.ok) {
        setShowEditContact(false);
        setEditingContact(null);
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
      let groupNameIdx = -1;

      // Mapeamento semântico de telefone (Busca correspondência exata primeiro, depois parcial)
      const phoneKeywords = ['phone number', 'telefone', 'phone', 'celular', 'number', 'numero', 'whatsapp', 'formatted phone', 'tel'];
      // Procura primeiro correspondência exata
      for (const keyword of phoneKeywords) {
        phoneIdx = headers.findIndex(h => h === keyword);
        if (phoneIdx !== -1) break;
      }
      // Se não achar, procura correspondência parcial
      if (phoneIdx === -1) {
        for (const keyword of phoneKeywords) {
          phoneIdx = headers.findIndex(h => h.includes(keyword));
          if (phoneIdx !== -1) break;
        }
      }

      // Mapeamento semântico de nome
      const nameKeywords = ['saved name', 'public name', 'display name', 'nome', 'name', 'contato', 'contact'];
      // Procura primeiro por cabeçalho exato para evitar correspondência incorreta em colunas como "Country Name"
      for (const keyword of nameKeywords) {
        nameIdx = headers.findIndex(h => h === keyword);
        if (nameIdx !== -1) break;
      }
      // Se não achar exato, procura por aproximação, mas ignora especificamente 'country'
      if (nameIdx === -1) {
        for (const keyword of nameKeywords) {
          nameIdx = headers.findIndex(h => h.includes(keyword) && !h.includes('country'));
          if (nameIdx !== -1) break;
        }
      }

      // Mapeamento semântico de tags/labels
      const tagsKeywords = ['tags', 'tag', 'labels', 'label'];
      for (const keyword of tagsKeywords) {
        tagsIdx = headers.findIndex(h => h === keyword || h.includes(keyword));
        if (tagsIdx !== -1) break;
      }

      // Mapeamento semântico de nome de grupo (evita pegar na mesma coluna de tags)
      const groupNameKeywords = ['group name', 'nome do grupo', 'group', 'grupo'];
      for (const keyword of groupNameKeywords) {
        groupNameIdx = headers.findIndex(h => h === keyword || h.includes(keyword));
        if (groupNameIdx !== -1) break;
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

      const parsedContacts: Array<{ name: string; phone: string; tags: string[]; groupName?: string }> = [];

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
        const groupName = groupNameIdx !== -1 ? parts[groupNameIdx]?.trim() || '' : '';
        const rawTags = tagsIdx !== -1 ? parts[tagsIdx]?.trim() || '' : '';
        
        const tags = rawTags
          ? rawTags.split('|').map((t) => t.trim()).filter((t) => t !== '')
          : [];

        const digitsOnly = phone.replace(/\D/g, '');
        if (digitsOnly.length >= 8) {
          parsedContacts.push({ name, phone, tags, groupName });
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

  // ── Importar do WhatsApp ────────────────────────────────────────────────────

  /** Abre o modal e carrega as instâncias disponíveis */
  const openImportWA = async () => {
    setWaStep(1);
    setWaError('');
    setWaSelectedInstance('');
    setWaGroups([]);
    setWaSelectedGroupJids([]);
    setWaTargetGroupId('');
    setWaNewGroupName('');
    setWaResult(null);
    setShowImportWA(true);
    setWaLoading(true);
    try {
      const res = await fetch('/api/whatsapp/instances');
      const data = await res.json();
      // A rota retorna um array direto (não encapsulado em { instances: [] })
      const allInstances: WAInstance[] = Array.isArray(data) ? data : (data.instances || []);
      const connected = allInstances.filter((i) => i.status === 'CONNECTED');
      setWaInstances(connected);
      if (connected.length === 0) {
        setWaError('Nenhuma instância conectada encontrada. Conecte um número primeiro.');
      }
    } catch {
      setWaError('Erro ao carregar instâncias. Tente novamente.');
    } finally {
      setWaLoading(false);
    }
  };

  /** Busca grupos da instância selecionada */
  const fetchWAGroups = async () => {
    if (!waSelectedInstance) return;
    setWaLoading(true);
    setWaError('');
    setWaGroups([]);
    setWaSelectedGroupJids([]);
    try {
      const res = await fetch(`/api/contacts/whatsapp-groups?instanceName=${encodeURIComponent(waSelectedInstance)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao buscar grupos');
      setWaGroups(data.groups || []);
      if ((data.groups || []).length === 0) {
        setWaError('Nenhum grupo encontrado para esta instância.');
      } else {
        setWaStep(2);
      }
    } catch (e: any) {
      setWaError(e.message || 'Erro ao buscar grupos.');
    } finally {
      setWaLoading(false);
    }
  };

  /** Executa a importação */
  const handleImportWASubmit = async () => {
    if (waSelectedGroupJids.length === 0) {
      setWaError('Selecione ao menos um grupo.');
      return;
    }
    if (!waTargetGroupId && !waNewGroupName.trim()) {
      setWaError('Selecione um grupo de contatos ou informe um nome para criar um novo.');
      return;
    }
    setWaLoading(true);
    setWaError('');
    setWaStep(3);
    try {
      const res = await fetch('/api/contacts/import-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: waSelectedInstance,
          groupJids: waSelectedGroupJids,
          targetGroupId: waTargetGroupId || undefined,
          createGroupName: !waTargetGroupId ? waNewGroupName.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao importar');
      setWaResult({ imported: data.imported, updated: data.updated, total: data.total });
      fetchData();
    } catch (e: any) {
      setWaError(e.message || 'Erro ao importar contatos.');
    } finally {
      setWaLoading(false);
    }
  };

  const toggleWAGroup = (jid: string) => {
    setWaSelectedGroupJids((prev) =>
      prev.includes(jid) ? prev.filter((j) => j !== jid) : [...prev, jid]
    );
  };

  const toggleAllWAGroups = () => {
    if (waSelectedGroupJids.length === waGroups.length) {
      setWaSelectedGroupJids([]);
    } else {
      setWaSelectedGroupJids(waGroups.map((g) => g.id));
    }
  };

  const waEstimatedContacts = waGroups
    .filter((g) => waSelectedGroupJids.includes(g.id))
    .reduce((acc, g) => acc + (g.size || 0), 0);

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
            <button
              id="btn-import-whatsapp"
              onClick={openImportWA}
              className="btn btn-secondary"
              style={{ color: '#25d366', borderColor: 'rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.06)' }}
            >
              <Smartphone size={16} />
              Importar do WhatsApp
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
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => {
                            setEditingContact(contact);
                            setShowEditContact(true);
                          }}
                          style={{ color: '#3b82f6', cursor: 'pointer', padding: '0.25rem', background: 'none', border: 'none' }}
                          title="Editar Contato"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          style={{ color: '#ef4444', cursor: 'pointer', padding: '0.25rem', background: 'none', border: 'none' }}
                          title="Excluir Contato"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Controles de Paginação */}
            {totalContacts > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border)',
                backgroundColor: 'rgba(255,255,255,0.01)',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8125rem', color: '#9ca3af' }}>
                  <span>
                    Mostrando <strong>{((page - 1) * limit + 1).toLocaleString()}</strong> a{' '}
                    <strong>{Math.min(page * limit, totalContacts).toLocaleString()}</strong> de{' '}
                    <strong>{totalContacts.toLocaleString()}</strong> contatos.
                  </span>
                  
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.75rem' }}>
                    Exibir por página:
                    <select
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      className="input-control"
                      style={{ 
                        padding: '0.2rem 0.5rem', 
                        width: 'auto', 
                        fontSize: '0.8125rem', 
                        height: 'auto', 
                        background: 'rgba(255,255,255,0.05)', 
                        borderColor: 'var(--border)',
                        color: 'white',
                        borderRadius: '4px'
                      }}
                    >
                      {[50, 100, 200, 300, 500, 1000, 5000, 10000, 20000, 30000, 50000].map((val) => (
                        <option key={val} value={val} style={{ background: '#121318' }}>{val.toLocaleString()}</option>
                      ))}
                    </select>
                  </span>
                </div>

                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      disabled={page === 1 || loading}
                    >
                      Anterior
                    </button>
                    <span style={{ fontSize: '0.8125rem', color: '#e5e7eb', margin: '0 0.5rem' }}>
                      Página <strong>{page}</strong> de <strong>{totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                      onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                      disabled={page === totalPages || loading}
                    >
                      Próxima
                    </button>
                  </div>
                )}
              </div>
            )}
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

      {/* Modal: Editar Contato */}
      {showEditContact && editingContact && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Editar Contato</h3>
              <X className="modal-close" onClick={() => { setShowEditContact(false); setEditingContact(null); }} />
            </div>
            <form onSubmit={handleEditContactSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome (Opcional)</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Nome do cliente"
                    value={editingContact.name || ''}
                    onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone (Obrigatório)</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="DDI + DDD + Número (ex: 5511999999999)"
                    value={editingContact.phone}
                    onChange={(e) => setEditingContact({ ...editingContact, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Grupo</label>
                  <select
                    className="input-control"
                    value={editingContact.groupId || ''}
                    onChange={(e) => setEditingContact({ ...editingContact, groupId: e.target.value || null })}
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
                    value={editingContact.tags ? (Array.isArray(editingContact.tags) ? editingContact.tags.join(', ') : editingContact.tags) : ''}
                    onChange={(e) => setEditingContact({ ...editingContact, tags: e.target.value.split(',').map(t => t.trim()) })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setShowEditContact(false); setEditingContact(null); }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
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
                      Excluir TODOS os contatos ({totalContacts.toLocaleString()})
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

      {/* ─── Modal: Importar do WhatsApp ─────────────────────────────────────── */}
      {showImportWA && (
        <div className="modal-overlay" onClick={() => !waLoading && setShowImportWA(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '580px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(37,211,102,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(37,211,102,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Smartphone size={18} color="#25d366" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                    Importar do WhatsApp
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                    {waStep === 1 && 'Passo 1 de 3 — Selecionar instância'}
                    {waStep === 2 && 'Passo 2 de 3 — Selecionar grupos'}
                    {waStep === 3 && 'Passo 3 de 3 — Importação'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportWA(false)}
                className="btn btn-secondary"
                style={{ padding: '0.25rem', minWidth: 0 }}
                disabled={waLoading}
              >
                <X size={16} />
              </button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', marginTop: '0.25rem' }}>
              {[1, 2, 3].map((s) => (
                <div key={s} style={{
                  flex: 1, height: 3,
                  background: waStep >= s ? '#25d366' : 'rgba(255,255,255,0.1)',
                  marginRight: s < 3 ? 3 : 0,
                  borderRadius: 2,
                  transition: 'background 0.3s ease'
                }} />
              ))}
            </div>

            <div style={{ padding: '0 1.5rem' }}>
              {/* Erro global */}
              {waError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8, marginBottom: '1rem',
                  color: '#fca5a5', fontSize: '0.85rem'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  {waError}
                </div>
              )}

              {/* ── STEP 1: Selecionar instância ── */}
              {waStep === 1 && (
                <div>
                  {waLoading ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#6b7280' }}>
                      <div style={{
                        width: 32, height: 32, border: '3px solid rgba(37,211,102,0.15)',
                        borderTopColor: '#25d366', borderRadius: '50%',
                        animation: 'spin 1s linear infinite', margin: '0 auto 1rem'
                      }} />
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>Buscando instâncias conectadas...</p>
                    </div>
                  ) : waInstances.length === 0 && !waError ? (
                    <p style={{ color: '#6b7280', textAlign: 'center', padding: '1.5rem 0' }}>
                      Nenhuma instância conectada.
                    </p>
                  ) : (
                    <div>
                      <label className="form-label">Instância conectada</label>
                      <select
                        id="wa-instance-select"
                        className="input-control"
                        value={waSelectedInstance}
                        onChange={(e) => { setWaSelectedInstance(e.target.value); setWaError(''); }}
                      >
                        <option value="">Selecione uma instância...</option>
                        {waInstances.map((i) => (
                          <option key={i.name} value={i.name}>{i.name}</option>
                        ))}
                      </select>
                      <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.5rem' }}>
                        Apenas instâncias com status <strong style={{ color: '#25d366' }}>CONECTADO</strong> são exibidas.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 2: Selecionar grupos ── */}
              {waStep === 2 && (
                <div>
                  {waLoading ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#6b7280' }}>
                      <div style={{
                        width: 32, height: 32, border: '3px solid rgba(37,211,102,0.15)',
                        borderTopColor: '#25d366', borderRadius: '50%',
                        animation: 'spin 1s linear infinite', margin: '0 auto 1rem'
                      }} />
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>Carregando grupos...</p>
                    </div>
                  ) : (
                    <>
                      {/* Lista de grupos */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Grupos ({waGroups.length})
                        </label>
                        <button
                          type="button"
                          onClick={toggleAllWAGroups}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        >
                          {waSelectedGroupJids.length === waGroups.length ? 'Desmarcar todos' : 'Selecionar todos'}
                        </button>
                      </div>

                      <div style={{
                        maxHeight: '260px', overflowY: 'auto',
                        border: '1px solid var(--border)',
                        borderRadius: 8, marginBottom: '1rem'
                      }}>
                        {waGroups.map((g) => {
                          const selected = waSelectedGroupJids.includes(g.id);
                          return (
                            <div
                              key={g.id}
                              onClick={() => toggleWAGroup(g.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                padding: '0.65rem 1rem',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                cursor: 'pointer',
                                background: selected ? 'rgba(37,211,102,0.06)' : 'transparent',
                                transition: 'background 0.15s',
                              }}
                            >
                              {selected
                                ? <CheckSquare size={16} color="#25d366" style={{ flexShrink: 0 }} />
                                : <Square size={16} color="#4b5563" style={{ flexShrink: 0 }} />
                              }
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {g.subject}
                                </p>
                                {g.desc && (
                                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {g.desc}
                                  </p>
                                )}
                              </div>
                              {g.size !== null && (
                                <span style={{ fontSize: '0.75rem', color: '#6b7280', flexShrink: 0 }}>
                                  {g.size} membros
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Destino dos contatos */}
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <label className="form-label">Grupo de contatos destino</label>
                        <select
                          id="wa-target-group-select"
                          className="input-control"
                          value={waTargetGroupId}
                          onChange={(e) => { setWaTargetGroupId(e.target.value); setWaNewGroupName(''); setWaError(''); }}
                          style={{ marginBottom: '0.5rem' }}
                        >
                          <option value="">— Criar novo grupo —</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>

                        {!waTargetGroupId && (
                          <input
                            id="wa-new-group-name"
                            type="text"
                            className="input-control"
                            placeholder="Nome do novo grupo de contatos..."
                            value={waNewGroupName}
                            onChange={(e) => { setWaNewGroupName(e.target.value); setWaError(''); }}
                          />
                        )}
                      </div>

                      {/* Resumo */}
                      {waSelectedGroupJids.length > 0 && (
                        <div style={{
                          marginTop: '0.75rem', padding: '0.6rem 0.9rem',
                          background: 'rgba(37,211,102,0.07)',
                          borderRadius: 8, fontSize: '0.82rem', color: '#9ca3af'
                        }}>
                          <strong style={{ color: '#25d366' }}>{waSelectedGroupJids.length}</strong> grupo(s) selecionado(s)
                          {waEstimatedContacts > 0 && (
                            <> · ~<strong style={{ color: '#25d366' }}>{waEstimatedContacts}</strong> membros estimados</>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── STEP 3: Resultado / Progresso ── */}
              {waStep === 3 && (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  {waLoading ? (
                    <>
                      <div style={{
                        width: 48, height: 48, border: '4px solid rgba(37,211,102,0.15)',
                        borderTopColor: '#25d366', borderRadius: '50%',
                        animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem'
                      }} />
                      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Importando contatos...</p>
                      <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                        Isso pode levar alguns segundos para grupos grandes.
                      </p>
                    </>
                  ) : waResult ? (
                    <>
                      <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: 'rgba(37,211,102,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.25rem'
                      }}>
                        <Check size={28} color="#25d366" />
                      </div>
                      <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                        Importação concluída!
                      </p>
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'center', padding: '0.75rem 1.25rem', background: 'rgba(37,211,102,0.08)', borderRadius: 10 }}>
                          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#25d366', margin: 0 }}>{waResult.imported}</p>
                          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Novos contatos</p>
                        </div>
                        <div style={{ textAlign: 'center', padding: '0.75rem 1.25rem', background: 'rgba(59,130,246,0.08)', borderRadius: 10 }}>
                          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa', margin: 0 }}>{waResult.updated}</p>
                          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Atualizados</p>
                        </div>
                        <div style={{ textAlign: 'center', padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{waResult.total}</p>
                          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Total processado</p>
                        </div>
                      </div>
                    </>
                  ) : waError ? (
                    <>
                      <AlertCircle size={40} color="#ef4444" style={{ marginBottom: '1rem' }} />
                      <p style={{ fontWeight: 600, color: '#ef4444' }}>Erro na importação</p>
                      <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{waError}</p>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
              {waStep === 1 && (
                <>
                  <button className="btn btn-secondary" onClick={() => setShowImportWA(false)} disabled={waLoading}>
                    Cancelar
                  </button>
                  <button
                    id="wa-btn-next-step1"
                    className="btn btn-primary"
                    onClick={fetchWAGroups}
                    disabled={!waSelectedInstance || waLoading}
                    style={{ background: '#25d366', borderColor: '#25d366' }}
                  >
                    {waLoading ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={15} />}
                    Buscar Grupos
                  </button>
                </>
              )}
              {waStep === 2 && !waLoading && (
                <>
                  <button className="btn btn-secondary" onClick={() => setWaStep(1)} disabled={waLoading}>
                    ← Voltar
                  </button>
                  <button
                    id="wa-btn-import"
                    className="btn btn-primary"
                    onClick={handleImportWASubmit}
                    disabled={waSelectedGroupJids.length === 0 || waLoading || (!waTargetGroupId && !waNewGroupName.trim())}
                    style={{ background: '#25d366', borderColor: '#25d366' }}
                  >
                    <Smartphone size={15} />
                    Importar {waSelectedGroupJids.length > 0 ? `(${waSelectedGroupJids.length} grupo${waSelectedGroupJids.length > 1 ? 's' : ''})` : ''}
                  </button>
                </>
              )}
              {waStep === 3 && !waLoading && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowImportWA(false)}
                  style={{ background: '#25d366', borderColor: '#25d366', width: '100%' }}
                >
                  <Check size={15} />
                  {waResult ? 'Ver Contatos' : 'Fechar'}
                </button>
              )}
            </div>
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

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Download,
  BellOff,
  Bell,
  FileText,
  Pencil,
  FolderOpen,
  ArrowRight,
  Copy,
  ChevronDown,
  MessageSquare,
  Clock,
  StickyNote,
  Layers,
  BarChart2,
  Merge,
  ShieldCheck,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  tags: string[];
  groupId: string | null;
  optOut: boolean;
  optOutAt?: string | null;
  notes?: string | null;
  group?: { id: string; name: string };
}

interface PhoneCheckResult {
  exists: boolean;
  contact?: {
    id: string;
    name: string | null;
    optOut: boolean;
    optOutAt?: string | null;
    group?: { id: string; name: string } | null;
    tags?: string[];
    createdAt?: string;
  };
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  _count?: { contacts: number };
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

interface DuplicateGroup {
  name: string;
  contacts: Contact[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Gera cor por hash do texto (para avatares e tags) */
function hashColor(str: string): string {
  const palette = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
    '#f97316', '#a855f7', '#06b6d4', '#84cc16',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

/** Pega iniciais do nome */
function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Formata data relativa */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d atrás`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

// ─── Componentes menores ──────────────────────────────────────────────────────

/** Avatar com iniciais coloridas */
function Avatar({ name, size = 32 }: { name: string | null | undefined; size?: number }) {
  const color = hashColor(name || '?');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}20`, border: `1.5px solid ${color}50`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: size * 0.35, fontWeight: 700, color,
      userSelect: 'none', letterSpacing: '-0.02em',
    }}>
      {initials(name)}
    </div>
  );
}

/** Tag colorida */
function TagBadge({ tag }: { tag: string }) {
  const color = hashColor(tag);
  return (
    <span style={{
      fontSize: '0.7rem',
      padding: '0.15rem 0.5rem',
      backgroundColor: `${color}15`,
      border: `1px solid ${color}35`,
      borderRadius: '999px',
      color,
      fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      whiteSpace: 'nowrap',
    }}>
      <Tag size={9} />
      {tag}
    </span>
  );
}

/** Toggle estilo switch */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 40, height: 22, borderRadius: 999,
        background: checked ? '#ef4444' : 'rgba(255,255,255,0.1)',
        border: checked ? '1px solid #ef4444' : '1px solid var(--border)',
        position: 'relative', cursor: 'pointer', transition: 'all 0.25s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 2,
        left: checked ? 20 : 2,
        transition: 'left 0.25s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </div>
  );
}

/** Modal de confirmação elegante (substitui window.confirm) */
function ConfirmModal({
  title, message, confirmLabel = 'Confirmar', danger = false,
  onConfirm, onCancel
}: {
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content"
        style={{ maxWidth: 400 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title" style={{ color: danger ? '#ef4444' : undefined }}>{title}</h3>
          <X className="modal-close" onClick={onCancel} />
        </div>
        <div className="modal-body">
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ContactsPage() {
  // Estado principal
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');

  // Modals
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [showImportWA, setShowImportWA] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showMoveGroup, setShowMoveGroup] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message: string; onConfirm: () => void; danger?: boolean; confirmLabel?: string;
  } | null>(null);

  // Edit contact + detail modal com abas
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showEditContact, setShowEditContact] = useState(false);
  const [contactDetailTab, setContactDetailTab] = useState<'info' | 'history' | 'notes'>('info');
  const [contactHistory, setContactHistory] = useState<any[] | null>(null);
  const [contactNotes, setContactNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Edit group
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', description: '' });

  // Importação WA
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

  // Form novo contato
  const [newContact, setNewContact] = useState({ name: '', phone: '', tags: '', groupId: '', optOut: false });
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [importGroupId, setImportGroupId] = useState('');
  const [csvFileContent, setCsvFileContent] = useState<string | null>(null);
  const [csvError, setCsvError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Verificação de telefone
  const [phoneCheckResult, setPhoneCheckResult] = useState<PhoneCheckResult | null>(null);
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);

  // Verificação WhatsApp
  const [waCheckResult, setWaCheckResult] = useState<{ exists: boolean; name?: string | null } | null>(null);
  const [waCheckLoading, setWaCheckLoading] = useState(false);
  const [waInstances2, setWaInstances2] = useState<WAInstance[]>([]);
  const [selectedWAInstance, setSelectedWAInstance] = useState('');

  // Filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState<{ total: number; active: number; optOut: number } | null>(null);

  // Exclusão massa
  const [bulkDeleteAction, setBulkDeleteAction] = useState<'clear_all' | 'delete_by_group' | 'delete_ungrouped'>('clear_all');
  const [bulkDeleteGroupId, setBulkDeleteGroupId] = useState('');
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
  const [bulkDeleteError, setBulkDeleteError] = useState('');

  // Paginação
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalContacts, setTotalContacts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Mover grupo bulk
  const [moveTargetGroupId, setMoveTargetGroupId] = useState('');

  // Duplicatas
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [duplicatesTotal, setDuplicatesTotal] = useState(0);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);

  // Higienização / Validação em Lote WhatsApp
  const [showSanitizeModal, setShowSanitizeModal] = useState(false);
  const [sanitizeInstance, setSanitizeInstance] = useState('');
  const [sanitizeScope, setSanitizeScope] = useState<'all' | 'group' | 'selected'>('all');
  const [sanitizeGroupId, setSanitizeGroupId] = useState('');
  const [sanitizeAction, setSanitizeAction] = useState<'tag_and_optout' | 'optout' | 'tag' | 'delete'>('tag_and_optout');
  const [sanitizeLoading, setSanitizeLoading] = useState(false);
  const [sanitizeError, setSanitizeError] = useState('');
  const [sanitizeResult, setSanitizeResult] = useState<{
    totalChecked: number;
    validCount: number;
    invalidCount: number;
    updatedCount: number;
    deletedCount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce busca
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(h);
  }, [search]);

  // Verificação de duplicata (número)
  useEffect(() => {
    const phone = newContact.phone.trim();
    if (!phone || phone.replace(/\D/g, '').length < 8) {
      setPhoneCheckResult(null);
      return;
    }
    setPhoneCheckLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/check-phone?phone=${encodeURIComponent(phone)}`);
        const data = await res.json();
        setPhoneCheckResult(data);
      } catch {
        setPhoneCheckResult(null);
      } finally {
        setPhoneCheckLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [newContact.phone]);

  // Carrega instâncias WA para verificação no modal de contato
  useEffect(() => {
    fetch('/api/whatsapp/instances').then(r => r.json()).then(data => {
      const all: WAInstance[] = Array.isArray(data) ? data : (data.instances || []);
      setWaInstances2(all.filter(i => i.status === 'CONNECTED'));
    }).catch(() => {});
  }, []);

  const fetchData = async (
    currentPage = page,
    searchVal = debouncedSearch,
    groupFilter = selectedGroupFilter,
    currentLimit = limit,
    statusVal = statusFilter
  ) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(currentPage),
        limit: String(currentLimit),
        search: searchVal,
        groupId: groupFilter,
        status: statusVal,
      });
      const response = await fetch(`/api/contacts?${query}`);
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
        setGroups(data.groups || []);
        if (data.stats) setStats(data.stats);
        if (data.pagination) {
          setTotalContacts(data.pagination.total || 0);
          setTotalPages(data.pagination.totalPages || 1);
          if (data.pagination.page !== page) setPage(data.pagination.page);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar contatos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); }, [selectedGroupFilter, debouncedSearch, limit, statusFilter]);
  useEffect(() => { fetchData(page, debouncedSearch, selectedGroupFilter, limit, statusFilter); }, [page, selectedGroupFilter, debouncedSearch, limit, statusFilter]);

  const filteredContacts = contacts;

  // ── Exportar CSV ────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const query = new URLSearchParams({
      search: debouncedSearch,
      groupId: selectedGroupFilter,
      status: statusFilter,
      export: 'csv',
    });
    window.open(`/api/contacts?${query}`, '_blank');
  };

  // ── Seleção ─────────────────────────────────────────────────────────────────
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedContacts(e.target.checked ? filteredContacts.map(c => c.id) : []);
  };

  const handleSelectContact = (id: string) => {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // ── Opt-out rápido ──────────────────────────────────────────────────────────
  const handleToggleOptOut = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}/optout`, { method: 'PATCH' });
      if (res.ok) fetchData();
    } catch (err) { console.error(err); }
  };

  // ── Adicionar contato ────────────────────────────────────────────────────────
  const handleAddContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.phone) return;
    setIsSubmitting(true);
    try {
      const tagsArray = newContact.tags
        ? newContact.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContact.name,
          phone: newContact.phone,
          tags: tagsArray,
          groupId: newContact.groupId || null,
          optOut: newContact.optOut,
        }),
      });
      if (response.ok) {
        setNewContact({ name: '', phone: '', tags: '', groupId: '', optOut: false });
        setPhoneCheckResult(null);
        setWaCheckResult(null);
        setShowAddContact(false);
        fetchData();
      }
    } catch (err) { console.error(err); }
    finally { setIsSubmitting(false); }
  };

  // ── Verificar WhatsApp no modal ──────────────────────────────────────────────
  const handleCheckWhatsApp = async (phone: string) => {
    if (!selectedWAInstance || !phone) return;
    setWaCheckLoading(true);
    setWaCheckResult(null);
    try {
      const res = await fetch('/api/contacts/check-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, instanceName: selectedWAInstance }),
      });
      const data = await res.json();
      setWaCheckResult(data);
    } catch {
      setWaCheckResult({ exists: false });
    } finally {
      setWaCheckLoading(false);
    }
  };

  // ── Editar contato ───────────────────────────────────────────────────────────
  const openEditContact = async (contact: Contact) => {
    setEditingContact(contact);
    setContactDetailTab('info');
    setContactHistory(null);
    setContactNotes(contact.notes || '');
    setWaCheckResult(null);
    setShowEditContact(true);
  };

  const loadContactHistory = async (id: string) => {
    if (contactHistory !== null) return;
    try {
      const res = await fetch(`/api/contacts/${id}/notes`);
      const data = await res.json();
      setContactHistory(data.contact?.logs || []);
      if (data.contact?.notes !== undefined) {
        setContactNotes(data.contact.notes || '');
      }
    } catch { setContactHistory([]); }
  };

  const handleEditContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact?.phone) return;
    setIsSubmitting(true);
    try {
      const tagsArray = Array.isArray(editingContact.tags)
        ? editingContact.tags.map(t => t.trim()).filter(Boolean)
        : (editingContact.tags as string).split(',').map(t => t.trim()).filter(Boolean);

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingContact.name,
          phone: editingContact.phone,
          tags: tagsArray,
          groupId: editingContact.groupId || null,
          optOut: editingContact.optOut,
        }),
      });
      if (response.ok) {
        setShowEditContact(false);
        setEditingContact(null);
        fetchData();
      }
    } catch (err) { console.error(err); }
    finally { setIsSubmitting(false); }
  };

  const handleSaveNotes = async () => {
    if (!editingContact) return;
    setSavingNotes(true);
    try {
      await fetch(`/api/contacts/${editingContact.id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: contactNotes }),
      });
    } catch (err) { console.error(err); }
    finally { setSavingNotes(false); }
  };

  // ── Grupos ───────────────────────────────────────────────────────────────────
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
    } catch (err) { console.error(err); }
    finally { setIsSubmitting(false); }
  };

  const openEditGroup = (group: Group) => {
    setEditingGroup(group);
    setEditGroupForm({ name: group.name, description: group.description || '' });
    setShowEditGroup(true);
  };

  const handleEditGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/groups?id=${editingGroup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editGroupForm),
      });
      if (res.ok) {
        setShowEditGroup(false);
        setEditingGroup(null);
        fetchData();
      }
    } catch (err) { console.error(err); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteGroup = (group: Group) => {
    setConfirmModal({
      title: 'Excluir Grupo',
      message: `Deseja excluir o grupo "${group.name}"? Os ${group._count?.contacts || 0} contatos do grupo serão mantidos, porém ficarão sem grupo.`,
      confirmLabel: 'Excluir Grupo',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await fetch(`/api/contacts/groups?id=${group.id}`, { method: 'DELETE' });
          fetchData();
        } catch (err) { console.error(err); }
      },
    });
  };

  // ── Mover Grupo Bulk ─────────────────────────────────────────────────────────
  const handleMoveGroupSubmit = async () => {
    if (selectedContacts.length === 0) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contacts/move-group', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedContacts, groupId: moveTargetGroupId || null }),
      });
      if (res.ok) {
        setShowMoveGroup(false);
        setSelectedContacts([]);
        setMoveTargetGroupId('');
        fetchData();
      }
    } catch (err) { console.error(err); }
    finally { setIsSubmitting(false); }
  };

  // ── Importar CSV ─────────────────────────────────────────────────────────────
  const handleCSVChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError('');
    setCsvFileContent(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) setCsvFileContent(text);
      else setCsvError('Arquivo vazio ou inválido.');
    };
    reader.onerror = () => setCsvError('Erro ao ler arquivo.');
    reader.readAsText(file);
  };

  const handleImportCSVSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFileContent) { setCsvError('Por favor, carregue um arquivo CSV.'); return; }
    setIsSubmitting(true);
    try {
      const lines = csvFileContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) { setCsvError('Arquivo vazio.'); setIsSubmitting(false); return; }

      const firstLine = lines[0];
      const separator = firstLine.includes(';') ? ';' : ',';
      const headers = firstLine.split(separator).map(h => h.trim().toLowerCase().replace(/["']/g, ''));

      let nameIdx = -1, phoneIdx = -1, tagsIdx = -1, groupNameIdx = -1;

      const phoneKeywords = ['phone number', 'telefone', 'phone', 'celular', 'number', 'numero', 'whatsapp', 'formatted phone', 'tel'];
      for (const kw of phoneKeywords) { phoneIdx = headers.findIndex(h => h === kw); if (phoneIdx !== -1) break; }
      if (phoneIdx === -1) for (const kw of phoneKeywords) { phoneIdx = headers.findIndex(h => h.includes(kw)); if (phoneIdx !== -1) break; }

      const nameKeywords = ['saved name', 'public name', 'display name', 'nome', 'name', 'contato', 'contact'];
      for (const kw of nameKeywords) { nameIdx = headers.findIndex(h => h === kw); if (nameIdx !== -1) break; }
      if (nameIdx === -1) for (const kw of nameKeywords) { nameIdx = headers.findIndex(h => h.includes(kw) && !h.includes('country')); if (nameIdx !== -1) break; }

      const tagsKeywords = ['tags', 'tag', 'labels', 'label'];
      for (const kw of tagsKeywords) { tagsIdx = headers.findIndex(h => h === kw || h.includes(kw)); if (tagsIdx !== -1) break; }

      const groupNameKeywords = ['group name', 'nome do grupo', 'group', 'grupo'];
      for (const kw of groupNameKeywords) { groupNameIdx = headers.findIndex(h => h === kw || h.includes(kw)); if (groupNameIdx !== -1) break; }

      const hasHeaders = nameIdx !== -1 || phoneIdx !== -1;
      const startIndex = hasHeaders ? 1 : 0;
      if (!hasHeaders) { nameIdx = 0; phoneIdx = 1; tagsIdx = 2; }
      else { if (phoneIdx === -1) phoneIdx = 0; if (nameIdx === -1) nameIdx = phoneIdx === 0 ? 1 : 0; }

      const parsedContacts: Array<{ name: string; phone: string; tags: string[]; groupName?: string }> = [];
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        let parts: string[];
        if (line.includes('"') || line.includes("'")) {
          const regex = new RegExp(`\\s*${separator}\\s*(?=(?:[^"]*"[^"]*")*[^"]*$)`);
          parts = line.split(regex).map(p => p.trim().replace(/^["']|["']$/g, ''));
        } else {
          parts = line.split(separator).map(p => p.trim());
        }
        const name = parts[nameIdx]?.trim() || '';
        const phone = parts[phoneIdx]?.trim() || '';
        const groupName = groupNameIdx !== -1 ? parts[groupNameIdx]?.trim() || '' : '';
        const rawTags = tagsIdx !== -1 ? parts[tagsIdx]?.trim() || '' : '';
        const tags = rawTags ? rawTags.split('|').map(t => t.trim()).filter(Boolean) : [];
        if (phone.replace(/\D/g, '').length >= 8) parsedContacts.push({ name, phone, tags, groupName });
      }

      if (parsedContacts.length === 0) {
        setCsvError('Nenhum contato válido encontrado.');
        setIsSubmitting(false);
        return;
      }

      const batchSize = 1000;
      const total = parsedContacts.length;
      setImportProgress({ current: 0, total });
      let imported = 0;
      for (let i = 0; i < total; i += batchSize) {
        const batch = parsedContacts.slice(i, i + batchSize);
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: batch, groupId: importGroupId || null }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Erro ao processar lote.'); }
        imported += batch.length;
        setImportProgress({ current: imported, total });
      }

      setCsvFileContent(null);
      setImportGroupId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowImportCSV(false);
      fetchData();
    } catch (err: any) {
      setCsvError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setIsSubmitting(false);
      setImportProgress(null);
    }
  };

  // ── Exclusão em Massa ────────────────────────────────────────────────────────
  const handleBulkDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkDeleteError('');
    if (bulkDeleteConfirmText !== 'EXCLUIR') { setBulkDeleteError('Digite EXCLUIR para confirmar.'); return; }
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
    } catch { setBulkDeleteError('Erro ao se conectar ao servidor.'); }
    finally { setIsSubmitting(false); }
  };

  // ── Excluir Contato ──────────────────────────────────────────────────────────
  const handleDeleteContact = (id: string, name?: string | null) => {
    setConfirmModal({
      title: 'Excluir Contato',
      message: `Deseja excluir o contato${name ? ` "${name}"` : ''}? Esta ação é irreversível.`,
      confirmLabel: 'Excluir',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
          if (res.ok) { fetchData(); setSelectedContacts(prev => prev.filter(i => i !== id)); }
        } catch (err) { console.error(err); }
      },
    });
  };

  const handleDeleteSelected = () => {
    if (selectedContacts.length === 0) return;
    setConfirmModal({
      title: 'Excluir Contatos Selecionados',
      message: `Deseja excluir ${selectedContacts.length} contatos selecionados? Esta ação é irreversível.`,
      confirmLabel: `Excluir ${selectedContacts.length} contatos`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch('/api/contacts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedContacts }),
          });
          if (res.ok) { fetchData(); setSelectedContacts([]); }
        } catch (err) { console.error(err); }
      },
    });
  };

  // ── Importar do WhatsApp ─────────────────────────────────────────────────────
  const openImportWA = async () => {
    setWaStep(1); setWaError(''); setWaSelectedInstance('');
    setWaGroups([]); setWaSelectedGroupJids([]); setWaTargetGroupId('');
    setWaNewGroupName(''); setWaResult(null); setShowImportWA(true); setWaLoading(true);
    try {
      const res = await fetch('/api/whatsapp/instances');
      const data = await res.json();
      const all: WAInstance[] = Array.isArray(data) ? data : (data.instances || []);
      const connected = all.filter(i => i.status === 'CONNECTED');
      setWaInstances(connected);
      if (connected.length === 0) setWaError('Nenhuma instância conectada encontrada.');
    } catch { setWaError('Erro ao carregar instâncias.'); }
    finally { setWaLoading(false); }
  };

  const fetchWAGroups = async () => {
    if (!waSelectedInstance) return;
    setWaLoading(true); setWaError(''); setWaGroups([]); setWaSelectedGroupJids([]);
    try {
      const res = await fetch(`/api/contacts/whatsapp-groups?instanceName=${encodeURIComponent(waSelectedInstance)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao buscar grupos');
      setWaGroups(data.groups || []);
      if ((data.groups || []).length === 0) setWaError('Nenhum grupo encontrado.');
      else setWaStep(2);
    } catch (e: any) { setWaError(e.message || 'Erro ao buscar grupos.'); }
    finally { setWaLoading(false); }
  };

  const handleImportWASubmit = async () => {
    if (waSelectedGroupJids.length === 0) { setWaError('Selecione ao menos um grupo.'); return; }
    if (!waTargetGroupId && !waNewGroupName.trim()) { setWaError('Selecione ou crie um grupo de destino.'); return; }
    setWaLoading(true); setWaError(''); setWaStep(3);
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
    } catch (e: any) { setWaError(e.message || 'Erro ao importar contatos.'); }
    finally { setWaLoading(false); }
  };

  const toggleWAGroup = (jid: string) => {
    setWaSelectedGroupJids(prev => prev.includes(jid) ? prev.filter(j => j !== jid) : [...prev, jid]);
  };
  const toggleAllWAGroups = () => {
    setWaSelectedGroupJids(waSelectedGroupJids.length === waGroups.length ? [] : waGroups.map(g => g.id));
  };
  const waEstimatedContacts = waGroups.filter(g => waSelectedGroupJids.includes(g.id)).reduce((a, g) => a + (g.size || 0), 0);

  // ── Análise de Duplicatas ────────────────────────────────────────────────────
  const fetchDuplicates = async () => {
    setLoadingDuplicates(true);
    try {
      const res = await fetch('/api/contacts/duplicates');
      const data = await res.json();
      setDuplicates(data.duplicates || []);
      setDuplicatesTotal(data.groups || 0);
    } catch { setDuplicates([]); }
    finally { setLoadingDuplicates(false); }
  };

  const openDuplicates = () => { setShowDuplicates(true); fetchDuplicates(); };

  const handleDeleteDuplicate = async (id: string) => {
    try {
      await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
      fetchDuplicates();
      fetchData();
    } catch (err) { console.error(err); }
  };

  // ── Higienização em Lote de WhatsApp ─────────────────────────────────────────
  const handleSanitizeSubmit = async () => {
    if (!sanitizeInstance) {
      setSanitizeError('Selecione uma instância conectada.');
      return;
    }
    if (sanitizeScope === 'group' && !sanitizeGroupId) {
      setSanitizeError('Selecione o grupo que deseja validar.');
      return;
    }
    if (sanitizeScope === 'selected' && selectedContacts.length === 0) {
      setSanitizeError('Nenhum contato selecionado.');
      return;
    }

    setSanitizeLoading(true);
    setSanitizeError('');
    setSanitizeResult(null);

    try {
      const res = await fetch('/api/contacts/validate-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: sanitizeInstance,
          ids: sanitizeScope === 'selected' ? selectedContacts : undefined,
          groupId: sanitizeScope === 'group' ? sanitizeGroupId : undefined,
          validateAll: sanitizeScope === 'all',
          actionOnInvalid: sanitizeAction,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao validar contatos');

      setSanitizeResult(data.stats);
      fetchData();
    } catch (err: any) {
      setSanitizeError(err.message || 'Erro na validação.');
    } finally {
      setSanitizeLoading(false);
    }
  };

  // ── Stats sem grupo ──────────────────────────────────────────────────────────
  const ungroupedCount = contacts.filter(c => !c.groupId).length;

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout title="Contatos">

      {/* ── Stats Cards ──────────────────────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Total', value: stats.total, color: '#6366f1', icon: <Users size={18} /> },
            { label: 'Ativos', value: stats.active, color: '#22c55e', icon: <Bell size={18} /> },
            { label: 'Opt-Out', value: stats.optOut, color: '#ef4444', icon: <BellOff size={18} /> },
            { label: 'Grupos', value: groups.length, color: '#f59e0b', icon: <FolderOpen size={18} /> },
          ].map((s) => (
            <div key={s.label} className="card-glass" style={{
              padding: '1rem 1.25rem',
              display: 'flex', alignItems: 'center', gap: '1rem',
              borderLeft: `3px solid ${s.color}`,
              transition: 'transform 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${s.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: s.color, flexShrink: 0,
              }}>
                {s.icon}
              </div>
              <div>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>
                  {s.value.toLocaleString('pt-BR')}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.2rem' }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Abas: Contatos / Grupos ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
        {(['contacts', 'groups'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              background: activeTab === tab ? 'rgba(37,211,102,0.15)' : 'transparent',
              color: activeTab === tab ? '#25d366' : '#6b7280',
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.875rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s',
            }}
          >
            {tab === 'contacts' ? <><Users size={15} />Contatos</> : <><FolderOpen size={15} />Grupos ({groups.length})</>}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ABA: CONTATOS                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'contacts' && (
        <>
          {/* ── Toolbar ──────────────────────────────────────────────────────── */}
          <div className="card-glass" style={{ marginBottom: '1.25rem', padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>

              {/* Ações primárias */}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button onClick={() => { setPhoneCheckResult(null); setWaCheckResult(null); setShowAddContact(true); }} className="btn btn-primary">
                  <Plus size={15} /> Novo Contato
                </button>
                <button onClick={() => setShowAddGroup(true)} className="btn btn-secondary">
                  <FolderPlus size={15} /> Criar Grupo
                </button>
                <button onClick={() => setShowImportCSV(true)} className="btn btn-secondary">
                  <Upload size={15} /> Importar CSV
                </button>
                <button
                  id="btn-import-whatsapp"
                  onClick={openImportWA}
                  className="btn btn-secondary"
                  style={{ color: '#25d366', borderColor: 'rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.06)' }}
                >
                  <Smartphone size={15} /> Importar do WhatsApp
                </button>
                <button
                  onClick={() => {
                    setSanitizeScope(selectedContacts.length > 0 ? 'selected' : 'all');
                    setSanitizeResult(null);
                    setSanitizeError('');
                    if (waInstances2.length > 0 && !sanitizeInstance) {
                      setSanitizeInstance(waInstances2[0].name);
                    }
                    setShowSanitizeModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)' }}
                  title="Validar se os números possuem conta ativa no WhatsApp"
                >
                  <ShieldCheck size={15} /> Validar WhatsApp (Lote)
                </button>
                <button onClick={handleExportCSV} className="btn btn-secondary" title="Exportar contatos filtrados como CSV">
                  <Download size={15} /> Exportar CSV
                </button>
                <button onClick={openDuplicates} className="btn btn-secondary" title="Analisar duplicatas">
                  <Layers size={15} /> Duplicatas
                </button>
                <button onClick={() => setShowBulkDelete(true)} className="btn btn-secondary" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>
                  <Trash2 size={15} /> Excluir em Massa
                </button>
              </div>

              {/* Filtros */}
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flex: 1, maxWidth: 560, flexWrap: 'wrap' }}>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="input-control"
                  style={{ maxWidth: 140, padding: '0.45rem' }}
                >
                  <option value="">Todos</option>
                  <option value="active">✅ Ativos</option>
                  <option value="optout">🚫 Opt-Out</option>
                </select>
                <select
                  value={selectedGroupFilter}
                  onChange={e => setSelectedGroupFilter(e.target.value)}
                  className="input-control"
                  style={{ maxWidth: 180, padding: '0.45rem' }}
                >
                  <option value="">Todos os Grupos</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g._count?.contacts || 0})</option>)}
                </select>
                <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input
                    type="text"
                    placeholder="Buscar por nome, telefone ou tag..."
                    className="input-control"
                    style={{ padding: '0.45rem 0.75rem 0.45rem 2.1rem' }}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Bulk action bar */}
            {selectedContacts.length > 0 && (
              <div style={{
                marginTop: '1rem', paddingTop: '1rem',
                borderTop: '1px solid var(--border)',
                display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                  <strong style={{ color: '#25d366' }}>{selectedContacts.length}</strong> selecionado(s)
                </span>
                <button
                  onClick={() => {
                    setSanitizeScope('selected');
                    setSanitizeResult(null);
                    setSanitizeError('');
                    if (waInstances2.length > 0 && !sanitizeInstance) {
                      setSanitizeInstance(waInstances2[0].name);
                    }
                    setShowSanitizeModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}
                >
                  <ShieldCheck size={13} /> Validar WhatsApp ({selectedContacts.length})
                </button>
                <button onClick={() => setShowMoveGroup(true)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}>
                  <ArrowRight size={13} /> Mover para Grupo
                </button>
                <button onClick={handleDeleteSelected} className="btn btn-danger" style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}>
                  <Trash2 size={13} /> Excluir ({selectedContacts.length})
                </button>
                <button onClick={() => setSelectedContacts([])} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem', marginLeft: 'auto' }}>
                  <X size={13} /> Limpar seleção
                </button>
              </div>
            )}
          </div>

          {/* ── Tabela de Contatos ────────────────────────────────────────────── */}
          <div className="card-glass" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ width: 32, height: 32, border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                <span>Carregando contatos...</span>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div style={{ padding: '5rem', textAlign: 'center', color: '#6b7280' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                }}>
                  <Users size={32} style={{ strokeWidth: 1.5 }} />
                </div>
                <p style={{ fontWeight: 600, fontSize: '1rem', color: '#e5e7eb' }}>Nenhum contato encontrado</p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  {debouncedSearch || selectedGroupFilter || statusFilter
                    ? 'Tente ajustar os filtros ou a busca.'
                    : 'Comece criando um contato ou importando uma lista.'}
                </p>
                {!debouncedSearch && !selectedGroupFilter && !statusFilter && (
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                    <button onClick={() => setShowAddContact(true)} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                      <Plus size={14} /> Novo Contato
                    </button>
                    <button onClick={() => setShowImportCSV(true)} className="btn btn-secondary" style={{ fontSize: '0.875rem' }}>
                      <Upload size={14} /> Importar CSV
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40, paddingRight: 0 }}>
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={filteredContacts.length > 0 && filteredContacts.every(c => selectedContacts.includes(c.id))}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th>Contato</th>
                      <th>Telefone</th>
                      <th>Grupo</th>
                      <th>Tags</th>
                      <th style={{ width: 90, textAlign: 'center' }}>Status</th>
                      <th style={{ width: 90, textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map(contact => (
                      <tr key={contact.id} style={{ transition: 'background 0.15s' }}>
                        <td style={{ paddingRight: 0 }}>
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(contact.id)}
                            onChange={() => handleSelectContact(contact.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <Avatar name={contact.name} size={34} />
                            <div>
                              <p style={{ fontWeight: 500, fontSize: '0.875rem', lineHeight: 1.2 }}>
                                {contact.name || <span style={{ color: '#6b7280', fontStyle: 'italic', fontWeight: 400 }}>Sem nome</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.825rem', color: '#9ca3af' }}>{contact.phone}</td>
                        <td>
                          {contact.group ? (
                            <span className="badge badge-info" style={{ cursor: 'pointer' }} onClick={() => setSelectedGroupFilter(contact.groupId || '')}>
                              {contact.group.name}
                            </span>
                          ) : (
                            <span style={{ color: '#4b5563', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', maxWidth: 200 }}>
                            {contact.tags.slice(0, 3).map((tag, i) => <TagBadge key={i} tag={tag} />)}
                            {contact.tags.length > 3 && (
                              <span style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center' }}>
                                +{contact.tags.length - 3}
                              </span>
                            )}
                            {contact.tags.length === 0 && <span style={{ color: '#4b5563', fontSize: '0.75rem' }}>—</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleToggleOptOut(contact)}
                            title={contact.optOut ? 'Clique para reativar' : 'Clique para marcar opt-out'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              fontSize: '0.7rem', padding: '0.2rem 0.55rem',
                              borderRadius: 999,
                              border: contact.optOut ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(34,197,94,0.4)',
                              background: contact.optOut ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                              color: contact.optOut ? '#ef4444' : '#22c55e',
                              cursor: 'pointer', fontWeight: 600,
                              transition: 'all 0.2s',
                            }}
                          >
                            {contact.optOut ? <BellOff size={11} /> : <Bell size={11} />}
                            {contact.optOut ? 'Opt-Out' : 'Ativo'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                            <button
                              onClick={() => openEditContact(contact)}
                              style={{ color: '#3b82f6', cursor: 'pointer', padding: '0.3rem', background: 'none', border: 'none', borderRadius: 6, transition: 'background 0.15s' }}
                              title="Editar / Ver detalhes"
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.1)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteContact(contact.id, contact.name)}
                              style={{ color: '#ef4444', cursor: 'pointer', padding: '0.3rem', background: 'none', border: 'none', borderRadius: 6, transition: 'background 0.15s' }}
                              title="Excluir Contato"
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Paginação */}
                {totalContacts > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.875rem 1.5rem', borderTop: '1px solid var(--border)',
                    backgroundColor: 'rgba(255,255,255,0.01)', flexWrap: 'wrap', gap: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8125rem', color: '#9ca3af' }}>
                      <span>
                        Mostrando <strong>{((page - 1) * limit + 1).toLocaleString()}</strong>{' '}
                        a <strong>{Math.min(page * limit, totalContacts).toLocaleString()}</strong>{' '}
                        de <strong>{totalContacts.toLocaleString()}</strong>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                        Exibir:
                        <select
                          value={limit}
                          onChange={e => setLimit(Number(e.target.value))}
                          className="input-control"
                          style={{ padding: '0.2rem 0.5rem', width: 'auto', fontSize: '0.8125rem', height: 'auto', background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: 'white', borderRadius: 4 }}
                        >
                          {[50, 100, 200, 500, 1000, 5000].map(v => (
                            <option key={v} value={v} style={{ background: '#121318' }}>{v.toLocaleString()}</option>
                          ))}
                        </select>
                      </span>
                    </div>
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.8125rem' }}
                          onClick={() => setPage(p => Math.max(p - 1, 1))}
                          disabled={page === 1 || loading}
                        >Anterior</button>
                        <span style={{ fontSize: '0.8125rem', color: '#e5e7eb' }}>
                          Página <strong>{page}</strong> de <strong>{totalPages}</strong>
                        </span>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.8125rem' }}
                          onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                          disabled={page === totalPages || loading}
                        >Próxima</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ABA: GRUPOS                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'groups' && (
        <div className="card-glass" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Grupos de Contatos</h3>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>{groups.length} grupos criados</p>
            </div>
            <button onClick={() => setShowAddGroup(true)} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
              <FolderPlus size={14} /> Novo Grupo
            </button>
          </div>

          {groups.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>
              <FolderOpen size={40} style={{ marginBottom: '1rem', strokeWidth: 1.5, opacity: 0.5 }} />
              <p style={{ fontWeight: 600 }}>Nenhum grupo criado</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Crie grupos para organizar seus contatos.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1px', background: 'var(--border)' }}>
              {groups.map(group => {
                const color = hashColor(group.name);
                return (
                  <div
                    key={group.id}
                    style={{
                      padding: '1.25rem 1.5rem',
                      background: 'var(--bg-secondary)',
                      display: 'flex', flexDirection: 'column', gap: '0.5rem',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: `${color}15`, border: `1.5px solid ${color}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color, flexShrink: 0, fontSize: '1rem', fontWeight: 700,
                        }}>
                          {group.name[0]?.toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {group.name}
                          </p>
                          {group.description && (
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {group.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        <button
                          onClick={() => openEditGroup(group)}
                          style={{ color: '#3b82f6', padding: '0.25rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                          title="Editar grupo"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group)}
                          style={{ color: '#ef4444', padding: '0.25rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                          title="Excluir grupo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Users size={12} />
                        {(group._count?.contacts || 0).toLocaleString()} contatos
                      </span>
                      <button
                        onClick={() => { setSelectedGroupFilter(group.id); setActiveTab('contacts'); }}
                        style={{
                          fontSize: '0.75rem', color: color, padding: '0.2rem 0.6rem',
                          background: `${color}10`, border: `1px solid ${color}25`,
                          borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                        }}
                      >
                        <ArrowRight size={11} /> Ver contatos
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* Modal: Confirmação Elegante */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* Modal: Novo Contato */}
      {showAddContact && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Novo Contato</h3>
              <X className="modal-close" onClick={() => { setShowAddContact(false); setPhoneCheckResult(null); setWaCheckResult(null); }} />
            </div>
            <form onSubmit={handleAddContactSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome (Opcional)</label>
                  <input type="text" className="input-control" placeholder="Nome do cliente"
                    value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone (Obrigatório)</label>
                  <input
                    type="text" className="input-control"
                    placeholder="DDI + DDD + Número (ex: 5511999999999)"
                    value={newContact.phone}
                    onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                    required
                    style={{
                      borderColor: phoneCheckResult?.exists
                        ? 'rgba(234,179,8,0.6)'
                        : phoneCheckResult && !phoneCheckResult.exists
                          ? 'rgba(34,197,94,0.5)' : undefined
                    }}
                  />
                  {phoneCheckLoading && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#9ca3af', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Verificando número...
                    </div>
                  )}
                  {!phoneCheckLoading && phoneCheckResult?.exists && (
                    <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.9rem', borderRadius: 8, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', fontSize: '0.8rem', color: '#fbbf24' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        <AlertCircle size={13} /> Número já cadastrado
                      </div>
                      <div style={{ color: '#9ca3af', lineHeight: 1.5 }}>
                        Nome: <strong style={{ color: '#e5e7eb' }}>{phoneCheckResult.contact?.name || 'Sem nome'}</strong>
                        {phoneCheckResult.contact?.group && <span> · Grupo: <strong style={{ color: '#e5e7eb' }}>{phoneCheckResult.contact.group.name}</strong></span>}
                      </div>
                      <div style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: '#6b7280' }}>
                        Salvar irá <strong style={{ color: '#fbbf24' }}>atualizar</strong> o contato existente.
                      </div>
                    </div>
                  )}
                  {!phoneCheckLoading && phoneCheckResult && !phoneCheckResult.exists && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Check size={12} /> Número disponível
                    </div>
                  )}
                </div>

                {/* Verificar no WhatsApp */}
                {waInstances2.length > 0 && newContact.phone.replace(/\D/g, '').length >= 8 && (
                  <div className="form-group">
                    <label className="form-label">Verificar no WhatsApp</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        className="input-control"
                        value={selectedWAInstance}
                        onChange={e => { setSelectedWAInstance(e.target.value); setWaCheckResult(null); }}
                        style={{ flex: 1 }}
                      >
                        <option value="">Selecionar instância...</option>
                        {waInstances2.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                      </select>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleCheckWhatsApp(newContact.phone)}
                        disabled={!selectedWAInstance || waCheckLoading}
                        style={{ flexShrink: 0, fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                      >
                        {waCheckLoading ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Smartphone size={13} />}
                        {waCheckLoading ? 'Verificando...' : 'Verificar'}
                      </button>
                    </div>
                    {waCheckResult && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: waCheckResult.exists ? '#22c55e' : '#ef4444' }}>
                        {waCheckResult.exists ? <Check size={13} /> : <X size={13} />}
                        {waCheckResult.exists
                          ? `✅ Número ativo no WhatsApp${waCheckResult.name ? ` (${waCheckResult.name})` : ''}`
                          : '❌ Número não encontrado no WhatsApp'}
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Grupo</label>
                  <select className="input-control" value={newContact.groupId} onChange={e => setNewContact({ ...newContact, groupId: e.target.value })}>
                    <option value="">Sem grupo</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tags <span style={{ color: '#6b7280', fontWeight: 400 }}>(separadas por vírgula)</span></label>
                  <input type="text" className="input-control" placeholder="vip, cliente, novo"
                    value={newContact.tags} onChange={e => setNewContact({ ...newContact, tags: e.target.value })} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                    <Toggle checked={newContact.optOut} onChange={() => setNewContact({ ...newContact, optOut: !newContact.optOut })} />
                    <span style={{ fontSize: '0.875rem', color: newContact.optOut ? '#ef4444' : '#9ca3af' }}>
                      {newContact.optOut ? <><BellOff size={13} style={{ display: 'inline', marginRight: '0.3rem' }} />Opt-Out (não receberá mensagens)</> : <><Bell size={13} style={{ display: 'inline', marginRight: '0.3rem' }} />Ativo</>}
                    </span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddContact(false); setPhoneCheckResult(null); setWaCheckResult(null); }} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar Contato'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Contato (com abas Info / Histórico / Notas) */}
      {showEditContact && editingContact && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Avatar name={editingContact.name} size={38} />
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>{editingContact.name || 'Sem nome'}</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', fontFamily: 'monospace' }}>{editingContact.phone}</p>
                </div>
              </div>
              <X className="modal-close" onClick={() => { setShowEditContact(false); setEditingContact(null); }} />
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 1.5rem', gap: '0.25rem' }}>
              {([
                { key: 'info', label: 'Informações', icon: <FileText size={13} /> },
                { key: 'history', label: 'Histórico', icon: <Clock size={13} /> },
                { key: 'notes', label: 'Notas', icon: <StickyNote size={13} /> },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setContactDetailTab(tab.key);
                    if (tab.key === 'history' || tab.key === 'notes') {
                      loadContactHistory(editingContact.id);
                    }
                  }}
                  style={{
                    padding: '0.6rem 1rem',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '0.825rem', fontWeight: contactDetailTab === tab.key ? 600 : 400,
                    color: contactDetailTab === tab.key ? '#25d366' : '#6b7280',
                    borderBottom: contactDetailTab === tab.key ? '2px solid #25d366' : '2px solid transparent',
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    transition: 'color 0.2s',
                    marginBottom: '-1px',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Aba: Informações */}
            {contactDetailTab === 'info' && (
              <form onSubmit={handleEditContactSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">Nome (Opcional)</label>
                    <input type="text" className="input-control" placeholder="Nome do cliente"
                      value={editingContact.name || ''} onChange={e => setEditingContact({ ...editingContact, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Telefone (Obrigatório)</label>
                    <input type="text" className="input-control"
                      value={editingContact.phone}
                      onChange={e => setEditingContact({ ...editingContact, phone: e.target.value })}
                      required />
                  </div>

                  {/* Verificar WA no edit */}
                  {waInstances2.length > 0 && (
                    <div className="form-group">
                      <label className="form-label">Verificar no WhatsApp</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select className="input-control" value={selectedWAInstance} onChange={e => { setSelectedWAInstance(e.target.value); setWaCheckResult(null); }} style={{ flex: 1 }}>
                          <option value="">Selecionar instância...</option>
                          {waInstances2.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                        </select>
                        <button type="button" className="btn btn-secondary" onClick={() => handleCheckWhatsApp(editingContact.phone)}
                          disabled={!selectedWAInstance || waCheckLoading}
                          style={{ flexShrink: 0, fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                          {waCheckLoading ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Smartphone size={13} />}
                          Verificar
                        </button>
                      </div>
                      {waCheckResult && (
                        <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: waCheckResult.exists ? '#22c55e' : '#ef4444' }}>
                          {waCheckResult.exists ? <Check size={13} /> : <X size={13} />}
                          {waCheckResult.exists ? `✅ Ativo no WhatsApp${waCheckResult.name ? ` (${waCheckResult.name})` : ''}` : '❌ Número não encontrado'}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Grupo</label>
                    <select className="input-control" value={editingContact.groupId || ''} onChange={e => setEditingContact({ ...editingContact, groupId: e.target.value || null })}>
                      <option value="">Sem grupo</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tags</label>
                    <input type="text" className="input-control" placeholder="vip, cliente, novo"
                      value={Array.isArray(editingContact.tags) ? editingContact.tags.join(', ') : (editingContact.tags || '')}
                      onChange={e => setEditingContact({ ...editingContact, tags: e.target.value.split(',').map(t => t.trim()) })} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                      <Toggle checked={editingContact.optOut} onChange={() => setEditingContact({ ...editingContact, optOut: !editingContact.optOut })} />
                      <span style={{ fontSize: '0.875rem', color: editingContact.optOut ? '#ef4444' : '#9ca3af' }}>
                        {editingContact.optOut
                          ? <><BellOff size={13} style={{ display: 'inline', marginRight: '0.3rem' }} />Opt-Out ativo</>
                          : <><Bell size={13} style={{ display: 'inline', marginRight: '0.3rem' }} />Ativo</>}
                      </span>
                    </label>
                    {editingContact.optOut && editingContact.optOutAt && (
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.3rem', marginLeft: '3.5rem' }}>
                        Opt-out em {new Date(editingContact.optOutAt).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowEditContact(false); setEditingContact(null); }} disabled={isSubmitting}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar Alterações'}</button>
                </div>
              </form>
            )}

            {/* Aba: Histórico */}
            {contactDetailTab === 'history' && (
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {contactHistory === null ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                    <div style={{ width: 28, height: 28, border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                    Carregando histórico...
                  </div>
                ) : contactHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                    <MessageSquare size={32} style={{ marginBottom: '1rem', opacity: 0.4, strokeWidth: 1.5 }} />
                    <p style={{ fontWeight: 500 }}>Nenhuma mensagem enviada</p>
                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Este contato ainda não recebeu mensagens de campanha.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {contactHistory.map((log: any) => {
                      const statusColor = log.status === 'READ' ? '#22c55e' : log.status === 'DELIVERED' ? '#3b82f6' : log.status === 'SENT' ? '#6b7280' : '#ef4444';
                      return (
                        <div key={log.id} style={{ padding: '0.75rem 1rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                          <div>
                            <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{log.campaign?.name || 'Campanha'}</p>
                            {log.sentAt && <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.2rem' }}>{timeAgo(log.sentAt)}</p>}
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor, background: `${statusColor}15`, padding: '0.2rem 0.6rem', borderRadius: 999, flexShrink: 0 }}>
                            {log.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Aba: Notas */}
            {contactDetailTab === 'notes' && (
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StickyNote size={14} /> Anotações sobre este contato
                  </label>
                  <textarea
                    className="input-control"
                    rows={8}
                    placeholder="Ex: Cliente interessado em produto X, prefere contato pela manhã, lembrar de enviar proposta em outubro..."
                    value={contactNotes}
                    onChange={e => setContactNotes(e.target.value)}
                    style={{ resize: 'vertical', lineHeight: 1.6 }}
                  />
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                    As notas são privadas e só visíveis aqui. Use para lembretes, preferências e histórico de conversas.
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowEditContact(false); setEditingContact(null); }}>Fechar</button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? 'Salvando...' : <><Check size={14} /> Salvar Notas</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Criar Grupo */}
      {showAddGroup && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Criar Grupo de Contatos</h3>
              <X className="modal-close" onClick={() => setShowAddGroup(false)} />
            </div>
            <form onSubmit={handleAddGroupSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome do Grupo</label>
                  <input type="text" className="input-control" placeholder="Ex: Clientes VIP"
                    value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição <span style={{ color: '#6b7280', fontWeight: 400 }}>(opcional)</span></label>
                  <textarea className="input-control" rows={2} placeholder="Descrição curta para controle interno"
                    value={newGroup.description} onChange={e => setNewGroup({ ...newGroup, description: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddGroup(false)} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Criando...' : 'Criar Grupo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Grupo */}
      {showEditGroup && editingGroup && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Editar Grupo</h3>
              <X className="modal-close" onClick={() => { setShowEditGroup(false); setEditingGroup(null); }} />
            </div>
            <form onSubmit={handleEditGroupSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome do Grupo</label>
                  <input type="text" className="input-control" placeholder="Nome do grupo"
                    value={editGroupForm.name} onChange={e => setEditGroupForm({ ...editGroupForm, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <textarea className="input-control" rows={2} placeholder="Descrição do grupo"
                    value={editGroupForm.description} onChange={e => setEditGroupForm({ ...editGroupForm, description: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditGroup(false); setEditingGroup(null); }} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Mover Grupo Bulk */}
      {showMoveGroup && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Mover para Grupo</h3>
              <X className="modal-close" onClick={() => setShowMoveGroup(false)} />
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1rem' }}>
                Mover <strong style={{ color: '#e5e7eb' }}>{selectedContacts.length} contatos</strong> selecionados para:
              </p>
              <div className="form-group">
                <label className="form-label">Grupo de destino</label>
                <select className="input-control" value={moveTargetGroupId} onChange={e => setMoveTargetGroupId(e.target.value)}>
                  <option value="">Remover do grupo (sem grupo)</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g._count?.contacts || 0})</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMoveGroup(false)} disabled={isSubmitting}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleMoveGroupSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Movendo...' : <><ArrowRight size={14} /> Mover Contatos</>}
              </button>
            </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.8125rem' }}>
                    <AlertCircle size={16} /><span>{csvError}</span>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Salvar Contatos no Grupo</label>
                  <select className="input-control" value={importGroupId} onChange={e => setImportGroupId(e.target.value)}>
                    <option value="">Sem grupo (Contatos Soltos)</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                {importProgress ? (
                  <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                      <span>Enviando contatos...</span>
                      <strong>{importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()} ({Math.round((importProgress.current / importProgress.total) * 100)}%)</strong>
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(importProgress.current / importProgress.total) * 100}%`, background: '#25d366', borderRadius: 4, transition: 'width 0.2s ease-out' }} />
                    </div>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Selecione o arquivo CSV</label>
                    <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleCSVChange}
                      style={{ border: '1px dashed var(--border)', padding: '1.5rem', borderRadius: 8, cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.01)', width: '100%' }} required />
                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4 }}>
                      <p style={{ fontWeight: 600 }}>Formato esperado:</p>
                      <p style={{ fontFamily: 'monospace', color: '#25d366', marginTop: '0.25rem' }}>Nome Cliente,5511999999999,tag1|tag2</p>
                      <p style={{ marginTop: '0.5rem' }}>Suporta também colunas com cabeçalho (saved name, phone number, group name, etc.)</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportCSV(false)} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || !csvFileContent}>
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
          <div className="modal-content" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#ef4444' }}>Excluir Contatos em Massa</h3>
              <X className="modal-close" onClick={() => { setShowBulkDelete(false); setBulkDeleteError(''); setBulkDeleteConfirmText(''); }} />
            </div>
            <form onSubmit={handleBulkDeleteSubmit}>
              <div className="modal-body">
                {bulkDeleteError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.8125rem' }}>
                    <AlertCircle size={16} /><span>{bulkDeleteError}</span>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>O que deseja excluir?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                    {[
                      { value: 'clear_all', label: `Excluir TODOS os contatos (${totalContacts.toLocaleString()})` },
                      { value: 'delete_by_group', label: 'Excluir contatos de um Grupo específico' },
                      { value: 'delete_ungrouped', label: 'Excluir contatos Avulsos (sem grupo)' },
                    ].map(opt => (
                      <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'white' }}>
                        <input type="radio" name="bulkDeleteAction" checked={bulkDeleteAction === opt.value as any} onChange={() => setBulkDeleteAction(opt.value as any)} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                {bulkDeleteAction === 'delete_by_group' && (
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label">Selecione o Grupo</label>
                    <select className="input-control" value={bulkDeleteGroupId} onChange={e => setBulkDeleteGroupId(e.target.value)} required>
                      <option value="">Selecione...</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g._count?.contacts || 0})</option>)}
                    </select>
                  </div>
                )}
                <div style={{ marginTop: '1.5rem', padding: '0.75rem', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.4 }}>
                  <p style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>⚠️ ATENÇÃO: ESTA AÇÃO É IRREVERSÍVEL!</p>
                  Todos os dados e histórico de mensagens associados a estes contatos serão removidos permanentemente.
                </div>
                <div className="form-group" style={{ marginTop: '1.25rem' }}>
                  <label className="form-label">Confirme digitando <strong>EXCLUIR</strong> abaixo:</label>
                  <input type="text" className="input-control" placeholder="EXCLUIR"
                    style={{ borderColor: bulkDeleteConfirmText === 'EXCLUIR' ? '#25d366' : 'var(--border)' }}
                    value={bulkDeleteConfirmText} onChange={e => setBulkDeleteConfirmText(e.target.value)} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowBulkDelete(false); setBulkDeleteError(''); setBulkDeleteConfirmText(''); }} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-danger" disabled={isSubmitting || bulkDeleteConfirmText !== 'EXCLUIR'}>
                  {isSubmitting ? 'Excluindo...' : 'Confirmar Exclusão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Análise de Duplicatas */}
      {showDuplicates && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={18} color="#6366f1" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Análise de Duplicatas</h3>
                  {!loadingDuplicates && (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                      {duplicatesTotal > 0 ? `${duplicatesTotal} grupos com possíveis duplicatas` : 'Nenhuma duplicata encontrada'}
                    </p>
                  )}
                </div>
              </div>
              <X className="modal-close" onClick={() => setShowDuplicates(false)} />
            </div>
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {loadingDuplicates ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,0.15)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                  Analisando contatos...
                </div>
              ) : duplicates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <Check size={40} color="#22c55e" style={{ marginBottom: '1rem' }} />
                  <p style={{ fontWeight: 600, color: '#22c55e' }}>Nenhuma duplicata encontrada!</p>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Todos os nomes de contatos são únicos.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {duplicates.map((group, gi) => (
                    <div key={gi} style={{ padding: '1rem', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem', color: '#a5b4fc' }}>
                        <Merge size={13} style={{ display: 'inline', marginRight: '0.4rem' }} />
                        "{group.name}" — {group.contacts.length} contatos similares
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {group.contacts.map((c) => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                              <Avatar name={c.name} size={28} />
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontWeight: 500, fontSize: '0.825rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                                <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{c.phone}</p>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                              {c.group && <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', borderRadius: 999 }}>{c.group.name}</span>}
                              <button
                                onClick={() => handleDeleteDuplicate(c.id)}
                                style={{ color: '#ef4444', padding: '0.2rem 0.5rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              >
                                <Trash2 size={11} /> Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={fetchDuplicates} disabled={loadingDuplicates}>
                <RefreshCw size={13} /> Reanalisar
              </button>
              <button className="btn btn-primary" onClick={() => setShowDuplicates(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Importar do WhatsApp */}
      {showImportWA && (
        <div className="modal-overlay" onClick={() => !waLoading && setShowImportWA(false)}>
          <div className="modal-content" style={{ maxWidth: 580, width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(37,211,102,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(37,211,102,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={18} color="#25d366" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Importar do WhatsApp</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
                    {waStep === 1 && 'Passo 1 de 3 — Selecionar instância'}
                    {waStep === 2 && 'Passo 2 de 3 — Selecionar grupos'}
                    {waStep === 3 && 'Passo 3 de 3 — Importação'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowImportWA(false)} className="btn btn-secondary" style={{ padding: '0.25rem', minWidth: 0 }} disabled={waLoading}><X size={16} /></button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 3, marginBottom: '1.5rem', marginTop: '0.25rem' }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ flex: 1, height: 3, background: waStep >= s ? '#25d366' : 'rgba(255,255,255,0.1)', borderRadius: 2, transition: 'background 0.3s' }} />
              ))}
            </div>

            <div style={{ padding: '0 1.5rem' }}>
              {waError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: '1rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />{waError}
                </div>
              )}

              {waStep === 1 && (
                <div>
                  {waLoading ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#6b7280' }}>
                      <div style={{ width: 32, height: 32, border: '3px solid rgba(37,211,102,0.15)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>Buscando instâncias conectadas...</p>
                    </div>
                  ) : waInstances.length === 0 && !waError ? (
                    <p style={{ color: '#6b7280', textAlign: 'center', padding: '1.5rem 0' }}>Nenhuma instância conectada.</p>
                  ) : (
                    <div>
                      <label className="form-label">Instância conectada</label>
                      <select id="wa-instance-select" className="input-control" value={waSelectedInstance} onChange={e => { setWaSelectedInstance(e.target.value); setWaError(''); }}>
                        <option value="">Selecione uma instância...</option>
                        {waInstances.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                      </select>
                      <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.5rem' }}>
                        Apenas instâncias com status <strong style={{ color: '#25d366' }}>CONECTADO</strong> são exibidas.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {waStep === 2 && (
                <div>
                  {waLoading ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#6b7280' }}>
                      <div style={{ width: 32, height: 32, border: '3px solid rgba(37,211,102,0.15)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                      <p style={{ margin: 0 }}>Carregando grupos...</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>Grupos ({waGroups.length})</label>
                        <button type="button" onClick={toggleAllWAGroups} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>
                          {waSelectedGroupJids.length === waGroups.length ? 'Desmarcar todos' : 'Selecionar todos'}
                        </button>
                      </div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '1rem' }}>
                        {waGroups.map(g => {
                          const selected = waSelectedGroupJids.includes(g.id);
                          return (
                            <div key={g.id} onClick={() => toggleWAGroup(g.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: selected ? 'rgba(37,211,102,0.06)' : 'transparent', transition: 'background 0.15s' }}>
                              {selected ? <CheckSquare size={16} color="#25d366" style={{ flexShrink: 0 }} /> : <Square size={16} color="#4b5563" style={{ flexShrink: 0 }} />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.subject}</p>
                                {g.desc && <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.desc}</p>}
                              </div>
                              {g.size !== null && <span style={{ fontSize: '0.75rem', color: '#6b7280', flexShrink: 0 }}>{g.size} membros</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <label className="form-label">Grupo de contatos destino</label>
                        <select id="wa-target-group-select" className="input-control" value={waTargetGroupId} onChange={e => { setWaTargetGroupId(e.target.value); setWaNewGroupName(''); setWaError(''); }} style={{ marginBottom: '0.5rem' }}>
                          <option value="">— Criar novo grupo —</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        {!waTargetGroupId && (
                          <input id="wa-new-group-name" type="text" className="input-control" placeholder="Nome do novo grupo de contatos..."
                            value={waNewGroupName} onChange={e => { setWaNewGroupName(e.target.value); setWaError(''); }} />
                        )}
                      </div>
                      {waSelectedGroupJids.length > 0 && (
                        <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.9rem', background: 'rgba(37,211,102,0.07)', borderRadius: 8, fontSize: '0.82rem', color: '#9ca3af' }}>
                          <strong style={{ color: '#25d366' }}>{waSelectedGroupJids.length}</strong> grupo(s) selecionado(s)
                          {waEstimatedContacts > 0 && <> · ~<strong style={{ color: '#25d366' }}>{waEstimatedContacts}</strong> membros estimados</>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {waStep === 3 && (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  {waLoading ? (
                    <>
                      <div style={{ width: 48, height: 48, border: '4px solid rgba(37,211,102,0.15)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
                      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Importando contatos...</p>
                      <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>Isso pode levar alguns segundos para grupos grandes.</p>
                    </>
                  ) : waResult ? (
                    <>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(37,211,102,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                        <Check size={28} color="#25d366" />
                      </div>
                      <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Importação concluída!</p>
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Novos contatos', value: waResult.imported, color: '#25d366' },
                          { label: 'Atualizados', value: waResult.updated, color: '#60a5fa' },
                          { label: 'Total processado', value: waResult.total, color: '#9ca3af' },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign: 'center', padding: '0.75rem 1.25rem', background: `${s.color}0D`, borderRadius: 10 }}>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
                            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
              {waStep === 1 && (
                <>
                  <button className="btn btn-secondary" onClick={() => setShowImportWA(false)} disabled={waLoading}>Cancelar</button>
                  <button id="wa-btn-next-step1" className="btn btn-primary" onClick={fetchWAGroups} disabled={!waSelectedInstance || waLoading} style={{ background: '#25d366', borderColor: '#25d366' }}>
                    {waLoading ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={15} />}
                    Buscar Grupos
                  </button>
                </>
              )}
              {waStep === 2 && !waLoading && (
                <>
                  <button className="btn btn-secondary" onClick={() => setWaStep(1)}>← Voltar</button>
                  <button id="wa-btn-import" className="btn btn-primary" onClick={handleImportWASubmit}
                    disabled={waSelectedGroupJids.length === 0 || (!waTargetGroupId && !waNewGroupName.trim())}
                    style={{ background: '#25d366', borderColor: '#25d366' }}>
                    <Smartphone size={15} />
                    Importar {waSelectedGroupJids.length > 0 ? `(${waSelectedGroupJids.length} grupo${waSelectedGroupJids.length > 1 ? 's' : ''})` : ''}
                  </button>
                </>
              )}
              {waStep === 3 && !waLoading && (
                <button className="btn btn-primary" onClick={() => setShowImportWA(false)} style={{ background: '#25d366', borderColor: '#25d366', width: '100%' }}>
                  <Check size={15} /> {waResult ? 'Ver Contatos' : 'Fechar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Higienizador / Validador de WhatsApp em Lote */}
      {showSanitizeModal && (
        <div className="modal-overlay" onClick={() => !sanitizeLoading && setShowSanitizeModal(false)}>
          <div className="modal-content" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={18} color="#10b981" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Higienizador de Base WhatsApp</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>Valide números e proteja seus disparos de banimento</p>
                </div>
              </div>
              <X className="modal-close" onClick={() => !sanitizeLoading && setShowSanitizeModal(false)} />
            </div>

            <div className="modal-body">
              {sanitizeError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: '1rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />{sanitizeError}
                </div>
              )}

              {sanitizeLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>
                  <div style={{ width: 44, height: 44, border: '4px solid rgba(16,185,129,0.15)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
                  <p style={{ fontWeight: 600, fontSize: '1rem', color: '#e5e7eb', marginBottom: '0.35rem' }}>Consultando a rede do WhatsApp...</p>
                  <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>Verificando números em lotes de 50. Por favor, aguarde.</p>
                </div>
              ) : sanitizeResult ? (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                      <Check size={26} color="#10b981" />
                    </div>
                    <p style={{ fontWeight: 700, fontSize: '1.1rem', color: '#e5e7eb', margin: 0 }}>Higienização Concluída!</p>
                    <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.25rem' }}>Sua base foi verificada diretamente na rede do WhatsApp.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ textAlign: 'center', padding: '0.85rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#e5e7eb' }}>{sanitizeResult.totalChecked}</p>
                      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0.2rem 0 0' }}>Total Verificado</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.85rem 0.5rem', background: 'rgba(16,185,129,0.08)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>
                      <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#10b981' }}>{sanitizeResult.validCount}</p>
                      <p style={{ fontSize: '0.72rem', color: '#10b981', margin: '0.2rem 0 0' }}>✅ Com WhatsApp</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.85rem 0.5rem', background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
                      <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#ef4444' }}>{sanitizeResult.invalidCount}</p>
                      <p style={{ fontSize: '0.72rem', color: '#ef4444', margin: '0.2rem 0 0' }}>❌ Sem WhatsApp</p>
                    </div>
                  </div>

                  {sanitizeResult.invalidCount > 0 && (
                    <div style={{ padding: '0.85rem 1rem', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#fbbf24', lineHeight: 1.5 }}>
                      🛡️ <strong>{sanitizeResult.invalidCount} contatos inválidos</strong> foram {sanitizeAction === 'delete' ? 'excluídos' : 'marcados com Opt-Out e tag sem-whatsapp'}. Seus disparos automáticos agora estão protegidos contra envios para esses números!
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Instância */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>1. Instância do WhatsApp para consulta</label>
                    <select
                      className="input-control"
                      value={sanitizeInstance}
                      onChange={e => { setSanitizeInstance(e.target.value); setSanitizeError(''); }}
                    >
                      <option value="">Selecione uma instância conectada...</option>
                      {waInstances2.map(i => (
                        <option key={i.name} value={i.name}>{i.name} (Conectado)</option>
                      ))}
                    </select>
                  </div>

                  {/* Escopo */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>2. Quais contatos você quer validar?</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="radio"
                          name="sanitizeScope"
                          checked={sanitizeScope === 'all'}
                          onChange={() => setSanitizeScope('all')}
                        />
                        Todos os contatos ativos ({stats?.active.toLocaleString() || 'base inteira'})
                      </label>

                      {selectedContacts.length > 0 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="radio"
                            name="sanitizeScope"
                            checked={sanitizeScope === 'selected'}
                            onChange={() => setSanitizeScope('selected')}
                          />
                          Apenas os contatos selecionados ({selectedContacts.length})
                        </label>
                      )}

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="radio"
                          name="sanitizeScope"
                          checked={sanitizeScope === 'group'}
                          onChange={() => setSanitizeScope('group')}
                        />
                        Contatos de um grupo específico
                      </label>
                    </div>

                    {sanitizeScope === 'group' && (
                      <select
                        className="input-control"
                        style={{ marginTop: '0.5rem' }}
                        value={sanitizeGroupId}
                        onChange={e => setSanitizeGroupId(e.target.value)}
                      >
                        <option value="">Selecione o grupo...</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name} ({g._count?.contacts || 0})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Ação para números sem WhatsApp */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>3. O que fazer com quem NÃO tiver WhatsApp?</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="radio"
                          name="sanitizeAction"
                          checked={sanitizeAction === 'tag_and_optout'}
                          onChange={() => setSanitizeAction('tag_and_optout')}
                        />
                        <span><strong style={{ color: '#10b981' }}>Marcar como Opt-Out + Tag "sem-whatsapp"</strong> (Recomendado — impede disparos)</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="radio"
                          name="sanitizeAction"
                          checked={sanitizeAction === 'tag'}
                          onChange={() => setSanitizeAction('tag')}
                        />
                        <span>Apenas adicionar tag "sem-whatsapp"</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="radio"
                          name="sanitizeAction"
                          checked={sanitizeAction === 'delete'}
                          onChange={() => setSanitizeAction('delete')}
                        />
                        <span style={{ color: '#ef4444' }}>Excluir contatos sem WhatsApp permanentemente</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {sanitizeResult ? (
                <button
                  className="btn btn-primary"
                  onClick={() => { setShowSanitizeModal(false); setSanitizeResult(null); }}
                  style={{ width: '100%', background: '#10b981', borderColor: '#10b981' }}
                >
                  <Check size={15} /> Concluir e Ver Contatos
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowSanitizeModal(false)}
                    disabled={sanitizeLoading}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSanitizeSubmit}
                    disabled={sanitizeLoading || !sanitizeInstance}
                    style={{ background: '#10b981', borderColor: '#10b981' }}
                  >
                    <ShieldCheck size={15} /> Iniciar Validação
                  </button>
                </>
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
      `}</style>
    </AppLayout>
  );
}

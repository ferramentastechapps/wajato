'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Plus,
  Trash2,
  Edit,
  X,
  Search,
  Check,
  AlertTriangle,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Subscription {
  id: string;
  phone: string;
  panel: string;
  username: string;
  planName?: string | null;
  connections?: number | null;
  expiresAt: string;
  payUrl?: string | null;
  status: string;
  warnedAt?: string | null;
  contact?: { id: string; name?: string | null; phone: string } | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  trial: 'Teste',
  active: 'Ativo',
  expired: 'Vencido',
};

const STATUS_BADGE: Record<string, string> = {
  trial: 'badge',
  active: 'badge badge-success',
  expired: 'badge badge-error',
};

function formatDateBR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM = {
  phone: '',
  panel: 'painel_plus',
  username: '',
  planName: '',
  connections: '',
  expiresAt: '',
  payUrl: '',
  status: 'active',
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Subscription | null>(null);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/subscriptions');
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const filtered = subscriptions.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.phone.includes(q) ||
      s.username.toLowerCase().includes(q) ||
      (s.planName || '').toLowerCase().includes(q) ||
      (s.contact?.name || '').toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEdit = (sub: Subscription) => {
    setEditing(sub);
    setForm({
      phone: sub.phone,
      panel: sub.panel,
      username: sub.username,
      planName: sub.planName || '',
      connections: sub.connections != null ? String(sub.connections) : '',
      expiresAt: toDatetimeLocal(sub.expiresAt),
      payUrl: sub.payUrl || '',
      status: sub.status,
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const payload = {
        phone: form.phone,
        panel: form.panel,
        username: form.username,
        planName: form.planName || null,
        connections: form.connections ? Number(form.connections) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        payUrl: form.payUrl || null,
        status: form.status,
      };
      const res = await fetch(
        editing ? `/api/subscriptions/${editing.id}` : '/api/subscriptions',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao salvar assinatura');
      setIsModalOpen(false);
      fetchSubscriptions();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar assinatura');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/subscriptions/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir assinatura');
      setConfirmDelete(null);
      fetchSubscriptions();
    } catch (err) {
      console.error(err);
    }
  };

  const expiringSoon = subscriptions.filter((s) => {
    if (s.status !== 'active') return false;
    const diff = new Date(s.expiresAt).getTime() - Date.now();
    return diff > 0 && diff <= 3 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <AppLayout title="Assinaturas">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarClock size={22} /> Assinaturas
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Controle de vencimentos da CineON nos dois painéis. Quem vence em 3 dias recebe o aviso no WhatsApp com o link de renovação.
            {expiringSoon > 0 && (
              <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                {' '}⚠️ {expiringSoon} {expiringSoon === 1 ? 'assinatura vence' : 'assinaturas vencem'} em até 3 dias.
              </span>
            )}
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Nova Assinatura
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por telefone, usuário ou plano..."
            className="input-control"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-control" style={{ width: 'auto' }}>
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="trial">Testes</option>
          <option value="expired">Vencidos</option>
        </select>
      </div>

      {loading ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          Carregando assinaturas...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>
          <CalendarClock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <p>Nenhuma assinatura encontrada.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Os testes gerados pelo agente aparecem aqui sozinhos. Cadastre os clientes que você criou na mão no painel.
          </p>
          <button onClick={openCreate} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            <Plus size={16} /> Cadastrar a primeira
          </button>
        </div>
      ) : (
        <div className="card-glass">
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Cliente / Telefone</th>
                  <th>Painel</th>
                  <th>Usuário</th>
                  <th>Plano</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Aviso enviado</th>
                  <th style={{ width: 90 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{sub.contact?.name || '—'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{sub.phone}</div>
                    </td>
                    <td>{sub.panel === 'painel_plus' ? 'Painel Plus' : 'SmartPlay'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{sub.username}</td>
                    <td>{sub.planName || '—'}{sub.connections ? ` (${sub.connections} ${sub.connections === 1 ? 'conexão' : 'conexões'})` : ''}</td>
                    <td>{formatDateBR(sub.expiresAt)}</td>
                    <td><span className={STATUS_BADGE[sub.status] || 'badge'}>{STATUS_LABELS[sub.status] || sub.status}</span></td>
                    <td style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      {sub.warnedAt ? formatDateBR(sub.warnedAt) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => openEdit(sub)} className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} title="Editar">
                          <Edit size={14} />
                        </button>
                        <button onClick={() => setConfirmDelete(sub)} className="btn btn-danger" style={{ padding: '0.4rem 0.6rem' }} title="Excluir">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '100%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CalendarClock size={18} /> {editing ? 'Editar Assinatura' : 'Nova Assinatura'}
              </h3>
              <X className="modal-close" onClick={() => setIsModalOpen(false)} />
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {errorMsg && (
                  <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', color: '#fca5a5', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={16} /> {errorMsg}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Telefone (WhatsApp) *</label>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5516999999999" className="input-control" required />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Painel *</label>
                    <select value={form.panel} onChange={(e) => setForm({ ...form, panel: e.target.value })} className="input-control">
                      <option value="painel_plus">Painel Plus</option>
                      <option value="smartplay">SmartPlay</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Usuário (login do painel) *</label>
                    <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ex.: 186936722" className="input-control" required />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Plano</label>
                    <input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} placeholder="ex.: Mensal 1 tela" className="input-control" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Conexões</label>
                    <input type="number" min={1} value={form.connections} onChange={(e) => setForm({ ...form, connections: e.target.value })} placeholder="1" className="input-control" />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Status *</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-control">
                      <option value="trial">Teste</option>
                      <option value="active">Ativo</option>
                      <option value="expired">Vencido</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Vencimento *</label>
                  <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="input-control" required />
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                    Só assinaturas <strong>Ativas</strong> recebem o aviso automático, 3 dias antes do vencimento. Para converter um teste em assinatura paga, mude o status para Ativo e ajuste o vencimento.
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.35rem' }}>Link de pagamento (renovação)</label>
                  <input value={form.payUrl} onChange={(e) => setForm({ ...form, payUrl: e.target.value })} placeholder="https://painelplus.site/#/checkout/..." className="input-control" />
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                    É o link que vai no aviso de vencimento. Pagar por ele renova o mesmo usuário no painel.
                  </p>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  <Check size={16} /> {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '450px', width: '100%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>Excluir assinatura?</h3>
              <X className="modal-close" onClick={() => setConfirmDelete(null)} />
            </div>
            <div className="modal-body" style={{ padding: '1.5rem' }}>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
                Excluir a assinatura de <strong>{confirmDelete.username}</strong> ({confirmDelete.phone})? Ela não receberá mais avisos de vencimento.
              </p>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={handleDelete} className="btn btn-danger">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

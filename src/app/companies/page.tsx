'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Plus,
  Trash2,
  Edit,
  Star,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShoppingBag,
  PhoneCall,
  Sparkles,
  Info,
  X,
  Send,
  Users,
  Search,
  FileSpreadsheet,
  Download,
  UploadCloud,
  FileText,
  Check,
  Layers,
  RefreshCw,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import {
  parseProductSpreadsheet,
  downloadSampleExcel,
  downloadSampleCSV,
} from '@/lib/product-catalog-parser';

interface Company {
  id: string;
  name: string;
  segment?: string | null;
  description: string;
  productsServices: string;
  faq?: string | null;
  policies?: string | null;
  contactInfo?: string | null;
  toneOfVoice?: string | null;
  aiInstructions?: string | null;
  isDefault: boolean;
  _count?: {
    campaigns: number;
    contacts: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'catalog' | 'faq' | 'ai'>('info');

  // Form states
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('');
  const [description, setDescription] = useState('');
  const [productsServices, setProductsServices] = useState('');
  const [faq, setFaq] = useState('');
  const [policies, setPolicies] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('Amigável, consultivo e prestativo');
  const [aiInstructions, setAiInstructions] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Spreadsheet import states
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch (err) {
      console.error('Erro ao buscar empresas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingCompany(null);
    setName('');
    setSegment('');
    setDescription('');
    setProductsServices('');
    setFaq('');
    setPolicies('');
    setContactInfo('');
    setToneOfVoice('Amigável, consultivo e prestativo');
    setAiInstructions('');
    setIsDefault(companies.length === 0);
    setActiveTab('info');
    setErrorMsg('');
    setImportStatus(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (comp: Company) => {
    setEditingCompany(comp);
    setName(comp.name);
    setSegment(comp.segment || '');
    setDescription(comp.description);
    setProductsServices(comp.productsServices);
    setFaq(comp.faq || '');
    setPolicies(comp.policies || '');
    setContactInfo(comp.contactInfo || '');
    setToneOfVoice(comp.toneOfVoice || 'Amigável, consultivo e prestativo');
    setAiInstructions(comp.aiInstructions || '');
    setIsDefault(comp.isDefault);
    setActiveTab('info');
    setErrorMsg('');
    setImportStatus(null);
    setIsModalOpen(true);
  };

  const handleSpreadsheetFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingFile(true);
    setImportStatus(null);

    try {
      const result = await parseProductSpreadsheet(file);

      if (importMode === 'replace' || !productsServices.trim()) {
        setProductsServices(result.text);
      } else {
        setProductsServices((prev) => `${prev}\n\n${result.text}`);
      }

      setImportStatus({
        success: true,
        message: `${result.count} item(ns) importado(s) da planilha com sucesso!`,
        count: result.count,
      });
    } catch (err: any) {
      setImportStatus({
        success: false,
        message: err.message || 'Erro ao processar arquivo de planilha.',
      });
    } finally {
      setIsImportingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('O nome da empresa é obrigatório');
      setActiveTab('info');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('A descrição institucional da empresa é obrigatória');
      setActiveTab('info');
      return;
    }
    if (!productsServices.trim()) {
      setErrorMsg('Os produtos, serviços e preços são obrigatórios para a IA responder aos clientes');
      setActiveTab('catalog');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name,
        segment: segment || null,
        description,
        productsServices,
        faq: faq || null,
        policies: policies || null,
        contactInfo: contactInfo || null,
        toneOfVoice: toneOfVoice || null,
        aiInstructions: aiInstructions || null,
        isDefault,
      };

      const url = editingCompany ? `/api/companies/${editingCompany.id}` : '/api/companies';
      const method = editingCompany ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchCompanies();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Erro ao salvar empresa');
      }
    } catch {
      setErrorMsg('Erro de conexão ao salvar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir a empresa "${name}"?`)) return;
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCompanies();
      } else {
        const data = await res.json();
        alert(`Erro: ${data.message}`);
      }
    } catch {
      alert('Erro de conexão ao excluir.');
    }
  };

  const handleSetDefault = async (comp: Company) => {
    if (comp.isDefault) return;
    try {
      const res = await fetch(`/api/companies/${comp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...comp, isDefault: true }),
      });
      if (res.ok) fetchCompanies();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredCompanies = companies.filter((c) => {
    const s = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      (c.segment && c.segment.toLowerCase().includes(s)) ||
      c.description.toLowerCase().includes(s)
    );
  });

  return (
    <AppLayout title="Empresas & Base de Conhecimento IA">
      {/* Header Actions & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', maxWidth: '400px', width: '100%' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              className="input-control"
              placeholder="Buscar empresas por nome, ramo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2.5rem', width: '100%', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <button onClick={handleOpenCreateModal} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Nova Empresa
        </button>
      </div>

      {loading ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando empresas e bases de conhecimento...</span>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>
          <Building2 size={48} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
          <p>{search ? 'Nenhuma empresa encontrada com este filtro.' : 'Nenhuma empresa cadastrada ainda.'}</p>
          <button onClick={handleOpenCreateModal} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Cadastrar Primeira Empresa
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {filteredCompanies.map((comp) => (
            <div
              key={comp.id}
              className="card-glass"
              style={{
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: comp.isDefault ? '1px solid rgba(37, 211, 102, 0.35)' : '1px solid var(--border)',
                background: comp.isDefault ? 'linear-gradient(180deg, rgba(37, 211, 102, 0.04) 0%, rgba(0,0,0,0.2) 100%)' : undefined,
                boxShadow: comp.isDefault ? '0 8px 24px rgba(37, 211, 102, 0.08)' : undefined,
              }}
            >
              <div>
                {/* Header Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>{comp.name}</h3>
                      {comp.isDefault && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '12px',
                            background: 'rgba(37, 211, 102, 0.15)',
                            color: '#25d366',
                            border: '1px solid rgba(37, 211, 102, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                          }}
                        >
                          <Star size={10} style={{ fill: '#25d366' }} /> Padrão
                        </span>
                      )}
                    </div>
                    {comp.segment && (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem', display: 'block' }}>
                        {comp.segment}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {!comp.isDefault && (
                      <button
                        title="Tornar empresa padrão"
                        onClick={() => handleSetDefault(comp)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.3rem' }}
                      >
                        <Star size={15} />
                      </button>
                    )}
                    <button
                      title="Editar empresa"
                      onClick={() => handleOpenEditModal(comp)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.3rem' }}
                    >
                      <Edit size={15} />
                    </button>
                    <button
                      title="Excluir empresa"
                      onClick={() => handleDelete(comp.id, comp.name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.3rem' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Descrição */}
                <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45, marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {comp.description}
                </p>

                {/* Metadados e Conhecimento Cadastrado */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.72rem' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <ShoppingBag size={12} color="#38bdf8" /> Catálogo & Preços
                    </span>
                    <strong style={{ color: comp.productsServices ? '#38bdf8' : '#64748b', marginTop: '0.2rem', display: 'block' }}>
                      {comp.productsServices ? 'Configurado' : 'Pendente'}
                    </strong>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <HelpCircle size={12} color="#a78bfa" /> FAQ & Políticas
                    </span>
                    <strong style={{ color: comp.faq || comp.policies ? '#a78bfa' : '#64748b', marginTop: '0.2rem', display: 'block' }}>
                      {comp.faq || comp.policies ? 'Configurado' : 'Vazio'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Footer Card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Send size={11} /> {comp._count?.campaigns || 0} campanhas
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Users size={11} /> {comp._count?.contacts || 0} clientes
                  </span>
                </div>

                <button
                  onClick={() => handleOpenEditModal(comp)}
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação / Edição de Empresa */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '850px', width: '100%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="modal-title" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Building2 size={20} color="#25d366" />
                {editingCompany ? `Editar Empresa: ${editingCompany.name}` : 'Cadastrar Nova Empresa & Base de Conhecimento'}
              </h3>
              <X className="modal-close" onClick={() => setIsModalOpen(false)} />
            </div>

            {/* Abas de Navegação no Modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', overflowX: 'auto' }}>
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                style={{
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: activeTab === 'info' ? '#25d366' : '#94a3b8',
                  borderBottom: activeTab === 'info' ? '2px solid #25d366' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <Info size={14} /> 1. Identificação
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                style={{
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: activeTab === 'catalog' ? '#25d366' : '#94a3b8',
                  borderBottom: activeTab === 'catalog' ? '2px solid #25d366' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <ShoppingBag size={14} /> 2. Produtos, Serviços & Preços
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('faq')}
                style={{
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: activeTab === 'faq' ? '#25d366' : '#94a3b8',
                  borderBottom: activeTab === 'faq' ? '2px solid #25d366' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <HelpCircle size={14} /> 3. FAQ, Pagamentos & Políticas
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                style={{
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: activeTab === 'ai' ? '#25d366' : '#94a3b8',
                  borderBottom: activeTab === 'ai' ? '2px solid #25d366' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <Sparkles size={14} /> 4. Canais & Instruções da IA
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ padding: '1.5rem', maxHeight: '65vh', overflowY: 'auto' }}>
                {errorMsg && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.75rem', borderRadius: '8px', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
                    <AlertCircle size={16} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* TAB 1: IDENTIFICAÇÃO */}
                {activeTab === 'info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                          Nome da Empresa / Marca *
                        </label>
                        <input
                          type="text"
                          className="input-control"
                          placeholder="Ex: WaJato Tech, Calçados Brasil, etc."
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                          Ramo / Segmento
                        </label>
                        <input
                          type="text"
                          className="input-control"
                          placeholder="Ex: Moda Feminina, SaaS, Imobiliária..."
                          value={segment}
                          onChange={(e) => setSegment(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                        Sobre a Empresa (Descrição Institucional) *
                      </label>
                      <textarea
                        className="input-control"
                        placeholder="Descreva quem é a empresa, história resumida, valores e posicionamento no mercado..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        style={{ minHeight: '120px', fontSize: '0.82rem', resize: 'vertical', width: '100%' }}
                      />
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem', display: 'block' }}>
                        A IA usará esta descrição quando o cliente perguntar "quem são vocês?", "onde fica?", etc.
                      </span>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={isDefault}
                          onChange={(e) => setIsDefault(e.target.checked)}
                          style={{ accentColor: '#25d366' }}
                        />
                        Definir como Empresa Padrão (Fallback quando nenhuma empresa específica for selecionada)
                      </label>
                    </div>
                  </div>
                )}

                {/* TAB 2: CATÁLOGO & PREÇOS */}
                {activeTab === 'catalog' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    {/* CARD DE IMPORTAÇÃO DE PLANILHA */}
                    <div
                      style={{
                        background: 'linear-gradient(145deg, rgba(37, 211, 102, 0.04) 0%, rgba(15, 23, 42, 0.6) 100%)',
                        border: '1px solid rgba(37, 211, 102, 0.2)',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              background: 'rgba(37, 211, 102, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#25d366',
                              flexShrink: 0,
                            }}
                          >
                            <FileSpreadsheet size={22} />
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
                              Importar Produtos via Planilha (Excel / CSV)
                            </h4>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                              Evite cadastrar item por item. Carregue seu arquivo <strong>.xlsx</strong>, <strong>.xls</strong> ou <strong>.csv</strong> de produtos.
                            </p>
                          </div>
                        </div>

                        {/* Botões de Baixar Modelo */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={downloadSampleExcel}
                            className="btn"
                            style={{
                              background: 'rgba(59, 130, 246, 0.12)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              fontSize: '0.75rem',
                              padding: '0.45rem 0.75rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: 500,
                            }}
                            title="Baixar planilha modelo formatada em Excel"
                          >
                            <Download size={14} /> Baixar Modelo (.xlsx)
                          </button>

                          <button
                            type="button"
                            onClick={downloadSampleCSV}
                            className="btn"
                            style={{
                              background: 'rgba(148, 163, 184, 0.1)',
                              color: '#cbd5e1',
                              border: '1px solid rgba(148, 163, 184, 0.25)',
                              fontSize: '0.75rem',
                              padding: '0.45rem 0.75rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: 500,
                            }}
                            title="Baixar modelo em formato CSV (separado por ponto e vírgula)"
                          >
                            <Download size={14} /> Baixar Modelo (.csv)
                          </button>
                        </div>
                      </div>

                      {/* Opções de Importação e Botão de Upload */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Ação ao importar:</span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#e2e8f0', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="importMode"
                              value="replace"
                              checked={importMode === 'replace'}
                              onChange={() => setImportMode('replace')}
                              style={{ accentColor: '#25d366' }}
                            />
                            Substituir catálogo
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#e2e8f0', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="importMode"
                              value="append"
                              checked={importMode === 'append'}
                              onChange={() => setImportMode('append')}
                              style={{ accentColor: '#25d366' }}
                            />
                            Adicionar ao final
                          </label>
                        </div>

                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx, .xls, .csv, .tsv, .txt"
                            onChange={handleSpreadsheetFileChange}
                            style={{ display: 'none' }}
                          />
                          <button
                            type="button"
                            disabled={isImportingFile}
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-primary"
                            style={{
                              fontSize: '0.8rem',
                              padding: '0.5rem 1rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              borderRadius: '8px',
                              cursor: isImportingFile ? 'wait' : 'pointer',
                            }}
                          >
                            {isImportingFile ? (
                              <>
                                <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Processando planilha...
                              </>
                            ) : (
                              <>
                                <UploadCloud size={16} /> Subir Planilha de Produtos
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Notificação de Status da Importação */}
                      {importStatus && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            background: importStatus.success ? 'rgba(37, 211, 102, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: `1px solid ${importStatus.success ? 'rgba(37, 211, 102, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            color: importStatus.success ? '#4ade80' : '#f87171',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {importStatus.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                            <span>{importStatus.message}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setImportStatus(null)}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* TEXTAREA DO CATÁLOGO DE PRODUTOS */}
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', margin: 0 }}>
                          Catálogo de Produtos, Serviços, Planos e Preços *
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {productsServices && (
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                              {((productsServices.match(/•/g) || []).length || 1)} item(ns) | {productsServices.length} caracteres
                            </span>
                          )}
                          {productsServices && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Deseja limpar todo o texto do catálogo?')) {
                                  setProductsServices('');
                                }
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                padding: '0 0.2rem',
                              }}
                            >
                              <Trash2 size={12} /> Limpar
                            </button>
                          )}
                        </div>
                      </div>

                      <textarea
                        className="input-control"
                        placeholder={`Descreva seus produtos e serviços detalhadamente ou use a importação de planilha acima:\n\nExemplo:\n• Plano Básico Mensal\n  - Categoria: Software\n  - Preço: R$ 99,00/mês\n  - Descrição: Inclui 1000 mensagens e suporte via ticket\n\n• Tênis Esportivo Nitro\n  - Categoria: Calçados\n  - Preço: R$ 249,00\n  - Descrição: Tamanhos 38 ao 44, Cores Preto e Branco\n  - Código/Link: REF-102`}
                        value={productsServices}
                        onChange={(e) => setProductsServices(e.target.value)}
                        required
                        style={{ minHeight: '220px', fontSize: '0.82rem', resize: 'vertical', width: '100%', fontFamily: 'monospace', lineHeight: 1.5 }}
                      />
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.3rem', display: 'block' }}>
                        Coloque todos os itens que o cliente pode ter interesse em comprar ou tirar dúvidas de preço. A IA responderá consultas baseadas neste catálogo.
                      </span>
                    </div>
                  </div>
                )}

                {/* TAB 3: FAQ & POLÍTICAS */}
                {activeTab === 'faq' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                        Perguntas e Respostas Frequentes (FAQ)
                      </label>
                      <textarea
                        className="input-control"
                        placeholder={`Exemplo:\nP: Vocês entregam para todo o Brasil?\nR: Sim, enviamos via Sedex e PAC para todo o território nacional.\n\nP: Tem garantia?\nR: Sim, garantia total de 90 dias contra qualquer defeito.`}
                        value={faq}
                        onChange={(e) => setFaq(e.target.value)}
                        style={{ minHeight: '140px', fontSize: '0.82rem', resize: 'vertical', width: '100%' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                        Formas de Pagamento, Prazos de Envio e Políticas de Devolução
                      </label>
                      <textarea
                        className="input-control"
                        placeholder={`Exemplo:\n- Pagamento: PIX (com 5% de desconto), Cartão de Crédito em até 12x (sem juros até 6x), Boleto Bancário.\n- Prazos: Postagem em até 24h úteis após confirmação.\n- Devoluções: 7 dias para arrependimento com frete grátis de retorno.`}
                        value={policies}
                        onChange={(e) => setPolicies(e.target.value)}
                        style={{ minHeight: '120px', fontSize: '0.82rem', resize: 'vertical', width: '100%' }}
                      />
                    </div>
                  </div>
                )}

                {/* TAB 4: CANAIS & INSTRUÇÕES DA IA */}
                {activeTab === 'ai' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                        Canais de Contato, Suporte Humano, Site e Endereço
                      </label>
                      <textarea
                        className="input-control"
                        placeholder={`Exemplo:\n- Site oficial: https://minhaempresa.com.br\n- Atendente humano / Escalação: Fale com o número (11) 99999-9999\n- Horário de atendimento: Segunda a Sexta das 08h às 18h\n- Endereço físico: Av. Paulista, 1000 - São Paulo/SP`}
                        value={contactInfo}
                        onChange={(e) => setContactInfo(e.target.value)}
                        style={{ minHeight: '100px', fontSize: '0.82rem', resize: 'vertical', width: '100%' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                        Tom de Voz Desejado para o Atendente IA
                      </label>
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Ex: Amigável e descontraído com emojis; Formal e corporativo; Consultivo e direto..."
                        value={toneOfVoice}
                        onChange={(e) => setToneOfVoice(e.target.value)}
                        style={{ width: '100%', fontSize: '0.82rem' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0', marginBottom: '0.4rem', display: 'block' }}>
                        Orientações e Comandos Específicos para a IA
                      </label>
                      <textarea
                        className="input-control"
                        placeholder={`Exemplo:\n- Sempre tente descobrir a cidade do cliente antes de calcular o frete.\n- Se o cliente pedir desconto, ofereça o cupom BEMVINDO10 para 10% OFF.\n- Nunca prometa prazos menores que 3 dias úteis.`}
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        style={{ minHeight: '110px', fontSize: '0.82rem', resize: 'vertical', width: '100%' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancelar
                </button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {activeTab !== 'info' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        if (activeTab === 'catalog') setActiveTab('info');
                        if (activeTab === 'faq') setActiveTab('catalog');
                        if (activeTab === 'ai') setActiveTab('faq');
                      }}
                    >
                      Voltar
                    </button>
                  )}
                  {activeTab !== 'ai' ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        if (activeTab === 'info') setActiveTab('catalog');
                        if (activeTab === 'catalog') setActiveTab('faq');
                        if (activeTab === 'faq') setActiveTab('ai');
                      }}
                    >
                      Avançar
                    </button>
                  ) : (
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Salvando...' : 'Salvar Empresa & Conhecimento'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
      `}</style>
    </AppLayout>
  );
}

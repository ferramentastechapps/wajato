'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  X, 
  Image, 
  Code, 
  Smile, 
  User, 
  Link as LinkIcon 
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Template {
  id: string;
  name: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Prepara dados de simulação (preview)
  const previewName = "João Silva";
  const previewGroupLink = "https://chat.whatsapp.com/L1nKDePrOmOcOeS";

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Abre editor para criar novo
  const handleNewTemplate = () => {
    setEditingTemplateId(null);
    setName('');
    setBody('Olá {{nome}},\n\nTemos novas promoções imperdíveis hoje! Clique no link abaixo para entrar no nosso grupo oficial:\n\n👉 {{link}}\n\nTe espero lá!');
    setImageUrl('');
    setShowEditor(true);
  };

  // Abre editor para editar existente
  const handleEditTemplate = (tmpl: Template) => {
    setEditingTemplateId(tmpl.id);
    setName(tmpl.name);
    setBody(tmpl.body);
    setImageUrl(tmpl.imageUrl || '');
    setShowEditor(true);
  };

  // Excluir template
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Deseja realmente excluir este template?')) return;

    try {
      const response = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchTemplates();
        if (editingTemplateId === id) {
          setShowEditor(false);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Salvar template no banco
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !body) return;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTemplateId,
          name,
          body,
          imageUrl: imageUrl || null,
        }),
      });

      if (response.ok) {
        setShowEditor(false);
        fetchTemplates();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Injetar variável no texto na posição do cursor
  const injectVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    const newBody = before + variable + after;
    setBody(newBody);

    // Ajusta o foco de volta para o textarea
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 50);
  };

  // Formata o texto substituindo as variáveis para o preview
  const formatBodyPreview = (text: string) => {
    if (!text) return '';
    return text
      .replace(/{{nome}}/g, previewName)
      .replace(/{{link}}/g, previewGroupLink)
      .split('\n')
      .map((line, i) => (
        <React.Fragment key={i}>
          {line}
          <br />
        </React.Fragment>
      ));
  };

  const getFormattedTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppLayout title="Templates">
      {/* Botão de nova ação */}
      {!showEditor && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <button onClick={handleNewTemplate} className="btn btn-primary">
            <Plus size={16} />
            Novo Template
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: showEditor ? '1.2fr 0.8fr' : '1fr', gap: '2rem' }}>
        {/* Editor de Templates */}
        {showEditor && (
          <div className="card-glass" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem' }}>
                {editingTemplateId ? 'Editar Template' : 'Criar Novo Template'}
              </h3>
              <button 
                type="button" 
                onClick={() => setShowEditor(false)} 
                style={{ color: '#9ca3af', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Nome do Template</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Convite Grupo Promoções VIP"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Link da Imagem (Opcional - Mídia)</label>
                <div style={{ position: 'relative' }}>
                  <Image size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input
                    type="url"
                    className="input-control"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="URL pública da imagem (.jpg, .png)"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label className="form-label">Texto da Mensagem</label>
                  
                  {/* Botões de injeção de variáveis */}
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button
                      type="button"
                      onClick={() => injectVariable('{{nome}}')}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', gap: '0.25rem' }}
                      title="Inserir Nome do Contato"
                    >
                      <User size={12} />
                      Nome
                    </button>
                    <button
                      type="button"
                      onClick={() => injectVariable('{{link}}')}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', gap: '0.25rem' }}
                      title="Inserir Link do Grupo"
                    >
                      <LinkIcon size={12} />
                      Link Grupo
                    </button>
                  </div>
                </div>
                
                <textarea
                  ref={textareaRef}
                  className="input-control"
                  rows={8}
                  placeholder="Escreva sua mensagem aqui..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  disabled={isSubmitting}
                  style={{ resize: 'vertical', lineHeight: '1.4', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditor(false)} 
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : 'Salvar Template'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* WhatsApp Preview Sidepanel */}
        {showEditor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ fontSize: '1rem', color: '#9ca3af', fontWeight: 500 }}>Visualização no WhatsApp</h4>
            
            <div className="wa-preview" style={{ flex: 1, minHeight: '380px' }}>
              <div className="wa-message" style={{ width: '90%', maxWidth: '280px' }}>
                {imageUrl && (
                  <div className="wa-message-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={imageUrl} 
                      alt="Preview Media" 
                      className="wa-message-image"
                      onError={(e) => {
                        // Oculta imagem ou coloca placeholder em caso de erro
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                <div style={{ wordBreak: 'break-word' }}>
                  {formatBodyPreview(body) || <span style={{ color: '#8696a0', fontStyle: 'italic' }}>Mensagem vazia...</span>}
                </div>
                
                <div className="wa-message-time">
                  {getFormattedTime()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Templates Cadastrados */}
      {!showEditor && (
        <div className="card-glass" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
              <span>Carregando templates...</span>
            </div>
          ) : templates.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>
              <FileText size={48} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
              <p>Nenhum template cadastrado.</p>
              <button onClick={handleNewTemplate} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                Criar Primeiro Template
              </button>
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Nome do Template</th>
                    <th>Mensagem Resumida</th>
                    <th style={{ width: '120px' }}>Tipo Mídia</th>
                    <th style={{ width: '150px' }}>Criado em</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((tmpl) => (
                    <tr key={tmpl.id}>
                      <td style={{ fontWeight: 600 }}>{tmpl.name}</td>
                      <td style={{ color: '#9ca3af', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tmpl.body}
                      </td>
                      <td>
                        {tmpl.imageUrl ? (
                          <span className="badge badge-success">Imagem</span>
                        ) : (
                          <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Apenas Texto</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>
                        {new Date(tmpl.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleEditTemplate(tmpl)}
                            style={{ color: '#3b82f6', cursor: 'pointer', padding: '0.25rem' }}
                            title="Editar Template"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tmpl.id)}
                            style={{ color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                            title="Excluir Template"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

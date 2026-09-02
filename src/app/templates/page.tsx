'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit3, 
  X, 
  Image as ImageIcon, 
  User, 
  Link as LinkIcon,
  Shield,
  ShieldCheck,
  Zap,
  Clock,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  Upload,
  Check,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { parseSpintax } from '@/lib/spintax';
import { convertImageToWebP, formatBytes, CompressionResult } from '@/lib/image-compressor';

interface Template {
  id: string;
  name: string;
  body: string;
  bodyVariants: string[];
  imageUrl: string | null;
  enableHook: boolean;
  hookMessage: string | null;
  hookVariants: string[];
  hookMode: 'ON_REPLY' | 'DELAY';
  hookDelay: number;
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
  const [bodyVariants, setBodyVariants] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploadMode, setImageUploadMode] = useState<'upload' | 'url'>('upload');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult | null>(null);
  const [imageUploadError, setImageUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Estados de Proteção Anti-Bloqueio (Mensagem Prévia / Hook) ──────────────
  const [enableHook, setEnableHook] = useState(false);
  const [hookMessage, setHookMessage] = useState('Olá {{nome}}, tudo bem? Posso te passar uma informação rápida?');
  const [hookVariants, setHookVariants] = useState<string[]>([
    'Oi {{nome}}, tudo bem com você?',
    'Opa {{nome}}, como vai? Tudo bem?',
  ]);
  const [hookMode, setHookMode] = useState<'ON_REPLY' | 'DELAY'>('ON_REPLY');
  const [hookDelay, setHookDelay] = useState(15);
  const [previewHookIdx, setPreviewHookIdx] = useState(0);
  const [previewBodyIdx, setPreviewBodyIdx] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hookTextareaRef = useRef<HTMLTextAreaElement>(null);

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
    setBodyVariants([]);
    setImageUrl('');
    setCompressionInfo(null);
    setImageUploadError('');
    setImageUploadMode('upload');
    setEnableHook(false);
    setHookMessage('Olá {{nome}}, tudo bem? Posso te passar uma informação rápida?');
    setHookVariants([
      'Oi {{nome}}, tudo bem com você?',
      'Opa {{nome}}, como vai? Tudo bem?',
    ]);
    setHookMode('ON_REPLY');
    setHookDelay(15);
    setPreviewHookIdx(0);
    setPreviewBodyIdx(0);
    setShowEditor(true);
  };

  // Abre editor para editar existente
  const handleEditTemplate = (tmpl: Template) => {
    setEditingTemplateId(tmpl.id);
    setName(tmpl.name);
    setBody(tmpl.body);
    setBodyVariants(Array.isArray(tmpl.bodyVariants) ? tmpl.bodyVariants : []);
    setImageUrl(tmpl.imageUrl || '');
    setCompressionInfo(null);
    setImageUploadError('');
    setImageUploadMode(tmpl.imageUrl && !tmpl.imageUrl.includes('/uploads/') ? 'url' : 'upload');
    setEnableHook(Boolean(tmpl.enableHook));
    setHookMessage(tmpl.hookMessage || 'Olá {{nome}}, tudo bem? Posso te passar uma informação rápida?');
    setHookVariants(Array.isArray(tmpl.hookVariants) && tmpl.hookVariants.length > 0 ? tmpl.hookVariants : []);
    setHookMode(tmpl.hookMode === 'DELAY' ? 'DELAY' : 'ON_REPLY');
    setHookDelay(tmpl.hookDelay || 15);
    setPreviewHookIdx(0);
    setPreviewBodyIdx(0);
    setShowEditor(true);
  };

  // ── Handlers de Upload e Conversão WebP ─────────────────────────────────────────
  const processAndUploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageUploadError('Por favor, selecione um arquivo de imagem válido (JPG, PNG, WebP, GIF).');
      return;
    }

    setUploadingImage(true);
    setImageUploadError('');
    setUploadProgress('⚡ Convertendo e otimizando para WebP...');

    try {
      // Converte no navegador para WebP ultra-leve (max 1600x1600, qualidade 0.85)
      const result = await convertImageToWebP(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85 });
      setCompressionInfo(result);

      setUploadProgress(`📤 Enviando WebP (${formatBytes(result.compressedSize)})...`);

      const formData = new FormData();
      formData.append('file', result.file);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Falha no upload da imagem');

      setImageUrl(data.url);
    } catch (err: any) {
      console.error('Erro ao processar imagem:', err);
      setImageUploadError(err.message || 'Erro ao converter/enviar imagem');
    } finally {
      setUploadingImage(false);
      setUploadProgress('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processAndUploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) processAndUploadFile(file);
  };

  const handleRemoveImage = () => {
    setImageUrl('');
    setCompressionInfo(null);
    setImageUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Handlers para variações do texto principal (body) ───────────────────────────
  const handleAddBodyVariant = () => setBodyVariants((prev) => [...prev, '']);

  const handleBodyVariantChange = (index: number, value: string) => {
    setBodyVariants((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleRemoveBodyVariant = (index: number) => {
    setBodyVariants((prev) => prev.filter((_, i) => i !== index));
    setPreviewBodyIdx(0);
  };

  // Adiciona variação de mensagem curta
  const handleAddHookVariant = () => {
    setHookVariants((prev) => [...prev, '']);
  };

  // Altera variação de mensagem curta
  const handleHookVariantChange = (index: number, value: string) => {
    setHookVariants((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // Remove variação de mensagem curta
  const handleRemoveHookVariant = (index: number) => {
    setHookVariants((prev) => prev.filter((_, i) => i !== index));
    setPreviewHookIdx(0);
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
      const cleanHookVariants = hookVariants.map((v) => v.trim()).filter((v) => v.length > 0);
      const cleanBodyVariants = bodyVariants.map((v) => v.trim()).filter((v) => v.length > 0);

      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTemplateId,
          name,
          body,
          bodyVariants: cleanBodyVariants,
          imageUrl: imageUrl || null,
          enableHook,
          hookMessage: enableHook ? hookMessage.trim() : null,
          hookVariants: enableHook ? cleanHookVariants : [],
          hookMode: enableHook ? hookMode : 'ON_REPLY',
          hookDelay: enableHook ? Number(hookDelay) : 15,
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
  const injectVariable = (variable: string, target: 'main' | 'hook') => {
    const textarea = target === 'main' ? textareaRef.current : hookTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    const newText = before + variable + after;
    if (target === 'main') {
      setBody(newText);
    } else {
      setHookMessage(newText);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 50);
  };

  // Formata o texto substituindo as variáveis para o preview
  const formatBodyPreview = (text: string) => {
    if (!text) return '';
    const formatted = parseSpintax(
      text.replace(/{{nome}}/g, previewName).replace(/{{link}}/g, previewGroupLink)
    );

    return formatted.split('\n').map((line, i) => (
      <React.Fragment key={i}>
        {line}
        <br />
      </React.Fragment>
    ));
  };

  // Lista de todas as opções de hook para o preview
  const allHookOptions = useMemo(() => {
    const list = [hookMessage, ...hookVariants].filter((h) => Boolean(h && h.trim().length > 0));
    return list.length > 0 ? list : ['Olá {{nome}}, tudo bem?'];
  }, [hookMessage, hookVariants]);

  const currentHookPreview = useMemo(() => {
    const safeIdx = previewHookIdx % allHookOptions.length;
    return allHookOptions[safeIdx] || '';
  }, [allHookOptions, previewHookIdx]);

  // Lista de todas as opções de body para o preview
  const allBodyOptions = useMemo(() => {
    const list = [body, ...bodyVariants].filter((b) => Boolean(b && b.trim().length > 0));
    return list.length > 0 ? list : [body || ''];
  }, [body, bodyVariants]);

  const currentBodyPreview = useMemo(() => {
    const safeIdx = previewBodyIdx % Math.max(1, allBodyOptions.length);
    return allBodyOptions[safeIdx] || '';
  }, [allBodyOptions, previewBodyIdx]);

  const getFormattedTime = (offsetSeconds = 0) => {
    const now = new Date(Date.now() + offsetSeconds * 1000);
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppLayout title="Templates">
      {/* Botão de nova ação */}
      {!showEditor && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Crie modelos de mensagens com fotos, links e proteção em 2 etapas anti-bloqueio.
            </p>
          </div>
          <button onClick={handleNewTemplate} className="btn btn-primary">
            <Plus size={16} />
            Novo Template
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: showEditor ? '1.25fr 0.75fr' : '1fr', gap: '2rem' }}>
        {/* Editor de Templates */}
        {showEditor && (
          <div className="card-glass" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(37,211,102,0.1)', color: '#25d366' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f3f4f6' }}>
                    {editingTemplateId ? 'Editar Template' : 'Criar Novo Template'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                    Configure os dados principais e ative o envio em 2 etapas se desejar.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowEditor(false)} 
                style={{ color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Nome */}
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

              {/* ═════════════════════════════════════════════════════════════════ */}
              {/* SEÇÃO: PROTEÇÃO ANTI-BLOQUEIO (MENSAGEM PRÉVIA EM 2 ETAPAS)      */}
              {/* ═════════════════════════════════════════════════════════════════ */}
              <div 
                style={{
                  border: enableHook ? '1px solid rgba(37,211,102,0.4)' : '1px solid var(--border)',
                  background: enableHook ? 'rgba(37,211,102,0.03)' : 'rgba(255,255,255,0.02)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  transition: 'all 0.3s ease',
                }}
              >
                {/* Cabeçalho do Switch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div 
                      style={{
                        padding: '0.4rem',
                        borderRadius: '8px',
                        background: enableHook ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.05)',
                        color: enableHook ? '#25d366' : '#9ca3af',
                      }}
                    >
                      {enableHook ? <ShieldCheck size={20} /> : <Shield size={20} />}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: enableHook ? '#25d366' : '#e5e7eb', margin: 0 }}>
                        Mensagem Prévia Anti-Bloqueio (Envio em 2 Etapas)
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0.2rem 0 0 0' }}>
                        Envia uma saudação curta primeiro para a pessoa responder antes do template principal.
                      </p>
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <div
                    onClick={() => setEnableHook(!enableHook)}
                    style={{
                      width: '46px',
                      height: '24px',
                      borderRadius: '999px',
                      background: enableHook ? '#25d366' : 'rgba(255,255,255,0.1)',
                      border: enableHook ? '1px solid #25d366' : '1px solid var(--border)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.25s',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: 'white',
                        position: 'absolute',
                        top: '2px',
                        left: enableHook ? '24px' : '2px',
                        transition: 'left 0.25s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                      }}
                    />
                  </div>
                </div>

                {/* Conteúdo Expansível do Hook */}
                {enableHook && (
                  <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* Modo de Disparo */}
                    <div>
                      <label className="form-label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Zap size={13} style={{ color: '#eab308' }} />
                        Gatilho para Envio do Template Principal:
                      </label>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {/* Opção 1: Ao Responder */}
                        <div
                          onClick={() => setHookMode('ON_REPLY')}
                          style={{
                            padding: '0.875rem',
                            borderRadius: '8px',
                            border: hookMode === 'ON_REPLY' ? '1.5px solid #25d366' : '1px solid var(--border)',
                            background: hookMode === 'ON_REPLY' ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.02)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: hookMode === 'ON_REPLY' ? '#25d366' : '#e5e7eb', fontSize: '0.85rem' }}>
                            <Zap size={15} />
                            Ao Responder (Recomendado)
                          </div>
                          <p style={{ fontSize: '0.725rem', color: '#9ca3af', margin: '0.35rem 0 0 0', lineHeight: 1.4 }}>
                            Dispara a mensagem curta. Quando o contato responde qualquer coisa, o template principal é enviado.
                          </p>
                        </div>

                        {/* Opção 2: Após Delay */}
                        <div
                          onClick={() => setHookMode('DELAY')}
                          style={{
                            padding: '0.875rem',
                            borderRadius: '8px',
                            border: hookMode === 'DELAY' ? '1.5px solid #3b82f6' : '1px solid var(--border)',
                            background: hookMode === 'DELAY' ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: hookMode === 'DELAY' ? '#3b82f6' : '#e5e7eb', fontSize: '0.85rem' }}>
                            <Clock size={15} />
                            Após Intervalo Fixo
                          </div>
                          <p style={{ fontSize: '0.725rem', color: '#9ca3af', margin: '0.35rem 0 0 0', lineHeight: 1.4 }}>
                            Envia a mensagem curta e, após X segundos, envia o template principal logo em seguida (2 balões).
                          </p>
                        </div>
                      </div>

                      {hookMode === 'DELAY' && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                          <span>Aguardar</span>
                          <input
                            type="number"
                            min={5}
                            max={300}
                            value={hookDelay}
                            onChange={(e) => setHookDelay(Math.max(5, parseInt(e.target.value) || 15))}
                            className="input-control"
                            style={{ width: '80px', padding: '0.3rem 0.5rem', textAlign: 'center' }}
                          />
                          <span>segundos antes de enviar o template principal.</span>
                        </div>
                      )}
                    </div>

                    {/* Mensagem Curta Base (Gancho 1) */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Mensagem Curta Principal (Saudação Base):
                        </label>
                        <button
                          type="button"
                          onClick={() => injectVariable('{{nome}}', 'hook')}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', display: 'flex', gap: '0.25rem' }}
                        >
                          <User size={11} /> + Nome
                        </button>
                      </div>
                      
                      <textarea
                        ref={hookTextareaRef}
                        className="input-control"
                        rows={2}
                        placeholder="Ex: Olá {{nome}}, tudo bem? Posso te passar uma informação rápida?"
                        value={hookMessage}
                        onChange={(e) => setHookMessage(e.target.value)}
                        style={{ fontSize: '0.875rem', resize: 'vertical' }}
                      />
                    </div>

                    {/* Múltiplas Variações de Mensagem Curta */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div>
                          <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Shuffle size={13} style={{ color: '#a855f7' }} />
                            Variações Diferentes de Saudação (Rotação Anti-Spam):
                          </label>
                          <p style={{ fontSize: '0.725rem', color: '#9ca3af', margin: '0.15rem 0 0 0' }}>
                            O sistema sorteia uma saudação diferente para cada contato para evitar repetições.
                          </p>
                        </div>
                        
                        <button
                          type="button"
                          onClick={handleAddHookVariant}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: '#a855f7', borderColor: 'rgba(168,85,247,0.3)' }}
                        >
                          <Plus size={13} />
                          Adicionar Variação
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {hookVariants.map((variant, index) => (
                          <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: '#6b7280', width: '70px', flexShrink: 0 }}>
                              Opção {index + 2}:
                            </span>
                            <input
                              type="text"
                              className="input-control"
                              placeholder={`Ex: Oi {{nome}}, como vai você?`}
                              value={variant}
                              onChange={(e) => handleHookVariantChange(index, e.target.value)}
                              style={{ fontSize: '0.825rem', padding: '0.4rem 0.6rem' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveHookVariant(index)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                              title="Remover variação"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* Mídia do Template Principal (Upload com conversão WebP ou URL) */}
              <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                      <ImageIcon size={16} style={{ color: '#38bdf8' }} />
                      Imagem do Template Principal (Mídia WhatsApp)
                    </label>
                    <p style={{ fontSize: '0.725rem', color: '#9ca3af', margin: '0.15rem 0 0 0' }}>
                      Opcional. Imagens enviadas são convertidas automaticamente para <strong>WebP ultra-leve</strong> para disparos rápidos.
                    </p>
                  </div>

                  {/* Alternador de Modo: Upload vs URL */}
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setImageUploadMode('upload')}
                      style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: imageUploadMode === 'upload' ? 600 : 400,
                        background: imageUploadMode === 'upload' ? 'rgba(56,189,248,0.2)' : 'transparent',
                        color: imageUploadMode === 'upload' ? '#38bdf8' : '#9ca3af',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Upload size={12} />
                      Upload / WebP
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageUploadMode('url')}
                      style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: imageUploadMode === 'url' ? 600 : 400,
                        background: imageUploadMode === 'url' ? 'rgba(56,189,248,0.2)' : 'transparent',
                        color: imageUploadMode === 'url' ? '#38bdf8' : '#9ca3af',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <LinkIcon size={12} />
                      URL Externa
                    </button>
                  </div>
                </div>

                {imageUploadError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', marginBottom: '0.75rem', color: '#fca5a5', fontSize: '0.8rem' }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    {imageUploadError}
                  </div>
                )}

                {imageUploadMode === 'upload' ? (
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                      style={{ display: 'none' }}
                    />

                    {imageUrl ? (
                      /* Preview da Imagem Carregada */
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.75rem',
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid rgba(56,189,248,0.2)',
                        borderRadius: '10px',
                      }}>
                        <div style={{ width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img
                            src={imageUrl}
                            alt="Mídia"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>
                              ⚡ Imagem Otimizada (WebP)
                            </span>
                            {compressionInfo && (
                              <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700 }}>
                                -{compressionInfo.savingsPercent}% mais leve
                              </span>
                            )}
                          </div>

                          {compressionInfo ? (
                            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0.25rem 0 0 0' }}>
                              Original: <span style={{ textDecoration: 'line-through' }}>{formatBytes(compressionInfo.originalSize)}</span> ➔ <strong>{formatBytes(compressionInfo.compressedSize)}</strong> ({compressionInfo.width}x{compressionInfo.height}px)
                            </p>
                          ) : (
                            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0.25rem 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {imageUrl}
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                            disabled={uploadingImage}
                          >
                            Trocar
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="btn btn-danger"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                            disabled={uploadingImage}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Dropzone para selecionar */
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={handleDrop}
                        style={{
                          border: '2px dashed rgba(56,189,248,0.3)',
                          borderRadius: '10px',
                          padding: '1.5rem',
                          textAlign: 'center',
                          cursor: 'pointer',
                          background: 'rgba(56,189,248,0.03)',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#38bdf8')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(56,189,248,0.3)')}
                      >
                        {uploadingImage ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '28px', height: '28px', border: '3px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 500 }}>
                              {uploadProgress || '⚡ Convertendo e otimizando para WebP...'}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                              Reduzindo tamanho para envios ultra-rápidos
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(56,189,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', marginBottom: '0.2rem' }}>
                              <Upload size={18} />
                            </div>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e5e7eb' }}>
                              Clique para escolher uma imagem ou arraste até aqui
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                              Suporta JPG, PNG, WEBP, GIF · <strong>Conversão automática para WebP leve</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Modo URL Externa */
                  <div style={{ position: 'relative' }}>
                    <LinkIcon size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                    <input
                      type="url"
                      className="input-control"
                      style={{ paddingLeft: '2.5rem' }}
                      placeholder="https://exemplo.com/imagem.webp ou .jpg"
                      value={imageUrl}
                      onChange={(e) => { setImageUrl(e.target.value); setCompressionInfo(null); }}
                      disabled={isSubmitting}
                    />
                  </div>
                )}
              </div>

              {/* Texto do Template Principal */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <div>
                    <label className="form-label" style={{ margin: 0 }}>
                      Texto do Template Principal (Mensagem Completa)
                    </label>
                    <p style={{ fontSize: '0.725rem', color: '#9ca3af', margin: '0.1rem 0 0 0' }}>
                      Entregue {enableHook ? 'após a saudação' : 'diretamente'}. Suporta Spintax e variáveis.
                    </p>
                  </div>
                  
                  {/* Botões de injeção de variáveis */}
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button
                      type="button"
                      onClick={() => injectVariable('{{nome}}', 'main')}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', gap: '0.25rem' }}
                      title="Inserir Nome do Contato"
                    >
                      <User size={12} />
                      Nome
                    </button>
                    <button
                      type="button"
                      onClick={() => injectVariable('{{link}}', 'main')}
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

              {/* ═════════════════════════════════════════════════════════════════ */}
              {/* SEÇÃO: VARIAÇÕES DO TEXTO PRINCIPAL (ROTAÇÃO ANTI-BAN)              */}
              {/* ═════════════════════════════════════════════════════════════════ */}
              <div
                style={{
                  border: '1px solid rgba(52,211,153,0.2)',
                  background: 'rgba(52,211,153,0.02)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                }}
              >
                {/* Cabeçalho */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: bodyVariants.length > 0 ? '1rem' : '0', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.4rem', borderRadius: '8px', background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                      <Shuffle size={18} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#34d399', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        Variações do Texto Principal
                        {bodyVariants.length > 0 && (
                          <span style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', borderRadius: '99px', fontSize: '0.65rem', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
                            {bodyVariants.length + 1} versões
                          </span>
                        )}
                      </h4>
                      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0.15rem 0 0 0' }}>
                        O sistema sorteia uma versão diferente para cada contato — parece mais humano e evita ban.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBodyVariant}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', color: '#34d399', borderColor: 'rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}
                  >
                    <Plus size={13} />
                    + Adicionar Variação
                  </button>
                </div>

                {bodyVariants.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1rem', color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', border: '1px dashed rgba(52,211,153,0.15)', borderRadius: '8px' }}>
                    Nenhuma variação extra. Usando apenas o texto principal acima.<br/>
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.15)' }}>Dica: Spintax {'{'}opcao1|opcao2{'}'} também funciona dentro do texto!</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {bodyVariants.map((variant, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'rgba(0,0,0,0.15)',
                          border: '1px solid rgba(52,211,153,0.08)',
                          borderRadius: '10px',
                          padding: '0.9rem',
                          animation: 'fadeBodyVariant 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700, background: 'rgba(52,211,153,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                              Versão {index + 2}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { handleRemoveBodyVariant(index); }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', opacity: 0.8 }}
                          >
                            <X size={13} /> Remover
                          </button>
                        </div>
                        <textarea
                          className="input-control"
                          rows={6}
                          placeholder={`Versão alternativa ${index + 2} do texto...\n\nUse {{nome}}, {{link}} e Spintax {op1|op2} para personalizar.`}
                          value={variant}
                          onChange={(e) => { handleBodyVariantChange(index, e.target.value); setPreviewBodyIdx(index + 1); }}
                          onFocus={() => setPreviewBodyIdx(index + 1)}
                          style={{ fontSize: '0.82rem', resize: 'vertical', width: '100%', background: 'rgba(0,0,0,0.2)', lineHeight: '1.4', fontFamily: 'inherit' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
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

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* WHATSAPP PREVIEW SIDEPANEL                                            */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {showEditor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '1rem', color: '#9ca3af', fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MessageSquare size={15} />
                Visualização no WhatsApp
              </h4>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Seletor de variação de body */}
                {allBodyOptions.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: '#34d399' }}>
                    <Shuffle size={11} />
                    <span>Body {previewBodyIdx + 1}/{allBodyOptions.length}</span>
                    <button
                      type="button"
                      onClick={() => setPreviewBodyIdx((prev) => (prev > 0 ? prev - 1 : allBodyOptions.length - 1))}
                      style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', borderRadius: '4px', padding: '1px 4px', cursor: 'pointer' }}
                    >
                      <ChevronLeft size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewBodyIdx((prev) => (prev + 1) % allBodyOptions.length)}
                      style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', borderRadius: '4px', padding: '1px 4px', cursor: 'pointer' }}
                    >
                      <ChevronRight size={11} />
                    </button>
                  </div>
                )}
                {/* Seletor de variação de hook */}
                {enableHook && allHookOptions.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                    <span>Saudação {previewHookIdx + 1}/{allHookOptions.length}</span>
                    <button
                      type="button"
                      onClick={() => setPreviewHookIdx((prev) => (prev > 0 ? prev - 1 : allHookOptions.length - 1))}
                      style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#e5e7eb', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer' }}
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewHookIdx((prev) => (prev + 1) % allHookOptions.length)}
                      style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#e5e7eb', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer' }}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="wa-preview" style={{ flex: 1, minHeight: '480px', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
              
              {/* Balão 1: Mensagem Curta Prévia (Hook) */}
              {enableHook && (
                <>
                  <div style={{ alignSelf: 'flex-end', width: '90%', maxWidth: '280px' }}>
                    <div style={{ fontSize: '0.675rem', color: '#25d366', fontWeight: 600, marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Shield size={10} /> 1ª Mensagem (Saudação Curta Anti-Ban)
                    </div>
                    <div className="wa-message" style={{ width: '100%', borderColor: 'rgba(37,211,102,0.3)' }}>
                      <div style={{ wordBreak: 'break-word' }}>
                        {formatBodyPreview(currentHookPreview)}
                      </div>
                      <div className="wa-message-time">
                        {getFormattedTime(0)}
                      </div>
                    </div>
                  </div>

                  {/* Balão Simulado de Resposta do Cliente (quando modo ON_REPLY) */}
                  {hookMode === 'ON_REPLY' && (
                    <div style={{ alignSelf: 'flex-start', width: '80%', maxWidth: '240px' }}>
                      <div style={{ fontSize: '0.675rem', color: '#9ca3af', marginBottom: '0.2rem' }}>
                        Resposta do Cliente ({previewName}):
                      </div>
                      <div 
                        style={{
                          background: '#202c33',
                          color: '#e9edef',
                          borderRadius: '8px 8px 8px 0',
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.85rem',
                          position: 'relative',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }}
                      >
                        <div>Oi, pode sim! Tudo bem por aqui 👍</div>
                        <div style={{ fontSize: '0.65rem', color: '#8696a0', textAlign: 'right', marginTop: '0.2rem' }}>
                          {getFormattedTime(45)}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

                {/* Balão 2: Template Principal */}
                <div style={{ alignSelf: 'flex-end', width: '90%', maxWidth: '280px' }}>
                  {enableHook && (
                    <div style={{ fontSize: '0.675rem', color: '#38bdf8', fontWeight: 600, marginBottom: '0.2rem' }}>
                      {hookMode === 'ON_REPLY' ? '2ª Mensagem (Enviada após o cliente responder)' : `2ª Mensagem (Enviada após ${hookDelay}s)`}
                    </div>
                  )}
                  {allBodyOptions.length > 1 && (
                    <div style={{ fontSize: '0.65rem', color: '#34d399', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Shuffle size={10} /> Versão {previewBodyIdx + 1} de {allBodyOptions.length}
                    </div>
                  )}
                  
                  <div className="wa-message" style={{ width: '100%' }}>
                    {imageUrl && (
                      <div className="wa-message-media">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={imageUrl} 
                          alt="Preview Media" 
                          className="wa-message-image"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    
                    <div style={{ wordBreak: 'break-word' }}>
                      {formatBodyPreview(currentBodyPreview) || <span style={{ color: '#8696a0', fontStyle: 'italic' }}>Mensagem vazia...</span>}
                    </div>
                    
                    <div className="wa-message-time">
                      {getFormattedTime(enableHook ? (hookMode === 'ON_REPLY' ? 50 : hookDelay) : 0)}
                    </div>
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
                    <th>Mensagem Principal</th>
                    <th style={{ width: '170px' }}>Proteção Anti-Bloqueio</th>
                    <th style={{ width: '110px' }}>Mídia</th>
                    <th style={{ width: '130px' }}>Criado em</th>
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
                        {tmpl.enableHook ? (
                          <span 
                            className="badge badge-success" 
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.725rem' }}
                            title={`Modo: ${tmpl.hookMode === 'ON_REPLY' ? 'Ao Responder' : `Após ${tmpl.hookDelay}s`} | ${tmpl.hookVariants?.length ? `${tmpl.hookVariants.length + 1} variações de saudação` : '1 variação'}`}
                          >
                            <ShieldCheck size={12} />
                            2 Etapas ({tmpl.hookMode === 'ON_REPLY' ? 'Ao Responder' : `${tmpl.hookDelay}s`})
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>1 Etapa Direta</span>
                        )}
                        {(tmpl.bodyVariants?.length ?? 0) > 0 && (
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: '#34d399', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '99px', padding: '0.1rem 0.4rem', marginTop: '0.3rem' }}
                            title={`${(tmpl.bodyVariants?.length ?? 0) + 1} versões do texto principal`}
                          >
                            <Shuffle size={10} />
                            {(tmpl.bodyVariants?.length ?? 0) + 1} textos
                          </span>
                        )}
                      </td>
                      <td>
                        {tmpl.imageUrl ? (
                          <span className="badge badge-info">Imagem</span>
                        ) : (
                          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Texto</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>
                        {new Date(tmpl.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleEditTemplate(tmpl)}
                            style={{ color: '#3b82f6', cursor: 'pointer', padding: '0.25rem', background: 'none', border: 'none' }}
                            title="Editar Template"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tmpl.id)}
                            style={{ color: '#ef4444', cursor: 'pointer', padding: '0.25rem', background: 'none', border: 'none' }}
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
        @keyframes fadeBodyVariant {
          from { transform: translateY(6px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </AppLayout>
  );
}

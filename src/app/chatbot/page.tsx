'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Plus, 
  Trash2, 
  Edit, 
  Sparkles, 
  Clock, 
  History, 
  MessageSquare, 
  ToggleLeft, 
  ToggleRight, 
  Save, 
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  X
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface ChatbotRule {
  id: string;
  trigger: string;
  matchType: 'EXACT' | 'CONTAINS' | 'STARTS_WITH' | 'REGEX';
  response: string;
  imageUrl?: string | null;
  isActive: boolean;
  priority: number;
  category?: string | null;
  action: 'REPLY' | 'TAG_AND_REPLY' | 'OPTOUT_AND_REPLY' | 'TAG_ONLY';
  autoTags: string[];
  updatedAt: string;
}

interface ChatbotLog {
  id: string;
  phone: string;
  messageIn: string;
  messageOut: string;
  source: 'RULE' | 'AI';
  createdAt: string;
}

interface ChatbotConfig {
  aiEnabled: boolean;
  aiContext: string;
  geminiApiKey?: string | null;
  businessHoursOnly: boolean;
  startHour: number;
  endHour: number;
}

export default function ChatbotPage() {
  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [logs, setLogs] = useState<ChatbotLog[]>([]);
  const [config, setConfig] = useState<ChatbotConfig>({
    aiEnabled: false,
    aiContext: 'Você é um assistente de atendimento virtual prestativo e educado.',
    geminiApiKey: '',
    businessHoursOnly: false,
    startHour: 8,
    endHour: 18,
  });

  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<ChatbotRule> | null>(null);

  // Form states for rule
  const [ruleTrigger, setRuleTrigger] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'EXACT' | 'CONTAINS' | 'STARTS_WITH' | 'REGEX'>('EXACT');
  const [ruleResponse, setRuleResponse] = useState('');
  const [ruleImageUrl, setRuleImageUrl] = useState('');
  const [ruleIsActive, setRuleIsActive] = useState(true);
  const [rulePriority, setRulePriority] = useState(0);
  const [ruleCategory, setRuleCategory] = useState('');
  const [ruleAction, setRuleAction] = useState<'REPLY' | 'TAG_AND_REPLY' | 'OPTOUT_AND_REPLY' | 'TAG_ONLY'>('REPLY');
  const [ruleAutoTags, setRuleAutoTags] = useState<string[]>([]);
  const [ruleTagInput, setRuleTagInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const fetchData = async () => {
    try {
      const configRes = await fetch('/api/chatbot/config');
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData.config);
      }

      const rulesRes = await fetch('/api/chatbot/rules');
      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setRules(rulesData.rules || []);
        setLogs(rulesData.logs || []);
      }
    } catch (err) {
      console.error('Erro ao buscar dados do chatbot:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const response = await fetch('/api/chatbot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        alert('Configurações do chatbot salvas com sucesso!');
        fetchData();
      } else {
        const err = await response.json();
        alert(`Erro: ${err.message}`);
      }
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingRule(null);
    setRuleTrigger('');
    setRuleMatchType('EXACT');
    setRuleResponse('');
    setRuleImageUrl('');
    setRuleIsActive(true);
    setRulePriority(0);
    setRuleCategory('');
    setRuleAction('REPLY');
    setRuleAutoTags([]);
    setRuleTagInput('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rule: ChatbotRule) => {
    setEditingRule(rule);
    setRuleTrigger(rule.trigger);
    setRuleMatchType(rule.matchType);
    setRuleResponse(rule.response);
    setRuleImageUrl(rule.imageUrl || '');
    setRuleIsActive(rule.isActive);
    setRulePriority(rule.priority ?? 0);
    setRuleCategory(rule.category || '');
    setRuleAction(rule.action || 'REPLY');
    setRuleAutoTags(rule.autoTags || []);
    setRuleTagInput('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!ruleTrigger.trim()) {
      setErrorMsg('A palavra-chave é obrigatória');
      return;
    }
    if (ruleAction !== 'TAG_ONLY' && !ruleResponse.trim()) {
      setErrorMsg('A mensagem de resposta é obrigatória para esta ação');
      return;
    }

    try {
      const payload = {
        id: editingRule?.id || undefined,
        trigger: ruleTrigger,
        matchType: ruleMatchType,
        response: ruleResponse,
        imageUrl: ruleImageUrl || null,
        isActive: ruleIsActive,
        priority: rulePriority,
        category: ruleCategory || null,
        action: ruleAction,
        autoTags: ruleAutoTags,
      };

      const response = await fetch('/api/chatbot/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsModalOpen(false);
        fetchData();
      } else {
        const err = await response.json();
        setErrorMsg(err.message || 'Erro ao salvar regra');
      }
    } catch (err) {
      console.error('Erro ao salvar regra:', err);
      setErrorMsg('Erro interno no servidor');
    }
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = ruleTagInput.trim().toLowerCase().replace(/\s+/g, '-');
      if (tag && !ruleAutoTags.includes(tag)) {
        setRuleAutoTags([...ruleAutoTags, tag]);
      }
      setRuleTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setRuleAutoTags(ruleAutoTags.filter(t => t !== tag));
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta regra?')) return;
    try {
      const response = await fetch(`/api/chatbot/rules?id=${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchData();
      } else {
        const err = await response.json();
        alert(`Erro: ${err.message}`);
      }
    } catch (err) {
      console.error('Erro ao excluir regra:', err);
    }
  };

  const handleToggleRuleActive = async (rule: ChatbotRule) => {
    try {
      const response = await fetch('/api/chatbot/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rule,
          isActive: !rule.isActive,
        }),
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Erro ao alternar status da regra:', err);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Auto-Responder & Chatbot IA">
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando módulo de chatbot...</span>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Auto-Responder & Chatbot IA">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
        
        {/* Painel de Configuração Global do Chatbot */}
        <div className="card-glass" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bot size={18} style={{ color: 'var(--primary)' }} />
            Configuração do Assistente
          </h3>

          <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Toggle IA Gemini */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Sparkles size={14} style={{ color: '#3b82f6' }} />
                  Assistente Inteligente (Gemini AI)
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Usa inteligência artificial como fallback para responder conversas</span>
              </div>
              <button 
                type="button" 
                onClick={() => setConfig({ ...config, aiEnabled: !config.aiEnabled })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: config.aiEnabled ? 'var(--primary)' : '#6b7280' }}
              >
                {config.aiEnabled ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
              </button>
            </div>

            {/* Prompt de Contexto da IA */}
            {config.aiEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Instruções de Personalidade & Contexto da IA:</label>
                <textarea 
                  value={config.aiContext}
                  onChange={(e) => setConfig({ ...config, aiContext: e.target.value })}
                  className="form-control"
                  style={{ minHeight: '120px', fontSize: '0.85rem', resize: 'vertical' }}
                  placeholder="Ex: Você é o atendente da loja X. Seja gentil, ofereça ajuda sobre calçados e redirecione para o telefone X se pedirem suporte avançado."
                />
              </div>
            )}

            {/* API Key do Gemini Individual */}
            {config.aiEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Chave de API do Gemini (Google AI Studio):</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary)', opacity: 0.85 }}>Opcional (usa a global do servidor se vazia)</span>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type={showApiKey ? "text" : "password"}
                    value={config.geminiApiKey || ''}
                    onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                    className="form-control"
                    style={{ paddingRight: '2.5rem', fontSize: '0.85rem' }}
                    placeholder="Cole sua chave de API Gemini (AI_ZAsy...)"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    style={{ position: 'absolute', right: '0.75rem', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Restringir a Horário Comercial */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={14} style={{ color: '#f59e0b' }} />
                  Restringir a Horário Comercial
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Responder mensagens apenas dentro do horário configurado</span>
              </div>
              <button 
                type="button" 
                onClick={() => setConfig({ ...config, businessHoursOnly: !config.businessHoursOnly })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: config.businessHoursOnly ? 'var(--primary)' : '#6b7280' }}
              >
                {config.businessHoursOnly ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
              </button>
            </div>

            {/* Intervalo de Horário Comercial */}
            {config.businessHoursOnly && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Hora de Início:</label>
                  <select 
                    value={config.startHour}
                    onChange={(e) => setConfig({ ...config, startHour: parseInt(e.target.value, 10) })}
                    className="form-control"
                    style={{ fontSize: '0.85rem' }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Hora de Término:</label>
                  <select 
                    value={config.endHour}
                    onChange={(e) => setConfig({ ...config, endHour: parseInt(e.target.value, 10) })}
                    className="form-control"
                    style={{ fontSize: '0.85rem' }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button type="submit" disabled={savingConfig} className="btn btn-primary" style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <Save size={16} />
              {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </form>
        </div>

        {/* Logs de Interações Recentes do Chatbot */}
        <div className="card-glass" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={18} style={{ color: '#a78bfa' }} />
            Logs de Respostas Recentes
          </h3>

          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '5rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={32} style={{ color: '#6b7280', marginBottom: '1rem' }} />
              <p>Nenhuma mensagem respondida pelo chatbot recentemente.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
              {logs.map((log) => (
                <div key={log.id} style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.01)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                    <strong>{log.phone}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        padding: '0.05rem 0.4rem', 
                        borderRadius: '10px', 
                        backgroundColor: log.source === 'RULE' ? 'rgba(37,211,102,0.1)' : 'rgba(59,130,246,0.1)',
                        color: log.source === 'RULE' ? 'var(--primary)' : '#3b82f6',
                        fontWeight: 600
                      }}>
                        {log.source === 'RULE' ? 'Palavra-chave' : 'IA Gemini'}
                      </span>
                      <span style={{ color: '#9ca3af' }}>{new Date(log.createdAt).toLocaleTimeString('pt-BR')}</span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem' }}>
                    <div style={{ color: '#9ca3af' }}>
                      Recebido: <span style={{ color: '#fff', fontStyle: 'italic' }}>"{log.messageIn}"</span>
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 500 }}>
                      Enviado: <span>"{log.messageOut}"</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Seção das Regras e Palavras-chave */}
      <div className="card-glass" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <MessageSquare size={18} style={{ color: 'var(--primary)' }} />
            Regras de Auto-Resposta
          </h3>
          <button onClick={handleOpenCreateModal} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
            <Plus size={16} />
            Nova Regra
          </button>
        </div>

        {/* Legenda de Ações */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border)' }}>
          {[{ action: 'REPLY', color: 'rgba(37,211,102,0.15)', text: '#25d366', label: 'Responder' },
            { action: 'TAG_AND_REPLY', color: 'rgba(59,130,246,0.15)', text: '#60a5fa', label: 'Tag + Resposta' },
            { action: 'OPTOUT_AND_REPLY', color: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'Opt-out + Resposta' },
            { action: 'TAG_ONLY', color: 'rgba(167,139,250,0.15)', text: '#c084fc', label: 'Só Etiqueta' },
          ].map(a => (
            <span key={a.action} style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '20px', backgroundColor: a.color, color: a.text, fontWeight: 600 }}>
              {a.label}
            </span>
          ))}
          <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: 'auto', alignSelf: 'center' }}>Regras são executadas em ordem de prioridade (↑ menor = primeiro)</span>
        </div>

        {rules.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '4rem 1rem' }}>
            <Bot size={36} style={{ color: '#6b7280', marginBottom: '1rem' }} />
            <p>Nenhuma regra cadastrada. Crie uma nova regra de palavra-chave para responder mensagens específicas.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: '#9ca3af', width: '40px' }}>#</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#9ca3af' }}>Gatilho</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>Tipo</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>Ação</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#9ca3af' }}>Resposta / Tags</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>Categoria</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const actionColors: Record<string, {bg: string, text: string, label: string}> = {
                    REPLY: { bg: 'rgba(37,211,102,0.12)', text: '#25d366', label: 'Responder' },
                    TAG_AND_REPLY: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', label: 'Tag + Reply' },
                    OPTOUT_AND_REPLY: { bg: 'rgba(239,68,68,0.12)', text: '#f87171', label: 'Opt-out' },
                    TAG_ONLY: { bg: 'rgba(167,139,250,0.12)', text: '#c084fc', label: 'Só Tag' },
                  };
                  const matchLabels: Record<string, string> = {
                    EXACT: 'Exato',
                    CONTAINS: 'Contém',
                    STARTS_WITH: 'Inicia',
                    REGEX: 'Regex',
                  };
                  const ac = actionColors[rule.action || 'REPLY'] || actionColors.REPLY;
                  return (
                    <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)', opacity: rule.isActive ? 1 : 0.5 }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', fontWeight: 700 }}>{rule.priority ?? 0}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        <code style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.82rem' }}>{rule.trigger}</code>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 600,
                          backgroundColor: rule.matchType === 'REGEX' ? 'rgba(251,146,60,0.1)' : rule.matchType === 'EXACT' ? 'rgba(255,255,255,0.05)' : 'rgba(167,139,250,0.1)',
                          color: rule.matchType === 'REGEX' ? '#fb923c' : rule.matchType === 'EXACT' ? '#d1d5db' : '#c084fc'
                        }}>{matchLabels[rule.matchType] || rule.matchType}</span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 600, backgroundColor: ac.bg, color: ac.text }}>{ac.label}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#d1d5db', maxWidth: '220px' }}>
                        {rule.action === 'TAG_ONLY' ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {(rule.autoTags || []).map(t => <span key={t} style={{ padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.68rem', backgroundColor: 'rgba(167,139,250,0.12)', color: '#c084fc' }}>🏷 {t}</span>)}
                          </div>
                        ) : (
                          <>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule.response || <span style={{color:'#6b7280'}}>—</span>}</div>
                            {(rule.autoTags || []).length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.3rem' }}>
                                {rule.autoTags.map(t => <span key={t} style={{ padding: '0.1rem 0.35rem', borderRadius: '10px', fontSize: '0.65rem', backgroundColor: 'rgba(167,139,250,0.1)', color: '#c084fc' }}>🏷 {t}</span>)}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                        {rule.category ? <span style={{ padding: '0.15rem 0.45rem', borderRadius: '20px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}>{rule.category}</span> : <span style={{color:'#4b5563'}}>—</span>}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <button
                          onClick={() => handleToggleRuleActive(rule)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: rule.isActive ? 'var(--primary)' : '#6b7280', padding: 0, fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          {rule.isActive ? '✅ Ativo' : '⏸ Pausado'}
                        </button>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleOpenEditModal(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><Edit size={15} /></button>
                          <button onClick={() => handleDeleteRule(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="card-glass" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{editingRule ? 'Editar Regra' : 'Nova Regra de Auto-Resposta'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveRule} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

              {/* Prioridade + Categoria */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Prioridade <span style={{color:'#6b7280'}}>(menor = primeiro)</span></label>
                  <input
                    type="number" min={0} max={999}
                    value={rulePriority}
                    onChange={(e) => setRulePriority(Number(e.target.value))}
                    className="form-control" style={{ fontSize: '0.85rem' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Categoria <span style={{color:'#6b7280'}}>(opcional)</span></label>
                  <select
                    value={ruleCategory}
                    onChange={(e) => setRuleCategory(e.target.value)}
                    className="form-control" style={{ fontSize: '0.85rem' }}
                  >
                    <option value="">Sem categoria</option>
                    <option value="vendas">Vendas</option>
                    <option value="suporte">Suporte</option>
                    <option value="horário">Horário</option>
                    <option value="produto">Produto</option>
                    <option value="pagamento">Pagamento</option>
                    <option value="faq">FAQ</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
              </div>

              {/* Gatilho */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Palavra-Chave / Gatilho:</label>
                <input
                  type="text" value={ruleTrigger}
                  onChange={(e) => setRuleTrigger(e.target.value)}
                  className="form-control" style={{ fontSize: '0.85rem' }}
                  placeholder="Ex: preco, ola, menu, ^olá.*, \\bpreço\\b"
                />
              </div>

              {/* Match Type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Tipo de Correspondência:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {([['EXACT', 'Igual a'], ['CONTAINS', 'Contém'], ['STARTS_WITH', 'Inicia com'], ['REGEX', 'Regex']] as const).map(([val, label]) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', cursor: 'pointer',
                      padding: '0.3rem 0.7rem', borderRadius: '20px', border: `1px solid ${ruleMatchType === val ? 'var(--primary)' : 'var(--border)'}`,
                      backgroundColor: ruleMatchType === val ? 'rgba(37,211,102,0.08)' : 'transparent', transition: 'all 0.15s' }}>
                      <input type="radio" name="matchType" value={val} checked={ruleMatchType === val} onChange={() => setRuleMatchType(val)} style={{ display: 'none' }} />
                      {label}
                    </label>
                  ))}
                </div>
                {ruleMatchType === 'REGEX' && (
                  <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0 }}>Use expressões regulares JavaScript. Ex: <code style={{backgroundColor:'rgba(255,255,255,0.05)',padding:'0.1rem 0.3rem'}}>^(oi|olá|bom dia)</code></p>
                )}
              </div>

              {/* Ação */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Ação ao Disparar:</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {([
                    ['REPLY', 'Responder', '#25d366'],
                    ['TAG_AND_REPLY', 'Etiquetar + Responder', '#60a5fa'],
                    ['OPTOUT_AND_REPLY', 'Opt-out + Responder', '#f87171'],
                    ['TAG_ONLY', 'Só Etiquetar', '#c084fc'],
                  ] as const).map(([val, label, color]) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', cursor: 'pointer',
                      padding: '0.3rem 0.75rem', borderRadius: '20px', border: `1px solid ${ruleAction === val ? color : 'var(--border)'}`,
                      backgroundColor: ruleAction === val ? `${color}15` : 'transparent', color: ruleAction === val ? color : undefined, transition: 'all 0.15s' }}>
                      <input type="radio" name="ruleAction" value={val} checked={ruleAction === val} onChange={() => setRuleAction(val)} style={{ display: 'none' }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Etiquetas automáticas */}
              {(ruleAction === 'TAG_AND_REPLY' || ruleAction === 'TAG_ONLY') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Etiquetas Automáticas: <span style={{color:'#6b7280'}}>(pressione Enter ou vírgula para adicionar)</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '8px', minHeight: '42px', alignItems: 'center' }}>
                    {ruleAutoTags.map(tag => (
                      <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: '20px', backgroundColor: 'rgba(167,139,250,0.12)', color: '#c084fc', fontSize: '0.8rem' }}>
                        {tag}
                        <button type="button" onClick={() => handleRemoveTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c084fc', padding: '0', lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={ruleTagInput}
                      onChange={(e) => setRuleTagInput(e.target.value)}
                      onKeyDown={handleAddTag}
                      placeholder={ruleAutoTags.length === 0 ? 'interessado, vip, premium...' : ''}
                      style={{ border: 'none', background: 'transparent', outline: 'none', color: '#fff', fontSize: '0.82rem', flexGrow: 1, minWidth: '120px' }}
                    />
                  </div>
                </div>
              )}

              {/* Mensagem de Resposta */}
              {ruleAction !== 'TAG_ONLY' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Mensagem de Resposta:
                    {ruleAction === 'OPTOUT_AND_REPLY' && <span style={{color:'#f87171', marginLeft:'0.4rem'}}>(confirmação de opt-out)</span>}
                  </label>
                  <textarea
                    value={ruleResponse}
                    onChange={(e) => setRuleResponse(e.target.value)}
                    className="form-control"
                    style={{ minHeight: '90px', fontSize: '0.85rem', resize: 'vertical' }}
                    placeholder="Digite o texto que será enviado automaticamente."
                  />
                </div>
              )}

              {/* URL da Imagem */}
              {ruleAction !== 'TAG_ONLY' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.82rem', color: '#9ca3af' }}>URL da Imagem Opcional:</label>
                  <input
                    type="text" value={ruleImageUrl}
                    onChange={(e) => setRuleImageUrl(e.target.value)}
                    className="form-control" style={{ fontSize: '0.85rem' }}
                    placeholder="https://exemplo.com/imagem.png"
                  />
                </div>
              )}

              {/* Ativo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <input type="checkbox" id="ruleIsActive" checked={ruleIsActive} onChange={(e) => setRuleIsActive(e.target.checked)} />
                <label htmlFor="ruleIsActive" style={{ cursor: 'pointer' }}>Regra ativa e respondendo imediatamente</label>
              </div>

              {errorMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#ef4444', fontSize: '0.8rem' }}>
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff' }}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Save size={15} /> Salvar Regra</button>
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

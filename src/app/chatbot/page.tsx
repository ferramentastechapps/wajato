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
  CheckCircle2,
  X
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface ChatbotRule {
  id: string;
  trigger: string;
  matchType: 'EXACT' | 'CONTAINS';
  response: string;
  imageUrl?: string | null;
  isActive: boolean;
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
  const [ruleMatchType, setRuleMatchType] = useState<'EXACT' | 'CONTAINS'>('EXACT');
  const [ruleResponse, setRuleResponse] = useState('');
  const [ruleImageUrl, setRuleImageUrl] = useState('');
  const [ruleIsActive, setRuleIsActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

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
    if (!ruleResponse.trim()) {
      setErrorMsg('A mensagem de resposta é obrigatória');
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
            Regras de Respostas por Palavras-Chave
          </h3>
          <button onClick={handleOpenCreateModal} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
            <Plus size={16} />
            Nova Regra
          </button>
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
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#9ca3af' }}>Gatilho / Palavra-Chave</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#9ca3af' }}>Tipo</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#9ca3af' }}>Resposta</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#9ca3af' }}>Imagem</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#9ca3af' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#9ca3af', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>{rule.trigger}</td>
                    <td style={{ padding: '1rem', fontSize: '0.8rem' }}>
                      <span style={{ 
                        padding: '0.15rem 0.5rem', 
                        borderRadius: '20px', 
                        fontSize: '0.7rem',
                        backgroundColor: rule.matchType === 'EXACT' ? 'rgba(255,255,255,0.05)' : 'rgba(167,139,250,0.1)',
                        color: rule.matchType === 'EXACT' ? '#d1d5db' : '#c084fc'
                      }}>
                        {rule.matchType === 'EXACT' ? 'Igual a' : 'Contém'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#d1d5db', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rule.response}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                      {rule.imageUrl ? (
                        <a href={rule.imageUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#3b82f6', textDecoration: 'none' }}>
                          <Eye size={12} />
                          Visualizar
                        </a>
                      ) : (
                        <span style={{ color: '#6b7280' }}>Não</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <button 
                        onClick={() => handleToggleRuleActive(rule)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: rule.isActive ? 'var(--primary)' : '#6b7280',
                          padding: 0
                        }}
                      >
                        {rule.isActive ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleOpenEditModal(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDeleteRule(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
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

      {/* Modal de Criação / Edição de Regra */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="card-glass" style={{ width: '100%', maxWidth: '500px', padding: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{editingRule ? 'Editar Regra' : 'Criar Nova Regra'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRule} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Trigger */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Palavra-Chave / Gatilho:</label>
                <input 
                  type="text" 
                  value={ruleTrigger}
                  onChange={(e) => setRuleTrigger(e.target.value)}
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  placeholder="Ex: preco, ola, menu"
                />
              </div>

              {/* Match Type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Tipo de Correspondência:</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="matchType" 
                      value="EXACT" 
                      checked={ruleMatchType === 'EXACT'} 
                      onChange={() => setRuleMatchType('EXACT')}
                    />
                    Correspondência Exata (Igual a)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="matchType" 
                      value="CONTAINS" 
                      checked={ruleMatchType === 'CONTAINS'} 
                      onChange={() => setRuleMatchType('CONTAINS')}
                    />
                    Contém a palavra-chave
                  </label>
                </div>
              </div>

              {/* Response Message */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Mensagem de Resposta:</label>
                <textarea 
                  value={ruleResponse}
                  onChange={(e) => setRuleResponse(e.target.value)}
                  className="form-control"
                  style={{ minHeight: '100px', fontSize: '0.85rem', resize: 'vertical' }}
                  placeholder="Digite o texto que será enviado automaticamente."
                />
              </div>

              {/* Image URL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>URL da Imagem Opcional (Envio de mídia):</label>
                <input 
                  type="text" 
                  value={ruleImageUrl}
                  onChange={(e) => setRuleImageUrl(e.target.value)}
                  className="form-control"
                  style={{ fontSize: '0.85rem' }}
                  placeholder="https://exemplo.com/imagem.png"
                />
              </div>

              {/* Status Ativo/Inativo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <input 
                  type="checkbox" 
                  id="ruleIsActive" 
                  checked={ruleIsActive} 
                  onChange={(e) => setRuleIsActive(e.target.checked)}
                />
                <label htmlFor="ruleIsActive" style={{ cursor: 'pointer' }}>Regra ativa e respondendo imediatamente</label>
              </div>

              {errorMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#ef4444', fontSize: '0.8rem' }}>
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar
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

'use client';

import React, { useState, useEffect } from 'react';
import { X, Flame, Clock, TrendingUp, Zap, MessageSquare, Briefcase, HelpCircle, Settings } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Intensity = 'soft' | 'moderate' | 'aggressive';
type ContextPreset = 'friend' | 'sales' | 'support' | 'custom';

const INTENSITY_CONFIG: Record<Intensity, { label: string; initial: number; max: number; days: number; description: string; icon: string }> = {
  soft: {
    label: 'Suave',
    initial: 5,
    max: 80,
    days: 30,
    description: 'Ideal para chips novos. 5 msgs/dia → até 80/dia em 30 dias. Menor risco.',
    icon: '🌱',
  },
  moderate: {
    label: 'Moderado',
    initial: 8,
    max: 120,
    days: 21,
    description: 'Equilíbrio entre velocidade e segurança. 8 msgs/dia → até 120/dia em 21 dias.',
    icon: '🔥',
  },
  aggressive: {
    label: 'Agressivo',
    initial: 12,
    max: 150,
    days: 14,
    description: 'Para chips com algum histórico. 12 msgs/dia → até 150/dia em 14 dias. Maior risco.',
    icon: '⚡',
  },
};

const CONTEXT_PRESETS: Record<ContextPreset, { label: string; description: string; prompt: string; icon: React.ReactNode }> = {
  friend: {
    label: 'Amizade Casual',
    description: 'Conversas cotidianas informais sobre futebol, filmes, memes e planos. Ideal para maturação natural.',
    prompt: 'Você é um amigo íntimo conversando de forma super descontraída, falando sobre o dia a dia, hobbies, futebol, streams e planos para o fim de semana. Use bastante gírias brasileiras comuns e abreviações do WhatsApp.',
    icon: <MessageSquare size={20} />,
  },
  sales: {
    label: 'Comercial / Vendas',
    description: 'Simula um cliente perguntando sobre produtos, preços, descontos e formas de pagamento.',
    prompt: 'Você está simulando um potencial cliente interessado em comprar um produto ou serviço. Faça perguntas sobre preços, frete, desconto no Pix, garantias e tire dúvidas comuns de compra de forma natural.',
    icon: <Briefcase size={20} />,
  },
  support: {
    label: 'Suporte Técnico',
    description: 'Simula um cliente pedindo ajuda com problemas em um serviço ou produto de pós-venda.',
    prompt: 'Você está simulando um cliente com problemas técnicos. Peça suporte sobre um erro, tire dúvidas de uso de um produto, mostre dúvidas sobre o funcionamento e agradeça pelas instruções de forma realista.',
    icon: <HelpCircle size={20} />,
  },
  custom: {
    label: 'Personalizado',
    description: 'Escreva seu próprio prompt para definir exatamente o comportamento da Inteligência Artificial.',
    prompt: '',
    icon: <Settings size={20} />,
  },
};

export default function CreateWarmupModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<{ name: string; status: string }[]>([]);

  // Form fields
  const [name, setName] = useState('');
  const [sourceInstance, setSourceInstance] = useState('');
  const [targetInstance, setTargetInstance] = useState('');
  const [targetPhonesInput, setTargetPhonesInput] = useState('');
  const [contextPreset, setContextPreset] = useState<ContextPreset>('friend');
  const [customContextInput, setCustomContextInput] = useState('');
  const [intensity, setIntensity] = useState<Intensity>('soft');
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(22);
  const [error, setError] = useState('');

  useEffect(() => {
    // Buscar instâncias conectadas
    fetch('/api/whatsapp/connect')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.instances || [];
        setInstances(list.filter((i: any) => i.status === 'CONNECTED'));
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sourceInstance) {
      setError('Instância de origem é obrigatória.');
      return;
    }

    // Processa e limpa os telefones de destino (aceita quebras de linha, espaços, vírgulas ou ponto e vírgula como separadores)
    const phonesList = targetPhonesInput
      .split(/[\s,;]+/)
      .map(p => p.replace(/\D/g, ''))
      .filter(Boolean);

    if (phonesList.length === 0) {
      setError('Insira pelo menos um telefone de destino válido.');
      return;
    }

    if (startHour >= endHour) {
      setError('Hora de início deve ser menor que hora de fim.');
      return;
    }

    const selectedPreset = CONTEXT_PRESETS[contextPreset];
    const finalContext = contextPreset === 'custom' ? customContextInput : selectedPreset.prompt;

    if (contextPreset === 'custom' && !customContextInput.trim()) {
      setError('Por favor, escreva a instrução da sua persona personalizada.');
      return;
    }

    setLoading(true);
    const config = INTENSITY_CONFIG[intensity];

    try {
      const res = await fetch('/api/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          sourceInstance,
          targetInstance: targetInstance || null,
          targetPhone: phonesList[0],
          targetPhones: phonesList.join(','),
          customContext: finalContext,
          totalDays: config.days,
          initialMsgsPerDay: config.initial,
          maxMsgsPerDay: config.max,
          startHour,
          endHour,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onCreated();
      } else {
        setError(data.error || 'Erro ao criar campanha de aquecimento.');
      }
    } catch (err) {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const selectedConfig = INTENSITY_CONFIG[intensity];

  return (
    <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="modal-content" style={{ width: '100%', maxWidth: '620px', background: 'linear-gradient(145deg, #0f172a, #0b0f19)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '1.75rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)',
            }}>
              <Flame size={20} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 800 }}>Configurar Aquecimento</h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>
                Simulação de Comportamento Humano Avançada • Passo {step} de 2
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', padding: '6px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}><X size={20} /></button>
        </div>

        {/* Steps Progress bar */}
        <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', marginBottom: '1.5rem', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${step * 50}%`,
            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
            borderRadius: '4px',
            transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 8px rgba(245, 158, 11, 0.5)',
          }} />
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Nome */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Nome do Ciclo
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Maturação Chip Principal"
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                />
              </div>

              {/* Grid Instâncias */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Instância Origem */}
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Origem (Instância) *
                  </label>
                  {instances.length > 0 ? (
                    <select
                      className="form-input"
                      value={sourceInstance}
                      onChange={e => setSourceInstance(e.target.value)}
                      required
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      <option value="" style={{ background: '#0b0f19' }}>Selecione...</option>
                      {instances.map(inst => (
                        <option key={inst.name} value={inst.name} style={{ background: '#0b0f19' }}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={sourceInstance}
                      onChange={e => setSourceInstance(e.target.value)}
                      placeholder="Ex: wajato-session-1"
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    />
                  )}
                </div>

                {/* Instância Destino (opcional) */}
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Resposta (Bidirecional)
                  </label>
                  {instances.length > 1 ? (
                    <select
                      className="form-input"
                      value={targetInstance}
                      onChange={e => setTargetInstance(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      <option value="" style={{ background: '#0b0f19' }}>Sem resposta (Unidirecional)</option>
                      {instances.filter(i => i.name !== sourceInstance).map(inst => (
                        <option key={inst.name} value={inst.name} style={{ background: '#0b0f19' }}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      value={targetInstance}
                      onChange={e => setTargetInstance(e.target.value)}
                      placeholder="Ex: wajato-session-2 (opcional)"
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    />
                  )}
                </div>
              </div>

              {/* Múltiplos Telefones */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Lista de Telefones de Destino * <span style={{ fontWeight: 400, textTransform: 'none', color: 'rgba(255,255,255,0.4)', letterSpacing: 0 }}>(Um número por linha com DDI)</span>
                </label>
                <textarea
                  className="form-input"
                  required
                  rows={4}
                  value={targetPhonesInput}
                  onChange={e => setTargetPhonesInput(e.target.value)}
                  placeholder="5511999999999&#10;5511888888888&#10;5511777777777"
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none', fontFamily: 'monospace', resize: 'vertical', fontSize: '0.85rem' }}
                />
                <small style={{ color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: 4 }}>
                  💡 O robô rotacionará os envios automaticamente entre estes números, evitando falar com apenas um chip.
                </small>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '0.65rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px' }}>
                  ⚠️ {error}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.85rem', fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
                onClick={() => {
                  if (sourceInstance && targetPhonesInput.trim()) {
                    setStep(2);
                    setError('');
                  } else {
                    setError('Preencha os campos obrigatórios (Origem e Telefones de Destino).');
                  }
                }}
              >
                Configurar Persona & Horários →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Seletor de Persona/Contexto */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.6rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Contexto de Conversa & Persona IA
                </label>
                
                {/* Grid de Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  {(Object.entries(CONTEXT_PRESETS) as [ContextPreset, typeof CONTEXT_PRESETS[ContextPreset]][]).map(([key, item]) => {
                    const isSelected = contextPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setContextPreset(key)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.6rem',
                          padding: '0.75rem',
                          borderRadius: '12px',
                          border: `2px solid ${isSelected ? '#f59e0b' : 'rgba(255,255,255,0.06)'}`,
                          background: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
                          color: isSelected ? '#fff' : 'rgba(255,255,255,0.65)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{
                          color: isSelected ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                          marginTop: '2px',
                        }}>
                          {item.icon}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isSelected ? '#f59e0b' : '#fff' }}>{item.label}</span>
                          <span style={{ fontSize: '0.65rem', lineHeight: '1.2', opacity: 0.85 }}>{item.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Editor Customizado ou Detalhe do Preset */}
                {contextPreset === 'custom' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <textarea
                      className="form-input"
                      required
                      rows={3}
                      value={customContextInput}
                      onChange={e => setCustomContextInput(e.target.value)}
                      placeholder="Ex: Você é um cliente interessado em alugar um imóvel. Faça perguntas sobre número de quartos, valor do condomínio, se aceita pet, agende uma visita..."
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none', fontSize: '0.82rem', resize: 'vertical' }}
                    />
                    <small style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem' }}>
                      Escreva em detalhes quem a IA deve simular e quais assuntos ela deve trazer na conversa.
                    </small>
                  </div>
                ) : (
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: '1.4',
                  }}>
                    <strong style={{ color: '#fff', marginRight: 4 }}>Prompt Enviado:</strong>
                    "{CONTEXT_PRESETS[contextPreset].prompt}"
                  </div>
                )}
              </div>

              {/* Intensidade */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.6rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Intensidade do Aquecimento
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(Object.entries(INTENSITY_CONFIG) as [Intensity, typeof INTENSITY_CONFIG[Intensity]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIntensity(key)}
                      style={{
                        flex: 1,
                        padding: '0.65rem 0.5rem',
                        border: `2px solid ${intensity === key ? '#ef4444' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: '10px',
                        background: intensity === key ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.02)',
                        color: intensity === key ? '#ef4444' : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>{cfg.icon}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: intensity === key ? '#ef4444' : '#fff' }}>{cfg.label}</span>
                      <span style={{ fontSize: '0.62rem', opacity: 0.7 }}>{cfg.days} dias</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Horário e Janela */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Clock size={14} /> Janela Ativa (Horário Comercial)
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <select
                      className="form-input"
                      value={startHour}
                      onChange={e => setStartHour(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i} style={{ background: '#0b0f19' }}>Das {String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>até as</span>
                  <div style={{ flex: 1 }}>
                    <select
                      className="form-input"
                      value={endHour}
                      onChange={e => setEndHour(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i} style={{ background: '#0b0f19' }}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Resumo */}
              <div style={{
                padding: '0.85rem 1rem',
                background: 'rgba(16, 185, 129, 0.04)',
                border: '1px solid rgba(16, 185, 129, 0.12)',
                borderRadius: '12px',
                fontSize: '0.78rem',
              }}>
                <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={14} /> Resumo do Ramp-Up Progressivo
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', color: 'rgba(255,255,255,0.6)' }}>
                  <span>📅 Duração: <strong style={{ color: '#fff' }}>{selectedConfig.days} dias</strong></span>
                  <span>🚀 Início: <strong style={{ color: '#fff' }}>{selectedConfig.initial} msgs/dia</strong></span>
                  <span>🏆 Máximo: <strong style={{ color: '#fff' }}>{selectedConfig.max} msgs/dia</strong></span>
                  <span>⏰ Janela: <strong style={{ color: '#fff' }}>{startHour}h–{endHour}h (BRT)</strong></span>
                </div>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '0.65rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px' }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Botoes de Acao */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1, padding: '0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ← Voltar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2, padding: '0.85rem', fontWeight: 700, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.25)' }}>
                  {loading ? (
                    <>
                      <Zap size={15} />
                      Iniciando ciclo...
                    </>
                  ) : (
                    <>
                      <Flame size={15} />
                      Iniciar Aquecimento
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

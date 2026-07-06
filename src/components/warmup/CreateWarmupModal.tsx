'use client';

import React, { useState, useEffect } from 'react';
import { X, Flame, Clock, TrendingUp, Zap } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Intensity = 'soft' | 'moderate' | 'aggressive';

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

export default function CreateWarmupModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<{ name: string; status: string }[]>([]);

  // Form fields
  const [name, setName] = useState('');
  const [sourceInstance, setSourceInstance] = useState('');
  const [targetInstance, setTargetInstance] = useState('');
  const [targetPhone, setTargetPhone] = useState('');
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

    if (!sourceInstance || !targetPhone) {
      setError('Instância de origem e telefone de destino são obrigatórios.');
      return;
    }

    if (startHour >= endHour) {
      setError('Hora de início deve ser menor que hora de fim.');
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
          targetPhone,
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
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Flame size={18} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Novo Ciclo de Aquecimento</h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                Passo {step} de 2
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', margin: '1rem 0', borderRadius: 2 }}>
          <div style={{
            height: '100%',
            width: `${step * 50}%`,
            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Nome */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
                  Nome da Campanha (opcional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Chip Vendas Novembro"
                />
              </div>

              {/* Instância Origem */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
                  Instância de Origem *
                </label>
                {instances.length > 0 ? (
                  <select
                    className="form-input"
                    value={sourceInstance}
                    onChange={e => setSourceInstance(e.target.value)}
                    required
                  >
                    <option value="">Selecione uma instância conectada...</option>
                    {instances.map(inst => (
                      <option key={inst.name} value={inst.name}>
                        {inst.name} ✅
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
                  />
                )}
                <small style={{ color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: 4 }}>
                  A instância que iniciará as conversas
                </small>
              </div>

              {/* Telefone Destino */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
                  Telefone de Destino * <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>(com DDI)</span>
                </label>
                <input
                  type="tel"
                  className="form-input"
                  required
                  value={targetPhone}
                  onChange={e => setTargetPhone(e.target.value)}
                  placeholder="5511999999999"
                />
                <small style={{ color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: 4 }}>
                  Para quem as mensagens serão enviadas
                </small>
              </div>

              {/* Instância Destino (opcional) */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
                  Instância de Resposta <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>(opcional — diálogo bidirecional)</span>
                </label>
                {instances.length > 1 ? (
                  <select
                    className="form-input"
                    value={targetInstance}
                    onChange={e => setTargetInstance(e.target.value)}
                  >
                    <option value="">Sem resposta automática (unidirecional)</option>
                    {instances.filter(i => i.name !== sourceInstance).map(inst => (
                      <option key={inst.name} value={inst.name}>
                        {inst.name} ✅
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
                  />
                )}
                <small style={{ color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: 4 }}>
                  Se preenchido, essa instância responde de volta — simula diálogo real
                </small>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => { if (sourceInstance && targetPhone) setStep(2); else setError('Preencha os campos obrigatórios.'); }}
              >
                Próximo →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Intensidade */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.6rem', display: 'block' }}>
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
                        padding: '0.75rem 0.5rem',
                        border: `2px solid ${intensity === key ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: '10px',
                        background: intensity === key ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)',
                        color: intensity === key ? '#f59e0b' : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span style={{ fontSize: '1.2rem' }}>{cfg.icon}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{cfg.label}</span>
                      <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{cfg.days} dias</span>
                    </button>
                  ))}
                </div>
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: 'rgba(255,255,255,0.7)',
                }}>
                  <strong style={{ color: '#f59e0b' }}>
                    {selectedConfig.icon} {selectedConfig.label}:
                  </strong>{' '}
                  {selectedConfig.description}
                </div>
              </div>

              {/* Horário Comercial */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={14} />
                  Janela de Horário (BRT)
                </label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Das</label>
                    <select
                      className="form-input"
                      value={startHour}
                      onChange={e => setStartHour(Number(e.target.value))}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', paddingTop: '1.5rem' }}>até</span>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Até</label>
                    <select
                      className="form-input"
                      value={endHour}
                      onChange={e => setEndHour(Number(e.target.value))}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
                <small style={{ color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: 4 }}>
                  Mensagens só serão enviadas dentro desse intervalo. Fins de semana reduzem 50%.
                </small>
              </div>

              {/* Resumo */}
              <div style={{
                padding: '1rem',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '10px',
                fontSize: '0.82rem',
              }}>
                <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={14} /> Resumo do Ramp-Up
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', color: 'rgba(255,255,255,0.7)' }}>
                  <span>📅 Duração: <strong style={{ color: 'white' }}>{selectedConfig.days} dias</strong></span>
                  <span>🚀 Início: <strong style={{ color: 'white' }}>{selectedConfig.initial} msgs/dia</strong></span>
                  <span>🏆 Máximo: <strong style={{ color: 'white' }}>{selectedConfig.max} msgs/dia</strong></span>
                  <span>⏰ Janela: <strong style={{ color: 'white' }}>{startHour}h–{endHour}h</strong></span>
                </div>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                  ← Voltar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                      <Zap size={14} />
                      Iniciando...
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                      <Flame size={14} />
                      Iniciar Aquecimento
                    </span>
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

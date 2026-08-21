'use client';

import React, { useState, useEffect } from 'react';
import { X, Flame, Clock, Play, Save, AlertCircle } from 'lucide-react';

interface Props {
  campaignId: string;
  onClose: () => void;
  onUpdated: () => void;
}

interface Campaign {
  id: string;
  name?: string;
  sourceInstance: string;
  targetPhone: string;
  status: string;
  currentDay: number;
  totalDays: number;
  msgsSentToday: number;
  targetMsgsToday: number;
  startHour: number;
  endHour: number;
  customContext?: string | null;
  initialMsgsPerDay: number;
  maxMsgsPerDay: number;
  enableStatus: boolean;
  statusFrequency: number;
  statusType: string;
  continuousMode?: boolean;
}

export default function EditWarmupModal({ campaignId, onClose, onUpdated }: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [targetPhone, setTargetPhone] = useState('');
  const [currentDay, setCurrentDay] = useState(1);
  const [totalDays, setTotalDays] = useState(30);
  const [msgsSentToday, setMsgsSentToday] = useState(0);
  const [targetMsgsToday, setTargetMsgsToday] = useState(5);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(22);
  const [customContext, setCustomContext] = useState('');
  const [initialMsgsPerDay, setInitialMsgsPerDay] = useState(5);
  const [maxMsgsPerDay, setMaxMsgsPerDay] = useState(150);
  const [continuousMode, setContinuousMode] = useState(true);

  useEffect(() => {
    // Fetch campaign details
    setLoading(true);
    fetch(`/api/warmup/${campaignId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Erro ao carregar dados da campanha.');
        return r.json();
      })
      .then((data: Campaign) => {
        setCampaign(data);
        setName(data.name || '');
        setTargetPhone(data.targetPhone || '');
        setCurrentDay(data.currentDay);
        setTotalDays(data.totalDays);
        setMsgsSentToday(data.msgsSentToday);
        setTargetMsgsToday(data.targetMsgsToday);
        setStartHour(data.startHour);
        setEndHour(data.endHour);
        setCustomContext(data.customContext || '');
        setInitialMsgsPerDay(data.initialMsgsPerDay);
        setMaxMsgsPerDay(data.maxMsgsPerDay);
        setContinuousMode(data.continuousMode !== undefined ? data.continuousMode : true);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [campaignId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!targetPhone.trim()) {
      setError('Telefone de destino é obrigatório.');
      return;
    }

    if (startHour >= endHour) {
      setError('A hora de início deve ser menor que a hora de término.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/warmup/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          targetPhone: targetPhone.replace(/\D/g, '').trim(),
          currentDay,
          totalDays,
          msgsSentToday,
          targetMsgsToday,
          startHour,
          endHour,
          customContext: customContext.trim() || null,
          initialMsgsPerDay,
          maxMsgsPerDay,
          continuousMode,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onUpdated();
      } else {
        setError(data.error || 'Erro ao atualizar campanha.');
      }
    } catch (err) {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="modal-content" style={{ width: '100%', maxWidth: '600px', background: 'linear-gradient(145deg, #0f172a, #0b0f19)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '1.75rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flame style={{ color: '#f59e0b' }} size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 800 }}>Editar Ciclo de Aquecimento</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                Instância de origem: <strong style={{ color: '#f59e0b' }}>{campaign?.sourceInstance}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255, 255, 255, 0.06)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9rem' }}>
            Carregando dados da campanha...
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Nome e Telefone de Destino */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.65)', marginBottom: '0.4rem', display: 'block' }}>
                  Identificador / Nome do Ciclo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Aquecimento Marcelo"
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.65)', marginBottom: '0.4rem', display: 'block' }}>
                  Telefone de Destino
                </label>
                <input
                  type="text"
                  required
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  placeholder="Somente números com DDD"
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Ciclo e Progresso do Dia */}
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>Progresso do Ciclo</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.2rem', display: 'block' }}>
                      Dia Atual do Ciclo (1 a {totalDays})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={totalDays}
                      value={currentDay}
                      onChange={(e) => setCurrentDay(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.2rem', display: 'block' }}>
                      Duração Total (Dias)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={totalDays}
                      onChange={(e) => setTotalDays(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>Mensagens de Hoje</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.2rem', display: 'block' }}>
                      Mensagens Enviadas Hoje
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={msgsSentToday}
                      onChange={(e) => setMsgsSentToday(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.2rem', display: 'block' }}>
                      Meta de Mensagens Hoje
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={targetMsgsToday}
                      onChange={(e) => setTargetMsgsToday(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Janela de Horário */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.65)', marginBottom: '0.5rem', display: 'block' }}>
                Janela de Atendimento (Expediente)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '10px' }}>
                <Clock size={16} style={{ color: 'rgba(255, 255, 255, 0.4)' }} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <select
                    value={startHour}
                    onChange={(e) => setStartHour(Number(e.target.value))}
                    style={{ flex: 1, padding: '0.45rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h} style={{ background: '#0b0f19' }}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>até</span>
                  <select
                    value={endHour}
                    onChange={(e) => setEndHour(Number(e.target.value))}
                    style={{ flex: 1, padding: '0.45rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h} style={{ background: '#0b0f19' }}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Configurações de Ramp-up */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.65)', marginBottom: '0.4rem', display: 'block' }}>
                  Volume Inicial (msgs/dia)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={initialMsgsPerDay}
                  onChange={(e) => setInitialMsgsPerDay(Number(e.target.value))}
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.65)', marginBottom: '0.4rem', display: 'block' }}>
                  Limite Máximo (msgs/dia)
                </label>
                <input
                  type="number"
                  min={10}
                  value={maxMsgsPerDay}
                  onChange={(e) => setMaxMsgsPerDay(Number(e.target.value))}
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Prompt de Contexto */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255, 255, 255, 0.65)', marginBottom: '0.4rem', display: 'block' }}>
                Prompt de Persona & Contexto Customizado da IA
              </label>
              <textarea
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="Escreva a persona e instruções de conversação para o Google Gemini..."
                rows={3}
                style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', resize: 'vertical', fontSize: '0.82rem', fontFamily: 'inherit' }}
              />
            </div>

            {/* Modo Contínuo / Manutenção */}
            <div style={{
              padding: '1rem',
              background: continuousMode ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
              border: continuousMode ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: continuousMode ? '#60a5fa' : 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔁 Modo Contínuo (Manutenção Antiban)</span>
                    <span style={{ fontSize: '0.62rem', background: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>Recomendado</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                    Mantém trocas bilaterais diárias para blindar o chip contra bloqueios enquanto você realiza disparos para números frios.
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={continuousMode}
                    onChange={e => setContinuousMode(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: continuousMode ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                    borderRadius: 24, transition: '0.3s'
                  }}>
                    <span style={{
                      position: 'absolute', height: 18, width: 18, left: continuousMode ? 23 : 3, bottom: 3,
                      backgroundColor: 'white', borderRadius: '50%', transition: '0.3s'
                    }} />
                  </span>
                </label>
              </div>

              {/* Ajuste de Volume de Manutenção Diária & Balanço de Disparos Frios */}
              {continuousMode && (
                <div style={{
                  padding: '0.85rem',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#93c5fd' }}>
                      🔥 Volume de Manutenção (Aquecimento Diário):
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={maxMsgsPerDay}
                        onChange={e => {
                          const val = Math.max(5, Math.min(180, Number(e.target.value) || 5));
                          setMaxMsgsPerDay(val);
                          if (currentDay >= totalDays) {
                            setTargetMsgsToday(val);
                          }
                        }}
                        style={{
                          width: '65px',
                          padding: '0.3rem 0.5rem',
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>msgs/dia</span>
                    </div>
                  </div>

                  {/* Atalhos Rápidos */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[20, 30, 40, 60, 80].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setMaxMsgsPerDay(v);
                          if (currentDay >= totalDays) {
                            setTargetMsgsToday(v);
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: '50px',
                          padding: '0.3rem 0.4rem',
                          fontSize: '0.72rem',
                          fontWeight: maxMsgsPerDay === v ? 700 : 500,
                          background: maxMsgsPerDay === v ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.04)',
                          border: maxMsgsPerDay === v ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          color: maxMsgsPerDay === v ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {v} msgs
                      </button>
                    ))}
                  </div>

                  {/* Barra de Distribuição da Capacidade do Chip (Total 200 msgs) */}
                  <div style={{ marginTop: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 4 }}>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                        🔥 Aquecimento: <strong>{maxMsgsPerDay}</strong> msgs
                      </span>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                        ❄️ Disparos Frios: <strong>{Math.max(0, 200 - maxMsgsPerDay)}</strong> msgs
                      </span>
                    </div>

                    {/* Split bar */}
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                      <div
                        style={{
                          width: `${Math.min(100, (maxMsgsPerDay / 200) * 100)}%`,
                          background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                          transition: 'width 0.3s',
                        }}
                        title={`Aquecimento: ${maxMsgsPerDay} msgs`}
                      />
                      <div
                        style={{
                          width: `${Math.max(0, 100 - (maxMsgsPerDay / 200) * 100)}%`,
                          background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                          transition: 'width 0.3s',
                        }}
                        title={`Disparos Frios Livres: ${Math.max(0, 200 - maxMsgsPerDay)} msgs`}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                      <span>0</span>
                      <span>Capacidade Total Segura do Chip: 200 msgs/dia</span>
                      <span>200</span>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', lineHeight: '1.3' }}>
                    💡 <em>Com o chip já maturado, você pode reduzir o aquecimento (ex: de 80 para 30 ou 20 msgs) para liberar mais envios para números frios sem risco de banimento.</em>
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '0.65rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={{ flex: 1, padding: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ flex: 1, padding: '0.75rem', border: 'none', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', borderRadius: '10px', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)', transition: 'opacity 0.2s' }}
              >
                {saving ? (
                  <>Salvando...</>
                ) : (
                  <>
                    <Save size={16} />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}

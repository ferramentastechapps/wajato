'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { 
  Smartphone, 
  Plus, 
  Wifi, 
  WifiOff, 
  Trash2, 
  RefreshCw, 
  Flame, 
  Activity, 
  Layers,
  LogOut,
  X,
  Copy,
  Check,
  ChevronLeft,
  Key
} from 'lucide-react';
import Link from 'next/link';

interface Instance {
  id: string;
  name: string;
  status: 'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED';
  phone: string | null;
  qrCode: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  warmupProgress: number;
  heatScore: number;
  activeWarmupType: 'SINGLE' | 'POOL' | 'NONE';
  warmupCampaignId: string | null;
  warmupPoolId: string | null;
}

export default function ConnectionsPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Ações de carregamento individuais por instância
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Estados para Código de Pareamento por instância
  const [activeConnectTab, setActiveConnectTab] = useState<Record<string, 'qr' | 'code'>>({});
  const [pairingPhones, setPairingPhones] = useState<Record<string, string>>({});
  const [pairingCodes, setPairingCodes] = useState<Record<string, string>>({});
  const [pairingLoading, setPairingLoading] = useState<Record<string, boolean>>({});
  const [pairingErrors, setPairingErrors] = useState<Record<string, string>>({});
  const [copiedInstance, setCopiedInstance] = useState<string | null>(null);

  const fetchInstances = async () => {
    try {
      const res = await fetch('/api/whatsapp/instances');
      if (res.ok) setInstances(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!newInstanceName.trim()) {
      setModalError('O nome é obrigatório.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newInstanceName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        setNewInstanceName('');
        await fetchInstances();
      } else {
        setModalError(data.error || 'Erro ao criar instância.');
      }
    } catch (err) {
      setModalError('Erro de conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async (name: string) => {
    setActionLoading(name);
    try {
      await fetch(`/api/whatsapp/instances/${name}`);
      await fetchInstances();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async (name: string) => {
    if (!confirm('Deseja realmente desconectar este chip do WhatsApp?')) return;
    setActionLoading(name);
    try {
      await fetch(`/api/whatsapp/instances/${name}/logout`, { method: 'POST' });
      // Limpa os estados de pareamento salvos localmente ao desconectar
      setPairingCodes(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      await fetchInstances();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm('ATENÇÃO: Excluir a conexão removerá todos os dados locais e de aquecimento dela. Confirmar exclusão?')) return;
    setActionLoading(name);
    try {
      await fetch(`/api/whatsapp/instances/${name}`, { method: 'DELETE' });
      await fetchInstances();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGeneratePairingCode = async (instanceName: string) => {
    const rawPhone = pairingPhones[instanceName];
    if (!rawPhone || !rawPhone.trim()) {
      setPairingErrors(prev => ({ ...prev, [instanceName]: 'Informe o telefone com DDI e DDD.' }));
      return;
    }

    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setPairingErrors(prev => ({ ...prev, [instanceName]: 'Número muito curto. Digite com DDD.' }));
      return;
    }

    setPairingErrors(prev => ({ ...prev, [instanceName]: '' }));
    setPairingLoading(prev => ({ ...prev, [instanceName]: true }));

    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const data = await res.json();
      if (res.ok) {
        setPairingCodes(prev => ({ ...prev, [instanceName]: data.code }));
      } else {
        setPairingErrors(prev => ({ ...prev, [instanceName]: data.error || 'Falha ao obter código.' }));
      }
    } catch (err) {
      setPairingErrors(prev => ({ ...prev, [instanceName]: 'Erro ao conectar ao servidor.' }));
    } finally {
      setPairingLoading(prev => ({ ...prev, [instanceName]: false }));
    }
  };

  const copyToClipboard = (text: string, name: string) => {
    navigator.clipboard.writeText(text);
    setCopiedInstance(name);
    setTimeout(() => setCopiedInstance(null), 2000);
  };

  // Estatísticas do topo
  const total = instances.length;
  const connected = instances.filter(i => i.status === 'CONNECTED').length;
  const avgWarmup = total > 0
    ? Math.round(instances.reduce((acc, i) => acc + i.warmupProgress, 0) / total)
    : 0;

  return (
    <AppLayout title="Conexões WhatsApp">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Smartphone style={{ color: '#10b981' }} size={24} />
            Conexões WhatsApp (Instâncias)
          </h1>
          <p className="page-description">
            Adicione e gerencie múltiplos números de WhatsApp para envio de campanhas e ciclos de aquecimento mútuo.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          <span>Nova Conexão</span>
        </button>
      </div>

      {/* Estatísticas resumidas do topo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card-glass" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: '12px' }}>
            <Smartphone size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>{total}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Total de Chips Cadastrados</div>
          </div>
        </div>
        <div className="card-glass" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: '12px' }}>
            <Wifi size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{connected}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Chips Conectados</div>
          </div>
        </div>
        <div className="card-glass" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: '12px' }}>
            <Flame size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>{avgWarmup}%</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Média de Aquecimento</div>
          </div>
        </div>
      </div>

      {/* Grid de Instâncias */}
      {loading && instances.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>Buscando chips conectados...</div>
        </div>
      ) : instances.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
          <h3 style={{ margin: '0 0 0.5rem', color: 'rgba(255,255,255,0.8)' }}>Nenhuma conexão de WhatsApp ativa</h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
            Para começar a aquecer ou enviar mensagens, crie e conecte sua primeira instância de chip.
          </p>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            Cadastrar Primeiro Chip
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {instances.map(inst => {
            const isConnected = inst.status === 'CONNECTED';
            const isInitializing = inst.status === 'INITIALIZING';
            const isActLoading = actionLoading === inst.name;
            const currentTab = activeConnectTab[inst.name] || 'qr';
            const pairingCode = pairingCodes[inst.name];
            const isPairLoading = pairingLoading[inst.name];
            const pairError = pairingErrors[inst.name];

            return (
              <div
                key={inst.id}
                className="card-glass card-glow"
                style={{
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  border: isConnected ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                {/* Perfil & Status */}
                <div style={{
                  padding: '1.25rem',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}>
                  {/* Foto de Perfil */}
                  {isConnected && inst.profilePicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inst.profilePicUrl}
                      alt="Avatar"
                      style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #10b981' }}
                    />
                  ) : (
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #1e293b, #334155)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      color: isConnected ? '#10b981' : '#6b7280',
                      border: isConnected ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.05)',
                    }}>
                      {inst.profileName ? inst.profileName[0]?.toUpperCase() : inst.name[0]?.toUpperCase()}
                    </div>
                  )}

                  {/* Nome da Instância e Telefone */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inst.profileName || inst.name}
                      </h4>
                      {inst.profileName && (
                        <span style={{ fontSize: '0.65rem', padding: '1px 5px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', color: 'rgba(255,255,255,0.5)' }}>
                          {inst.name}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {inst.phone ? `+${inst.phone}` : 'Não conectado'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: 4 }}>
                      <span style={{
                        width: 6,
                        height: 6,
                        background: isConnected ? '#10b981' : isInitializing ? '#f59e0b' : '#ef4444',
                        borderRadius: '50%',
                        animation: isInitializing ? 'pulse 1.2s infinite' : 'none',
                      }} />
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: isConnected ? '#10b981' : isInitializing ? '#f59e0b' : '#ef4444',
                      }}>
                        {isConnected ? 'ONLINE' : isInitializing ? 'GERANDO...' : 'DESCONECTADO'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Área Interna - Warmup ou QR Code */}
                <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '230px' }}>
                  {isConnected ? (
                    // Mostrar progresso do Aquecimento (%) se conectado
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Flame size={12} color="#f59e0b" /> Grau de Aquecimento
                          </span>
                          <strong style={{ color: '#f59e0b' }}>{inst.warmupProgress}%</strong>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                          <div style={{
                            height: '100%',
                            width: `${inst.warmupProgress}%`,
                            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                            borderRadius: 3,
                          }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Activity size={12} color="#10b981" /> Saúde do Chip
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: inst.heatScore >= 80 ? '#10b981' : inst.heatScore >= 50 ? '#f59e0b' : '#ef4444',
                        }}>
                          {inst.heatScore}% {inst.heatScore >= 80 ? '(Excelente)' : inst.heatScore >= 50 ? '(Médio)' : '(Risco de Ban)'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                        {inst.activeWarmupType === 'SINGLE' ? (
                          <span style={{ color: '#f59e0b' }}>🔥 Rodando em Aquecimento Individual</span>
                        ) : inst.activeWarmupType === 'POOL' ? (
                          <span style={{ color: '#3b82f6' }}>👥 Rodando em Grupo de Aquecimento Mútuo</span>
                        ) : (
                          <span>💤 Não está rodando nenhum ciclo ativo de aquecimento.</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Mostrar Conexão Alternativa (QR Code ou Código de Pareamento)
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      {/* Sub-abas de Conexão */}
                      {!pairingCode && (
                        <div style={{
                          display: 'flex',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          marginBottom: '0.75rem',
                          fontSize: '0.75rem',
                        }}>
                          <button
                            type="button"
                            onClick={() => setActiveConnectTab(prev => ({ ...prev, [inst.name]: 'qr' }))}
                            style={{
                              flex: 1,
                              background: 'none',
                              border: 'none',
                              borderBottom: currentTab === 'qr' ? '2px solid #10b981' : 'none',
                              color: currentTab === 'qr' ? '#10b981' : 'rgba(255,255,255,0.4)',
                              padding: '0.4rem',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            QR Code
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveConnectTab(prev => ({ ...prev, [inst.name]: 'code' }))}
                            style={{
                              flex: 1,
                              background: 'none',
                              border: 'none',
                              borderBottom: currentTab === 'code' ? '2px solid #10b981' : 'none',
                              color: currentTab === 'code' ? '#10b981' : 'rgba(255,255,255,0.4)',
                              padding: '0.4rem',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Código de Celular
                          </button>
                        </div>
                      )}

                      {/* Conteúdo da Aba QR Code */}
                      {currentTab === 'qr' && !pairingCode && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                          {inst.qrCode ? (
                            <div style={{ textAlign: 'center' }}>
                              <div style={{
                                backgroundColor: 'white',
                                padding: '0.5rem',
                                borderRadius: '8px',
                                display: 'inline-block',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                marginBottom: '0.4rem',
                              }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={inst.qrCode}
                                  alt="Scan me"
                                  style={{ width: '120px', height: '120px', display: 'block' }}
                                />
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                                QR Code Ativo! Escaneie no WhatsApp.
                              </div>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                              <div style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                                Clique em "Gerar QR Code" abaixo.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Conteúdo da Aba Código de Celular (Inclusão do Número) */}
                      {currentTab === 'code' && !pairingCode && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', justifyContent: 'center', flex: 1 }}>
                          <div>
                            <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>
                              Número do Celular (com DDI e DDD)
                            </label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Ex: 5516999999999"
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                              value={pairingPhones[inst.name] || ''}
                              onChange={e => setPairingPhones(prev => ({ ...prev, [inst.name]: e.target.value }))}
                            />
                          </div>

                          {pairError && (
                            <div style={{ color: '#ef4444', fontSize: '0.7rem', padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: '4px' }}>
                              {pairError}
                            </div>
                          )}

                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', justifyContent: 'center', width: '100%' }}
                            onClick={() => handleGeneratePairingCode(inst.name)}
                            disabled={isPairLoading}
                          >
                            {isPairLoading ? 'Obtendo Código...' : 'Gerar Código de Conexão'}
                          </button>
                        </div>
                      )}

                      {/* Exibição do Código de Pareamento Gerado */}
                      {pairingCode && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.5rem', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Key size={12} color="#10b981" /> Código de Pareamento WhatsApp
                          </div>
                          
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: 'rgba(16,185,129,0.08)',
                            border: '1px solid rgba(16,185,129,0.2)',
                            borderRadius: '10px',
                            cursor: 'pointer',
                          }}
                            onClick={() => copyToClipboard(pairingCode, inst.name)}
                            title="Clique para copiar"
                          >
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', letterSpacing: '2px', fontFamily: 'monospace' }}>
                              {pairingCode}
                            </span>
                            {copiedInstance === inst.name ? (
                              <Check size={16} color="#10b981" />
                            ) : (
                              <Copy size={16} color="rgba(255,255,255,0.4)" />
                            )}
                          </div>

                          <div style={{
                            fontSize: '0.65rem',
                            color: 'rgba(255,255,255,0.5)',
                            lineHeight: '1.3',
                            background: 'rgba(0,0,0,0.15)',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            textAlign: 'left'
                          }}>
                            <strong>Como conectar:</strong><br />
                            1. Abra o WhatsApp no celular.<br />
                            2. Vá em Aparelhos Conectados &gt; Conectar aparelho.<br />
                            3. Toque em <strong>"Conectar com número de telefone"</strong> e insira o código acima.
                          </div>

                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'rgba(255,255,255,0.4)',
                              fontSize: '0.7rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                              marginTop: 2
                            }}
                            onClick={() => {
                              setPairingCodes(prev => {
                                const copy = { ...prev };
                                delete copy[inst.name];
                                return copy;
                              });
                            }}
                          >
                            <ChevronLeft size={12} /> Voltar/Alterar número
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer / Ações */}
                <div style={{
                  padding: '0.6rem 1rem',
                  background: 'rgba(0,0,0,0.15)',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  gap: '0.5rem',
                }}>
                  {isConnected ? (
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                      onClick={() => handleLogout(inst.name)}
                      disabled={isActLoading}
                    >
                      <LogOut size={13} />
                      Desconectar
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}
                      onClick={() => currentTab === 'qr' ? handleRefresh(inst.name) : handleGeneratePairingCode(inst.name)}
                      disabled={isActLoading || isPairLoading}
                    >
                      <RefreshCw size={13} className={(isActLoading || isPairLoading) ? 'spin' : ''} />
                      {(isActLoading || isPairLoading) ? 'Gerando...' : (currentTab === 'qr' ? 'Gerar QR Code' : 'Gerar Código')}
                    </button>
                  )}

                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.5rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
                    onClick={() => handleDelete(inst.name)}
                    disabled={isActLoading}
                    title="Excluir Conexão"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal - Nova Conexão */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Smartphone size={18} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Cadastrar Nova Conexão</h3>
              </div>
              <button className="btn-close" onClick={() => { setIsModalOpen(false); setNewInstanceName(''); setModalError(''); }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateInstance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: 6, display: 'block' }}>
                  Nome Identificador da Instância (Apenas letras e números)
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Ex: vendas-1, suporte-sp"
                  value={newInstanceName}
                  onChange={e => setNewInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                />
              </div>

              {modalError && (
                <div style={{ color: '#ef4444', fontSize: '0.78rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>
                  ⚠️ {modalError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => { setIsModalOpen(false); setNewInstanceName(''); setModalError(''); }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  {submitting ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
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

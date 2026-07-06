'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Send, 
  CheckCircle, 
  AlertTriangle, 
  QrCode, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  TrendingUp 
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Stats {
  totalContacts: number;
  totalCampaigns: number;
  totalSent: number;
  successRate: number;
  sentToday: number;
  pendingMessages: number;
}

interface RecentCampaign {
  id: string;
  name: string;
  groupName: string;
  status: string;
  sentCount: number;
  totalCount: number;
  createdAt: string;
}

interface DashboardViewProps {
  initialStats: Stats;
  initialCampaigns: RecentCampaign[];
  initialWaStatus: {
    status: 'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED';
    qrCode: string | null;
  };
}

export default function DashboardView({ 
  initialStats, 
  initialCampaigns,
  initialWaStatus 
}: DashboardViewProps) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [campaigns, setCampaigns] = useState<RecentCampaign[]>(initialCampaigns);
  const [waStatus, setWaStatus] = useState(initialWaStatus);
  const [loadingQR, setLoadingQR] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Função para buscar status do WhatsApp
  const refreshWhatsApp = async () => {
    setLoadingQR(true);
    try {
      const response = await fetch('/api/whatsapp/connect', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        setWaStatus({
          status: data.status,
          qrCode: data.qrCode,
        });
      }
    } catch (err) {
      console.error('Erro ao conectar WhatsApp:', err);
    } finally {
      setLoadingQR(false);
    }
  };

  // Função para desconectar o WhatsApp
  const disconnectWhatsApp = async () => {
    if (!confirm('Deseja realmente desconectar este WhatsApp? Isso pausará todas as campanhas em andamento.')) {
      return;
    }
    setLoadingQR(true);
    try {
      const response = await fetch('/api/whatsapp/status', { method: 'DELETE' });
      if (response.ok) {
        const data = await response.json();
        setWaStatus({
          status: 'DISCONNECTED',
          qrCode: null,
        });
      }
    } catch (err) {
      console.error('Erro ao desconectar:', err);
    } finally {
      setLoadingQR(false);
    }
  };

  // Função para atualizar as estatísticas gerais do Dashboard
  const refreshStats = async () => {
    setRefreshing(true);
    try {
      // Faz fetch das estatísticas atualizadas
      const response = await fetch('/api/whatsapp/status'); // Podemos consultar status primeiro
      // E também recarregar a página para obter os dados atualizados do servidor
      window.location.reload();
    } catch (err) {
      console.error('Erro ao atualizar painel:', err);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Se o status inicial for desconectado e não tiver QR code, tenta buscar
    if (waStatus.status === 'DISCONNECTED' && !waStatus.qrCode) {
      refreshWhatsApp();
    }
  }, []);

  return (
    <AppLayout title="Dashboard">
      {/* Seção superior de Status da Conexão */}
      <div className="card-glass card-glow" style={{ marginBottom: '2rem', padding: '2rem' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1.5rem'
        }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {waStatus.status === 'CONNECTED' ? (
                <Wifi style={{ color: '#25d366' }} />
              ) : (
                <WifiOff style={{ color: '#ef4444' }} />
              )}
              Conexão WhatsApp
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', maxWidth: '500px' }}>
              {waStatus.status === 'CONNECTED' 
                ? 'Seu número de WhatsApp está conectado e pronto para enviar mensagens. Lembre-se de manter o celular com internet ativa.' 
                : 'Conecte seu WhatsApp lendo o QR Code abaixo com a câmera do celular (WhatsApp > Aparelhos conectados > Conectar aparelho).'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {waStatus.status === 'CONNECTED' ? (
              <button 
                onClick={disconnectWhatsApp} 
                className="btn btn-danger"
                disabled={loadingQR}
              >
                Desconectar WhatsApp
              </button>
            ) : (
              <button 
                onClick={refreshWhatsApp} 
                className="btn btn-primary"
                disabled={loadingQR}
              >
                <RefreshCw size={16} className={loadingQR ? 'spin' : ''} />
                {loadingQR ? 'Carregando QR...' : 'Gerar QR Code'}
              </button>
            )}
            <button 
              onClick={refreshStats} 
              className="btn btn-secondary"
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              Atualizar Dados
            </button>
          </div>
        </div>

        {/* QR Code Container */}
        {waStatus.status !== 'CONNECTED' && (
          <div style={{
            marginTop: '2rem',
            padding: '2rem',
            backgroundColor: '#0b141a',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '280px',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            {loadingQR ? (
              <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
                <span>Solicitando novo QR Code...</span>
              </div>
            ) : waStatus.qrCode ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  backgroundColor: 'white',
                  padding: '1rem',
                  borderRadius: '16px',
                  display: 'inline-block',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  marginBottom: '1rem'
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={waStatus.qrCode} 
                    alt="WhatsApp QR Code" 
                    style={{ width: '220px', height: '220px', display: 'block' }}
                  />
                </div>
                <p style={{ color: '#25d366', fontWeight: 600, fontSize: '0.875rem' }}>
                  QR Code gerado! Escaneie para iniciar.
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  O QR Code expira e atualiza automaticamente se não for lido.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#6b7280' }}>
                <QrCode size={48} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
                <p>Nenhum QR Code ativo no momento.</p>
                <button 
                  onClick={refreshWhatsApp} 
                  className="btn btn-primary" 
                  style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
                >
                  Gerar Conexão
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid de Estatísticas Gerais */}
      <div className="dashboard-grid">
        <div className="card-glass stats-card">
          <div className="stats-icon">
            <Users size={24} />
          </div>
          <div className="stats-info">
            <span className="stats-label">Contatos Cadastrados</span>
            <span className="stats-value">{stats.totalContacts.toLocaleString()}</span>
          </div>
        </div>

        <div className="card-glass stats-card">
          <div className="stats-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <Send size={24} />
          </div>
          <div className="stats-info">
            <span className="stats-label">Campanhas Criadas</span>
            <span className="stats-value">{stats.totalCampaigns}</span>
          </div>
        </div>

        <div className="card-glass stats-card">
          <div className="stats-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <CheckCircle size={24} />
          </div>
          <div className="stats-info">
            <span className="stats-label">Mensagens Enviadas</span>
            <span className="stats-value">{stats.totalSent.toLocaleString()}</span>
          </div>
        </div>

        <div className="card-glass stats-card">
          <div className="stats-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stats-info">
            <span className="stats-label">Taxa de Sucesso</span>
            <span className="stats-value">{stats.successRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Campanhas Recentes e Métricas Rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
        {/* Lista de Campanhas Recentes */}
        <div className="card-glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Campanhas Recentes</h3>
            <a href="/campaigns" style={{ fontSize: '0.875rem', color: '#25d366', fontWeight: 600 }}>Ver todas</a>
          </div>

          {campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
              <Send size={32} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
              <p>Nenhuma campanha criada ainda.</p>
              <a href="/campaigns" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
                Nova Campanha
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {campaigns.map((camp) => {
                const percent = camp.totalCount > 0 ? (camp.sentCount / camp.totalCount) * 100 : 0;
                
                const getStatusStyle = (status: string) => {
                  switch (status) {
                    case 'SENDING': return 'badge-success';
                    case 'QUEUED': return 'badge-info';
                    case 'PAUSED': return 'badge-warning';
                    case 'COMPLETED': return 'badge-success';
                    case 'CANCELLED': return 'badge-error';
                    default: return 'badge-info';
                  }
                };

                const getStatusText = (status: string) => {
                  switch (status) {
                    case 'SENDING': return 'Enviando';
                    case 'QUEUED': return 'Na Fila';
                    case 'PAUSED': return 'Pausada';
                    case 'COMPLETED': return 'Concluída';
                    case 'CANCELLED': return 'Cancelada';
                    default: return status;
                  }
                };

                return (
                  <div key={camp.id} style={{
                    padding: '1.25rem',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>{camp.name}</h4>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Grupo: {camp.groupName}</span>
                      </div>
                      <span className={`badge ${getStatusStyle(camp.status)}`}>
                        {getStatusText(camp.status)}
                      </span>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                        <span>Progresso de Envio</span>
                        <span>{camp.sentCount} / {camp.totalCount} ({percent.toFixed(0)}%)</span>
                      </div>
                      <div className="progress-container">
                        <div 
                          className={`progress-bar ${camp.status === 'SENDING' ? 'progress-bar-animated' : ''}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resumo Diário e Boas Práticas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Status do Dia */}
          <div className="card-glass" style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1.25rem' }}>Envios de Hoje</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', margin: '1rem 0' }}>
              <div>
                <span style={{ fontSize: '2rem', fontWeight: 700, color: '#25d366' }}>{stats.sentToday}</span>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>Enviadas Hoje</p>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>{stats.pendingMessages}</span>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>Mensagens Pendentes</p>
              </div>
            </div>

            <div style={{
              backgroundColor: 'rgba(37,211,102,0.04)',
              border: '1px solid rgba(37,211,102,0.1)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              fontSize: '0.75rem',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '1.5rem'
            }}>
              <CheckCircle size={14} style={{ color: '#25d366', flexShrink: 0 }} />
              <span>Dica: Para manter a saúde do seu chip, não envie mais que 200 mensagens por dia.</span>
            </div>
          </div>

          {/* Dicas Antiban */}
          <div className="card-glass" style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} />
              Recomendações Anti-Banimento
            </h3>
            <ul style={{
              fontSize: '0.8125rem',
              color: '#9ca3af',
              paddingLeft: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              lineHeight: '1.4'
            }}>
              <li>Use um chip **secundário** (nunca o seu principal ou corporativo).</li>
              <li>Aqueça o chip conversando com pessoas conhecidas por alguns dias antes de disparar.</li>
              <li>Configure o delay entre mensagens para no mínimo **20-40 segundos**.</li>
              <li>Evite mandar mensagens puras com links logo no primeiro contato.</li>
              <li>Use variáveis como {"{{nome}}"} para que cada mensagem seja ligeiramente única.</li>
            </ul>
          </div>
        </div>
      </div>

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

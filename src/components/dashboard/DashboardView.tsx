'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Send, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  TrendingUp,
  Smartphone,
  Flame,
  ArrowRight
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Link from 'next/link';

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
}

export default function DashboardView({ 
  initialStats, 
  initialCampaigns
}: DashboardViewProps) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [campaigns, setCampaigns] = useState<RecentCampaign[]>(initialCampaigns);
  const [refreshing, setRefreshing] = useState(false);
  const [instances, setInstances] = useState<{ name: string; status: string; phone: string | null; profileName: string | null }[]>([]);

  // Carrega resumo de conexões
  const fetchConnectionsSummary = async () => {
    try {
      const res = await fetch('/api/whatsapp/instances');
      if (res.ok) {
        setInstances(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConnectionsSummary();
  }, []);

  const refreshStats = async () => {
    setRefreshing(true);
    try {
      window.location.reload();
    } catch (err) {
      console.error('Erro ao atualizar painel:', err);
      setRefreshing(false);
    }
  };

  const totalConnected = instances.filter(i => i.status === 'CONNECTED').length;
  const totalDisconnected = instances.filter(i => i.status === 'DISCONNECTED').length;

  return (
    <AppLayout title="Dashboard">
      {/* Seção superior de Status da Conexão Multichips */}
      <div className="card-glass card-glow" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1.5rem'
        }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Smartphone style={{ color: '#10b981' }} size={20} />
              Status de Conexões WhatsApp
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', maxWidth: '550px', margin: 0 }}>
              {instances.length === 0 
                ? 'Nenhum chip de WhatsApp conectado ou cadastrado. Vá em Conexões para adicionar um chip.'
                : `Você tem ${instances.length} chip(s) cadastrado(s) (${totalConnected} Online e ${totalDisconnected} Offline).`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link href="/connections" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>Gerenciar Conexões</span>
              <ArrowRight size={16} />
            </Link>
            <button 
              onClick={refreshStats} 
              className="btn btn-secondary"
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              Atualizar Painel
            </button>
          </div>
        </div>

        {/* Resumo visual rápido dos chips ativos */}
        {instances.length > 0 && (
          <div style={{
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            {instances.slice(0, 6).map(inst => (
              <div 
                key={inst.name} 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.75rem',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  color: 'white'
                }}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: inst.status === 'CONNECTED' ? '#10b981' : '#ef4444'
                }} />
                <strong>{inst.profileName || inst.name}</strong>
                {inst.phone && <span style={{ color: 'rgba(255,255,255,0.4)' }}>({inst.phone})</span>}
              </div>
            ))}
            {instances.length > 6 && (
              <span style={{ fontSize: '0.78rem', color: '#9ca3af', paddingTop: '0.4rem' }}>
                e mais {instances.length - 6} chip(s)...
              </span>
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

      {/* Campanhas Recentes e Métricas Rápida */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
        {/* Lista de Campanhas Recentes */}
        <div className="card-glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Campanhas Recentes</h3>
            <Link href="/campaigns" style={{ fontSize: '0.875rem', color: '#25d366', fontWeight: 600 }}>Ver todas</Link>
          </div>

          {campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
              <Send size={32} style={{ marginBottom: '1rem', strokeWidth: 1.5 }} />
              <p>Nenhuma campanha criada ainda.</p>
              <Link href="/campaigns" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
                Nova Campanha
              </Link>
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

      <style>{`
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

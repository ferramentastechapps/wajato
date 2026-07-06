'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  StopCircle, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Eye,
  FileText,
  Clock
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface MessageLog {
  id: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  error: string | null;
  sentAt: string | null;
  updatedAt: string;
  contact: {
    name: string | null;
    phone: string;
  };
}

interface CampaignDetails {
  id: string;
  name: string;
  status: 'DRAFT' | 'QUEUED' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  delayMin: number;
  delayMax: number;
  group: { name: string; description: string | null };
  template: { name: string; body: string; imageUrl: string | null };
  logs: MessageLog[];
  createdAt: string;
}

export default function CampaignDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const fetchDetails = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${id}`);
      if (response.ok) {
        const data = await response.json();
        setCampaign(data.campaign);
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails(true);
  }, [id]);

  // Efeito para auto-atualizar a tela caso a campanha esteja enviando
  useEffect(() => {
    if (!campaign || campaign.status !== 'SENDING') return;

    // Atualiza a cada 5 segundos
    const interval = setInterval(() => {
      fetchDetails(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [campaign?.status]);

  const handleCampaignAction = async (action: 'START' | 'PAUSE' | 'CANCEL') => {
    setIsActionLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.message || 'Erro ao processar ação.');
      }
      
      await fetchDetails(false);
    } catch (err) {
      console.error(err);
      alert('Erro ao conectar com o servidor.');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Detalhes da Campanha">
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando detalhes da campanha...</span>
        </div>
      </AppLayout>
    );
  }

  if (!campaign) {
    return (
      <AppLayout title="Erro">
        <div className="card-glass" style={{ padding: '3rem', textAlign: 'center' }}>
          <AlertCircle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
          <h3>Campanha não encontrada!</h3>
          <Link href="/campaigns" className="btn btn-secondary" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
            <ArrowLeft size={16} /> Voltar para Campanhas
          </Link>
        </div>
      </AppLayout>
    );
  }

  // Estatísticas Rápidas
  const total = campaign.logs.length;
  const sent = campaign.logs.filter(l => ['SENT', 'DELIVERED', 'READ'].includes(l.status)).length;
  const delivered = campaign.logs.filter(l => ['DELIVERED', 'READ'].includes(l.status)).length;
  const read = campaign.logs.filter(l => l.status === 'READ').length;
  const failed = campaign.logs.filter(l => l.status === 'FAILED').length;
  const pending = campaign.logs.filter(l => l.status === 'PENDING').length;

  const percent = total > 0 ? (sent / total) * 100 : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT': return <span className="badge badge-info">Rascunho</span>;
      case 'QUEUED': return <span className="badge badge-warning">Na Fila</span>;
      case 'SENDING': return <span className="badge badge-success pulse-glow">Enviando</span>;
      case 'PAUSED': return <span className="badge badge-warning">Pausada</span>;
      case 'COMPLETED': return <span className="badge badge-success">Concluída</span>;
      case 'CANCELLED': return <span className="badge badge-error">Cancelada</span>;
      default: return <span className="badge badge-info">{status}</span>;
    }
  };

  const getLogStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Aguardando</span>;
      case 'SENT': return <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Enviado</span>;
      case 'DELIVERED': return <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Entregue</span>;
      case 'READ': return <span className="badge badge-success" style={{ fontSize: '0.7rem', backgroundColor: 'rgba(37,211,102,0.15)' }}>Lido</span>;
      case 'FAILED': return <span className="badge badge-error" style={{ fontSize: '0.7rem' }}>Falhou</span>;
      default: return <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{status}</span>;
    }
  };

  return (
    <AppLayout title={`Campanha: ${campaign.name}`}>
      {/* Botão de Retorno e Ações rápidas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/campaigns" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {campaign.status !== 'SENDING' && campaign.status !== 'COMPLETED' && (
            <button
              onClick={() => handleCampaignAction('START')}
              className="btn btn-primary"
              disabled={isActionLoading}
            >
              <Play size={16} />
              Iniciar / Retomar
            </button>
          )}
          {campaign.status === 'SENDING' && (
            <button
              onClick={() => handleCampaignAction('PAUSE')}
              className="btn btn-secondary"
              style={{ backgroundColor: '#d97706', color: '#fff', borderColor: '#d97706' }}
              disabled={isActionLoading}
            >
              <Pause size={16} />
              Pausar
            </button>
          )}
          {(campaign.status === 'SENDING' || campaign.status === 'PAUSED') && (
            <button
              onClick={() => handleCampaignAction('CANCEL')}
              className="btn btn-danger"
              disabled={isActionLoading}
            >
              <StopCircle size={16} />
              Cancelar
            </button>
          )}
          <button onClick={() => fetchDetails(false)} className="btn btn-secondary">
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Header Info */}
      <div className="card-glass" style={{ marginBottom: '2rem', padding: '2rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{campaign.name}</h2>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem', color: '#9ca3af' }}>
              <span>Grupo de Contatos: <strong>{campaign.group.name}</strong></span>
              <span>Template: <strong>{campaign.template.name}</strong></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={14} />
                Atraso por mensagem: {campaign.delayMin}s a {campaign.delayMax}s
              </span>
            </div>
          </div>
          <div>
            {getStatusBadge(campaign.status)}
          </div>
        </div>

        {/* Progresso de Envio */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
            <span>Status da Transmissão</span>
            <strong>{sent} / {total} Mensagens Processadas ({percent.toFixed(1)}%)</strong>
          </div>
          <div className="progress-container" style={{ height: '12px' }}>
            <div 
              className={`progress-bar ${campaign.status === 'SENDING' ? 'progress-bar-animated' : ''}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Grid de Estatísticas Detalhadas */}
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Alvo Total</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem' }}>{total}</p>
        </div>
        <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Aguardando</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#9ca3af' }}>{pending}</p>
        </div>
        <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#25d366' }}>Enviadas</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#25d366' }}>{sent}</p>
        </div>
        <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>Entregues</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#3b82f6' }}>{delivered}</p>
        </div>
        <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Lidas (WhatsApp Webhook)</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#10b981' }}>{read}</p>
        </div>
        <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Falhas</span>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: '#ef4444' }}>{failed}</p>
        </div>
      </div>

      {/* Grid: Preview Template e Destinatários */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Tabela de Destinatários */}
        <div className="card-glass" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Lista de Destinatários e Status</h3>
          </div>

          <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '500px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th style={{ width: '120px' }}>Status</th>
                  <th>Data Envio / Erro</th>
                </tr>
              </thead>
              <tbody>
                {campaign.logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 500 }}>{log.contact.name || <span style={{ color: '#6b7280', fontStyle: 'italic' }}>Sem nome</span>}</td>
                    <td style={{ fontFamily: 'monospace' }}>{log.contact.phone}</td>
                    <td>{getLogStatusBadge(log.status)}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {log.status === 'FAILED' ? (
                        <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <AlertCircle size={12} style={{ flexShrink: 0 }} />
                          {log.error || 'Erro no disparo'}
                        </span>
                      ) : log.sentAt ? (
                        <span style={{ color: '#9ca3af' }}>
                          {new Date(log.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visualização da Mensagem Enviada */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ fontSize: '1rem', color: '#9ca3af', fontWeight: 500 }}>Conteúdo da Mensagem Enviada</h4>
          
          <div className="card-glass" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
              <FileText size={16} />
              <span>Template original: <strong>{campaign.template.name}</strong></span>
            </div>

            <div className="wa-preview" style={{ width: '100%', minHeight: '280px', margin: '0 auto' }}>
              <div className="wa-message" style={{ width: '90%', maxWidth: '280px' }}>
                {campaign.template.imageUrl && (
                  <div className="wa-message-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={campaign.template.imageUrl} 
                      alt="Template Media" 
                      className="wa-message-image"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>
                  {/* Mostra com exemplo simulado */}
                  {campaign.template.body
                    .replace(/{{nome}}/g, 'João Silva')
                    .replace(/{{link}}/g, campaign.group.description || 'https://chat.whatsapp.com/...')}
                </div>
                
                <div className="wa-message-time">
                  12:00
                </div>
              </div>
            </div>
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

'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Download, 
  AlertOctagon, 
  TrendingUp, 
  MessageSquare, 
  CheckCircle2, 
  Eye, 
  Clock, 
  AlertTriangle 
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface FailedLog {
  id: string;
  status: string;
  error: string | null;
  updatedAt: string;
  contact: { name: string | null; phone: string };
  campaign: { name: string };
}

interface ExportLog {
  id: string;
  status: string;
  error: string | null;
  updatedAt: string;
  contact: { name: string | null; phone: string };
  campaign: { name: string };
}

interface MetricsData {
  statusCounts: {
    PENDING: number;
    SENT: number;
    DELIVERED: number;
    READ: number;
    FAILED: number;
  };
  campaignsCount: number;
  contactsCount: number;
  failedLogs: FailedLog[];
  exportLogs: ExportLog[];
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Erro ao carregar métricas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  // Exportar dados em CSV
  const handleExportCSV = () => {
    if (!metrics || metrics.exportLogs.length === 0) {
      alert('Nenhum dado disponível para exportação.');
      return;
    }

    const headers = ['ID Registro', 'Campanha', 'Nome Contato', 'Telefone', 'Status', 'Erro', 'Data Atualização'];
    const rows = metrics.exportLogs.map((log) => [
      log.id,
      log.campaign.name,
      log.contact.name || '',
      log.contact.phone,
      log.status,
      log.error || '',
      new Date(log.updatedAt).toLocaleString('pt-BR'),
    ]);

    const csvContent = 
      'data:text/csv;charset=utf-8,\uFEFF' + // UTF-8 BOM
      [headers.join(','), ...rows.map((r) => r.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_envios_wajato_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <AppLayout title="Métricas & Relatórios">
        <div className="card-glass" style={{ padding: '4rem', textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(37,211,102,0.1)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <span>Carregando métricas...</span>
        </div>
      </AppLayout>
    );
  }

  if (!metrics) {
    return (
      <AppLayout title="Métricas & Relatórios">
        <div className="card-glass" style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
          <span>Falha ao obter métricas. Verifique as tabelas do banco de dados.</span>
        </div>
      </AppLayout>
    );
  }

  const { PENDING, SENT, DELIVERED, READ, FAILED } = metrics.statusCounts;
  
  const processed = SENT + DELIVERED + READ + FAILED;
  const successful = SENT + DELIVERED + READ;

  // Cálculos de Taxas
  const deliveryRate = successful > 0 ? ((DELIVERED + READ) / successful) * 100 : 0;
  const readRate = (DELIVERED + READ) > 0 ? (READ / (DELIVERED + READ)) * 100 : 0;
  const failRate = processed > 0 ? (FAILED / processed) * 100 : 0;

  return (
    <AppLayout title="Métricas & Relatórios">
      {/* Botões de Ações de Relatório */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button onClick={handleExportCSV} className="btn btn-primary">
          <Download size={16} />
          Exportar Relatório (CSV)
        </button>
      </div>

      {/* Grid de Taxas e Conversões */}
      <div className="dashboard-grid" style={{ marginBottom: '2.5rem' }}>
        {/* Taxa de Entrega */}
        <div className="card-glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', textAlign: 'center' }}>
          <div style={{
            position: 'relative',
            width: '100px',
            height: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: 'conic-gradient(var(--primary) ' + deliveryRate + '%, rgba(255,255,255,0.05) 0)',
            marginBottom: '1rem'
          }}>
            <div style={{
              position: 'absolute',
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              backgroundColor: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.25rem'
            }}>
              {deliveryRate.toFixed(1)}%
            </div>
          </div>
          <h4 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Taxa de Entrega</h4>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Mensagens entregues com sucesso</span>
        </div>

        {/* Taxa de Abertura / Leitura */}
        <div className="card-glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', textAlign: 'center' }}>
          <div style={{
            position: 'relative',
            width: '100px',
            height: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: 'conic-gradient(#3b82f6 ' + readRate + '%, rgba(255,255,255,0.05) 0)',
            marginBottom: '1rem'
          }}>
            <div style={{
              position: 'absolute',
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              backgroundColor: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.25rem'
            }}>
              {readRate.toFixed(1)}%
            </div>
          </div>
          <h4 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Taxa de Abertura</h4>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Mensagens lidas pelo destinatário</span>
        </div>

        {/* Taxa de Falha */}
        <div className="card-glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', textAlign: 'center' }}>
          <div style={{
            position: 'relative',
            width: '100px',
            height: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: 'conic-gradient(var(--error) ' + failRate + '%, rgba(255,255,255,0.05) 0)',
            marginBottom: '1rem'
          }}>
            <div style={{
              position: 'absolute',
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              backgroundColor: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.25rem'
            }}>
              {failRate.toFixed(1)}%
            </div>
          </div>
          <h4 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Taxa de Falha</h4>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Erros de número inválido ou queda</span>
        </div>
      </div>

      {/* Grid: Resumo Numérico e Logs de Erro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* Resumo Numérico de Entregas */}
        <div className="card-glass">
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} style={{ color: '#25d366' }} />
            Distribuição de Envio
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#9ca3af' }}>Aguardando Fila</span>
              <strong>{PENDING}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#9ca3af' }}>Enviadas (Sem confirmação)</span>
              <strong>{SENT}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#3b82f6' }}>Entregues</span>
              <strong>{DELIVERED}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#10b981' }}>Lidas (Lido)</span>
              <strong>{READ}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#ef4444' }}>Falhadas</span>
              <strong>{FAILED}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, paddingTop: '0.5rem' }}>
              <span>Total Processado</span>
              <strong>{processed}</strong>
            </div>
          </div>
        </div>

        {/* Relatório de Falhas Recentes */}
        <div className="card-glass" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
            <AlertOctagon size={18} />
            Últimos Erros e Falhas (Máx. 50)
          </h3>

          {metrics.failedLogs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={32} style={{ color: '#10b981', marginBottom: '1rem' }} />
              <p>Nenhuma falha de envio registrada!</p>
            </div>
          ) : (
            <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
              {metrics.failedLogs.map((log) => (
                <div key={log.id} style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.03)',
                  border: '1px solid rgba(239, 68, 68, 0.1)',
                  borderRadius: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8125rem' }}>
                    <strong>{log.contact.name || 'Sem nome'} ({log.contact.phone})</strong>
                    <span style={{ color: '#9ca3af' }}>{new Date(log.updatedAt).toLocaleTimeString('pt-BR')}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Campanha: <strong>{log.campaign.name}</strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.5rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                    <span>Erro: {log.error || 'Erro interno no Evolution'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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

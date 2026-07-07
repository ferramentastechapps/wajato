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
  AlertTriangle,
  Smartphone,
  ShieldAlert,
  Heart
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

interface DailyMetric {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface ChipMetric {
  name: string;
  phone: string | null;
  status: string;
  dailyMsgCount: number;
  healthScore: number;
  profileName: string | null;
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
  dailyHistory: DailyMetric[];
  chipPerformance: ChipMetric[];
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

  // ── Lógica de renderização de gráfico customizado em SVG ──
  const dailyHistory = metrics.dailyHistory || [];
  const chartHeight = 150;
  const chartWidth = 500;
  const chartPadding = { top: 15, right: 15, bottom: 25, left: 35 };
  
  const maxMsgCount = Math.max(
    ...dailyHistory.map(d => d.sent + d.delivered + d.read + d.failed),
    10 // Evita divisão por zero
  );

  const getCoordinates = (index: number, count: number) => {
    const x = chartPadding.left + (index / (dailyHistory.length - 1 || 1)) * (chartWidth - chartPadding.left - chartPadding.right);
    const y = chartHeight - chartPadding.bottom - (count / maxMsgCount) * (chartHeight - chartPadding.top - chartPadding.bottom);
    return { x, y };
  };

  const points = dailyHistory.map((d, index) => {
    const total = d.sent + d.delivered + d.read;
    return getCoordinates(index, total);
  });

  const pathD = points.length > 0 
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') 
    : '';

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${chartHeight - chartPadding.bottom} L ${points[0].x} ${chartHeight - chartPadding.bottom} Z`
    : '';

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

      {/* Gráfico Histórico Semanal em SVG */}
      <div className="card-glass" style={{ marginBottom: '2.5rem', padding: '1.75rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart3 size={18} style={{ color: '#25d366' }} />
          Volume de Envios nos Últimos 7 Dias
        </h3>

        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#25d366" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#25d366" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Linhas de Grade de Y */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
              const y = chartPadding.top + p * (chartHeight - chartPadding.top - chartPadding.bottom);
              const val = Math.round(maxMsgCount * (1 - p));
              return (
                <g key={idx}>
                  <line 
                    x1={chartPadding.left} 
                    y1={y} 
                    x2={chartWidth - chartPadding.right} 
                    y2={y} 
                    stroke="rgba(255,255,255,0.05)" 
                    strokeDasharray="4 4" 
                  />
                  <text 
                    x={chartPadding.left - 8} 
                    y={y + 4} 
                    fill="#6b7280" 
                    fontSize="9" 
                    textAnchor="end"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Preenchimento de Área */}
            {areaD && <path d={areaD} fill="url(#chartGrad)" />}

            {/* Linha do Gráfico */}
            {pathD && (
              <path 
                d={pathD} 
                fill="none" 
                stroke="#25d366" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            )}

            {/* Pontos Interativos */}
            {points.map((p, idx) => (
              <g key={idx}>
                <circle 
                  cx={p.x} 
                  cy={p.y} 
                  r="4" 
                  fill="#121318" 
                  stroke="#25d366" 
                  strokeWidth="2" 
                />
                {/* Rótulo de Data e valor em X */}
                <text 
                  x={p.x} 
                  y={chartHeight - 6} 
                  fill="#6b7280" 
                  fontSize="8" 
                  textAnchor="middle"
                >
                  {new Date(dailyHistory[idx].date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Grid: Saúde dos Chips e Histórico de Falhas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2.5rem', marginBottom: '2.5rem' }}>
        
        {/* Performance e Saúde dos Chips */}
        <div className="card-glass" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Smartphone size={18} style={{ color: '#3b82f6' }} />
            Desempenho & Saúde dos Chips (Rotativos)
          </h3>

          {metrics.chipPerformance.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem 1rem' }}>
              <ShieldAlert size={32} style={{ color: '#ef4444', marginBottom: '1rem' }} />
              <p>Nenhum chip de WhatsApp conectado ou monitorado.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {metrics.chipPerformance.map((chip) => {
                const limitPercentage = Math.min((chip.dailyMsgCount / 200) * 100, 100);
                
                const getHealthColor = (score: number) => {
                  if (score > 80) return '#10b981'; // Verde
                  if (score > 40) return '#f59e0b'; // Amarelo
                  return '#ef4444'; // Vermelho
                };

                return (
                  <div key={chip.name} style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div>
                        <strong style={{ fontSize: '0.95rem' }}>{chip.profileName || chip.name}</strong>
                        {chip.phone && <span style={{ color: '#6b7280', fontSize: '0.8rem', marginLeft: '0.5rem' }}>({chip.phone})</span>}
                      </div>

                      <span style={{ 
                        fontSize: '0.75rem',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '20px',
                        background: chip.status === 'CONNECTED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: chip.status === 'CONNECTED' ? '#10b981' : '#ef4444',
                        fontWeight: 600
                      }}>
                        {chip.status === 'CONNECTED' ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    {/* Barra de progresso de cota diária */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                        <span>Cota diária (Máx 200 msgs)</span>
                        <span>{chip.dailyMsgCount} / 200 ({limitPercentage.toFixed(0)}%)</span>
                      </div>
                      <div className="progress-container" style={{ height: '6px' }}>
                        <div 
                          className="progress-bar" 
                          style={{ 
                            width: `${limitPercentage}%`,
                            backgroundColor: limitPercentage > 85 ? '#f59e0b' : '#3b82f6'
                          }} 
                        />
                      </div>
                    </div>

                    {/* Indicador de Saúde */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Heart size={12} style={{ color: getHealthColor(chip.healthScore) }} />
                        Pontuação de Saúde (Reputação Antiban)
                      </span>
                      <strong style={{ color: getHealthColor(chip.healthScore), fontSize: '0.85rem' }}>
                        {chip.healthScore}/100
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Relatório de Falhas Recentes */}
        <div className="card-glass" style={{ display: 'flex', flexDirection: 'column', padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
            <AlertOctagon size={18} />
            Últimos Erros e Falhas (Máx. 50)
          </h3>

          {metrics.failedLogs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '5rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={32} style={{ color: '#10b981', marginBottom: '1rem' }} />
              <p>Nenhuma falha de envio registrada!</p>
            </div>
          ) : (
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem' }}>
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

      {/* Tabela de Distribuição de Envio */}
      <div className="card-glass" style={{ padding: '1.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={18} style={{ color: 'var(--primary)' }} />
          Distribuição Detalhada de Status
        </h3>

        <div className="dashboard-grid">
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Aguardando Fila</span>
            <h4 style={{ fontSize: '1.5rem', margin: '0.25rem 0 0' }}>{PENDING.toLocaleString()}</h4>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Enviadas</span>
            <h4 style={{ fontSize: '1.5rem', margin: '0.25rem 0 0', color: '#9ca3af' }}>{SENT.toLocaleString()}</h4>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Entregues</span>
            <h4 style={{ fontSize: '1.5rem', margin: '0.25rem 0 0', color: '#3b82f6' }}>{DELIVERED.toLocaleString()}</h4>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Lidas (Lido)</span>
            <h4 style={{ fontSize: '1.5rem', margin: '0.25rem 0 0', color: '#10b981' }}>{READ.toLocaleString()}</h4>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Falhadas</span>
            <h4 style={{ fontSize: '1.5rem', margin: '0.25rem 0 0', color: '#ef4444' }}>{FAILED.toLocaleString()}</h4>
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

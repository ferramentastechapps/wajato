'use client';

import React, { useEffect, useState } from 'react';

interface DailyData {
  date: string;
  sent: number;
  failed: number;
  total: number;
}

interface Props {
  campaignId: string;
}

/**
 * Gráfico de barras simples mostrando mensagens enviadas/falhas por dia.
 * Implementado com CSS puro — sem dependências externas.
 */
export default function WarmupDayChart({ campaignId }: Props) {
  const [data, setData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/warmup/${campaignId}/stats`);
        if (res.ok) {
          const json = await res.json();
          setData(json.dailyStats?.slice(-14) || []); // Últimos 14 dias
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [campaignId]);

  if (loading) {
    return (
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
        Carregando dados...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
        Sem dados ainda
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.total), 1);

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '3px',
        height: 60,
        padding: '0 4px',
      }}>
        {data.map((day, i) => {
          const sentHeight = (day.sent / maxVal) * 100;
          const failedHeight = (day.failed / maxVal) * 100;
          const dayLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

          return (
            <div
              key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', cursor: 'pointer' }}
              title={`${dayLabel}: ${day.sent} enviadas, ${day.failed} falhas`}
            >
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: 52, justifyContent: 'flex-end' }}>
                {day.failed > 0 && (
                  <div style={{
                    width: '70%',
                    height: `${failedHeight}%`,
                    background: 'rgba(239, 68, 68, 0.7)',
                    borderRadius: '2px 2px 0 0',
                    minHeight: 3,
                  }} />
                )}
                <div style={{
                  width: '70%',
                  height: `${sentHeight}%`,
                  background: 'linear-gradient(180deg, #10b981, #059669)',
                  borderRadius: day.failed > 0 ? 0 : '2px 2px 0 0',
                  minHeight: day.sent > 0 ? 3 : 0,
                  boxShadow: '0 0 4px rgba(16,185,129,0.4)',
                }} />
              </div>
              <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                {dayLabel.split('/')[0]}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '4px', justifyContent: 'flex-end' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>
          <span style={{ width: 8, height: 8, background: '#10b981', borderRadius: 2, display: 'inline-block' }} />
          Enviadas
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>
          <span style={{ width: 8, height: 8, background: '#ef4444', borderRadius: 2, display: 'inline-block' }} />
          Falhas
        </span>
      </div>
    </div>
  );
}

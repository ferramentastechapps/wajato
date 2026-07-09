'use client';

/**
 * ChipHealthDashboard.tsx
 * Painel de saúde de todos os chips WhatsApp em tempo real.
 * Mostra: status de conexão, health score, msgs nas últimas 1h e total diário.
 */
import React, { useEffect, useState } from 'react';
import { Activity, Wifi, WifiOff, AlertTriangle, TrendingUp, Clock, Zap } from 'lucide-react';

interface ChipHealth {
  id: string;
  name: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'INITIALIZING';
  phone: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  healthScore: number;
  dailyMsgCount: number;
  hourlyMsgCount: number;
  proxy: string | null;
  updatedAt: string;
}

const MAX_DAILY = 200;
const MAX_HOURLY = 60;

function HealthBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const isWarning = pct > 75;
  const isDanger = pct >= 95;
  const barColor = isDanger ? '#ef4444' : isWarning ? '#f59e0b' : color;
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: barColor,
        borderRadius: 2,
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const size = 48;
  const stroke = 4;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="11" fontWeight="700"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        {score}
      </text>
    </svg>
  );
}

export default function ChipHealthDashboard() {
  const [chips, setChips] = useState<ChipHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/warmup/chip-health');
      if (res.ok) {
        setChips(await res.json());
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('[ChipHealthDashboard] Erro ao buscar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000); // atualiza a cada 15s
    return () => clearInterval(interval);
  }, []);

  const connected = chips.filter(c => c.status === 'CONNECTED').length;
  const disconnected = chips.filter(c => c.status === 'DISCONNECTED').length;
  const avgHealth = chips.length > 0
    ? Math.round(chips.reduce((a, c) => a + c.healthScore, 0) / chips.length)
    : 0;
  const totalHourly = chips.reduce((a, c) => a + c.hourlyMsgCount, 0);

  const statusConfig = {
    CONNECTED:    { label: 'Conectado', color: '#10b981', icon: <Wifi size={12} /> },
    DISCONNECTED: { label: 'Desconectado', color: '#ef4444', icon: <WifiOff size={12} /> },
    INITIALIZING: { label: 'Conectando', color: '#f59e0b', icon: <Activity size={12} /> },
  };

  return (
    <div>
      {/* Resumo global */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.75rem',
        marginBottom: '1.25rem',
      }}>
        {[
          { label: 'Chips Conectados', value: connected, color: '#10b981', icon: <Wifi size={16} /> },
          { label: 'Desconectados', value: disconnected, color: '#ef4444', icon: <WifiOff size={16} /> },
          { label: 'Saúde Média', value: `${avgHealth}%`, color: avgHealth >= 70 ? '#10b981' : '#f59e0b', icon: <Activity size={16} /> },
          { label: 'Msgs/h (todos)', value: totalHourly, color: '#3b82f6', icon: <Zap size={16} /> },
        ].map((stat) => (
          <div key={stat.label} className="card" style={{ padding: '0.85rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem', color: stat.color }}>
              {stat.icon}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Atualização */}
      {lastUpdate && (
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Clock size={11} />
          Atualizado em {lastUpdate.toLocaleTimeString('pt-BR')} · auto-refresh 15s
        </div>
      )}

      {/* Lista de chips */}
      {loading ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
          Carregando status dos chips...
        </div>
      ) : chips.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <AlertTriangle size={28} style={{ color: '#f59e0b', margin: '0 auto 0.75rem' }} />
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
            Nenhum chip cadastrado. Adicione instâncias WhatsApp em{' '}
            <a href="/connections" style={{ color: '#3b82f6' }}>Conexões</a>.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
          {chips.map((chip) => {
            const sc = statusConfig[chip.status] || statusConfig.DISCONNECTED;
            const isHealthy = chip.healthScore >= 70;
            const isDegraded = chip.healthScore < 40;

            return (
              <div
                key={chip.id}
                className="card"
                style={{
                  padding: '1rem',
                  border: chip.status === 'CONNECTED'
                    ? `1px solid ${isDegraded ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.15)'}`
                    : '1px solid rgba(255,255,255,0.06)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  {/* Avatar / Foto de perfil */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: chip.profilePicUrl
                      ? `url(${chip.profilePicUrl}) center/cover`
                      : 'linear-gradient(135deg, #1e293b, #334155)',
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem',
                    border: `2px solid ${sc.color}44`,
                  }}>
                    {!chip.profilePicUrl && '📱'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: '0.9rem',
                      color: 'white',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {chip.profileName || chip.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                      {chip.phone || chip.name}
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      marginTop: '0.25rem',
                      padding: '1px 6px', borderRadius: 999,
                      background: `${sc.color}22`,
                      color: sc.color,
                      fontSize: '0.65rem', fontWeight: 700,
                    }}>
                      {sc.icon}
                      {sc.label}
                    </div>
                  </div>

                  {/* Score ring */}
                  <ScoreRing score={chip.healthScore} />
                </div>

                {/* Métricas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {/* Msgs hoje */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>Msgs hoje</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: chip.dailyMsgCount >= MAX_DAILY * 0.9 ? '#ef4444' : 'rgba(255,255,255,0.7)' }}>
                        {chip.dailyMsgCount} / {MAX_DAILY}
                      </span>
                    </div>
                    <HealthBar value={chip.dailyMsgCount} max={MAX_DAILY} color="#3b82f6" />
                  </div>

                  {/* Msgs última hora */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>Última hora (sliding)</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: chip.hourlyMsgCount >= MAX_HOURLY * 0.9 ? '#ef4444' : 'rgba(255,255,255,0.7)' }}>
                        {chip.hourlyMsgCount} / {MAX_HOURLY}
                      </span>
                    </div>
                    <HealthBar value={chip.hourlyMsgCount} max={MAX_HOURLY} color="#10b981" />
                  </div>
                </div>

                {/* Proxy info (se tiver) */}
                {chip.proxy && (
                  <div style={{
                    marginTop: '0.65rem',
                    padding: '0.3rem 0.5rem',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 6,
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.35)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    🌐 {chip.proxy}
                  </div>
                )}

                {/* Degraded warning */}
                {isDegraded && chip.status === 'CONNECTED' && (
                  <div style={{
                    marginTop: '0.6rem',
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.35rem 0.6rem',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 6,
                    color: '#ef4444',
                    fontSize: '0.68rem',
                  }}>
                    <AlertTriangle size={11} />
                    Saúde crítica — risco de ban
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Flame, Plus, Activity, StopCircle } from 'lucide-react';
import CreateWarmupModal from '@/components/warmup/CreateWarmupModal';
import WarmupChatViewer from '@/components/warmup/WarmupChatViewer';

export default function WarmupPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/warmup');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, 10000); // refresh 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Flame style={{ marginRight: '0.5rem', color: '#f59e0b' }} />
            Aquecimento de Números (IA)
          </h1>
          <p className="page-description">
            Aqueça seus chips simulando conversas humanas contextuais usando Inteligência Artificial.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} />
          <span>Novo Ciclo de Aquecimento</span>
        </button>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Instância Origem</th>
              <th>Destino (Telefone)</th>
              <th>Progresso</th>
              <th>Mensagens Hoje</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                  Nenhum ciclo de aquecimento ativo.
                </td>
              </tr>
            ) : (
              campaigns.map((camp) => (
                <tr key={camp.id}>
                  <td>
                    <span className={`badge badge-${camp.status === 'RUNNING' ? 'success' : camp.status === 'COMPLETED' ? 'primary' : 'warning'}`}>
                      {camp.status}
                    </span>
                  </td>
                  <td>{camp.sourceInstance}</td>
                  <td>{camp.targetPhone}</td>
                  <td>Dia {camp.currentDay} de {camp.totalDays}</td>
                  <td>
                    {camp.msgsSentToday} / {camp.targetMsgsToday}
                    <div style={{ width: '100%', background: '#eee', height: '6px', borderRadius: '3px', marginTop: '4px' }}>
                       <div style={{ 
                         width: `${Math.min(100, (camp.msgsSentToday / camp.targetMsgsToday) * 100)}%`, 
                         background: '#10b981', 
                         height: '100%', 
                         borderRadius: '3px' 
                       }}></div>
                    </div>
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem' }}
                      onClick={() => setSelectedCampaign(camp.id)}
                      title="Ver Logs e Conversa"
                    >
                      <Activity size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <CreateWarmupModal 
          onClose={() => setIsModalOpen(false)} 
          onCreated={() => {
            setIsModalOpen(false);
            fetchCampaigns();
          }} 
        />
      )}

      {selectedCampaign && (
        <WarmupChatViewer 
          campaignId={selectedCampaign} 
          onClose={() => setSelectedCampaign(null)} 
        />
      )}
    </AppLayout>
  );
}

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface Props {
  campaignId: string;
  onClose: () => void;
}

export default function WarmupChatViewer({ campaignId, onClose }: Props) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/warmup/${campaignId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [campaignId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2>Logs e Conversa (IA)</h2>
            {loading && <RefreshCw size={16} className="spin" />}
          </div>
          <button className="btn-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          background: '#e5ddd5', 
          padding: '1rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem',
          marginTop: '1rem',
          borderRadius: '8px'
        }}>
          {logs.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#667781' }}>
              Nenhuma mensagem gerada ainda. O Worker iniciará em breve.
            </div>
          ) : (
            logs.map(log => {
              // Simples heurística pra alinhar os balões (impar/par ou baseado na source)
              const isSource = log.fromInstance;
              return (
                <div key={log.id} style={{ 
                  alignSelf: log.fromInstance === logs[0]?.fromInstance ? 'flex-end' : 'flex-start',
                  background: log.fromInstance === logs[0]?.fromInstance ? '#dcf8c6' : '#ffffff',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  maxWidth: '75%',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#075e54', marginBottom: '4px' }}>
                    {log.fromInstance}
                  </div>
                  <div style={{ fontSize: '0.95rem', color: '#303030' }}>
                    {log.message}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#999', textAlign: 'right', marginTop: '4px' }}>
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

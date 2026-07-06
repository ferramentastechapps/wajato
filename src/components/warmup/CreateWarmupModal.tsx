'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateWarmupModal({ onClose, onCreated }: Props) {
  const [sourceInstance, setSourceInstance] = useState('');
  const [targetInstance, setTargetInstance] = useState('');
  const [targetPhone, setTargetPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('/api/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceInstance,
          targetInstance: targetInstance || null,
          targetPhone,
          totalDays: 7
        })
      });

      if (res.ok) {
        onCreated();
      } else {
        alert('Erro ao criar campanha de aquecimento.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Novo Ciclo de Aquecimento</h2>
          <button className="btn-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label>Instância de Origem (A que inicia a conversa)</label>
            <input 
              type="text" 
              className="form-input" 
              required 
              value={sourceInstance}
              onChange={e => setSourceInstance(e.target.value)}
              placeholder="Ex: wajato-session-1"
            />
          </div>
          
          <div>
            <label>Telefone de Destino (Ex: 5511999999999)</label>
            <input 
              type="text" 
              className="form-input" 
              required 
              value={targetPhone}
              onChange={e => setTargetPhone(e.target.value)}
              placeholder="55119..."
            />
            <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
              O telefone para qual as mensagens serão enviadas.
            </small>
          </div>

          <div>
            <label>Instância de Destino (Opcional - Para diálogo duplo)</label>
            <input 
              type="text" 
              className="form-input" 
              value={targetInstance}
              onChange={e => setTargetInstance(e.target.value)}
              placeholder="Ex: wajato-session-2"
            />
            <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
              Se preenchido, o sistema fará essa instância responder de volta automaticamente.
            </small>
          </div>

          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Como funciona o Ramp-up?</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
              O sistema agendará envios progressivos durante 7 dias. No dia 1, serão 15 mensagens. 
              No dia 2, 22 mensagens, subindo gradativamente até atingir o limite estipulado no dia 7.
              Tudo simulando tempo de digitação real via Inteligência Artificial.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Iniciando...' : 'Iniciar Aquecimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

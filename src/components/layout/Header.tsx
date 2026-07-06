'use client';

import React from 'react';
import { Calendar, Bell } from 'lucide-react';

interface HeaderProps {
  title: string;
  waStatus?: 'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED';
}

export default function Header({ title, waStatus = 'DISCONNECTED' }: HeaderProps) {
  const getStatusBadge = () => {
    switch (waStatus) {
      case 'CONNECTED':
        return <span className="badge badge-success">WhatsApp Conectado</span>;
      case 'INITIALIZING':
        return <span className="badge badge-warning">Inicializando</span>;
      case 'DISCONNECTED':
      default:
        return <span className="badge badge-error">WhatsApp Desconectado</span>;
    }
  };

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="header">
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{title}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {/* WhatsApp Connection status indicator */}
        <div>
          {getStatusBadge()}
        </div>

        {/* Date Display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#9ca3af',
          fontSize: '0.875rem',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          paddingLeft: '1.5rem'
        }}>
          <Calendar size={16} />
          <span>{today}</span>
        </div>
      </div>
    </header>
  );
}

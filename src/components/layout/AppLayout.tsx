'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const [waStatus, setWaStatus] = useState<'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED'>('DISCONNECTED');
  const [username, setUsername] = useState('Admin');

  // Função para buscar status do WhatsApp
  const checkStatus = async () => {
    try {
      const response = await fetch('/api/whatsapp/status');
      if (response.ok) {
        const data = await response.json();
        setWaStatus(data.status);
      }
    } catch (err) {
      console.error('Erro ao buscar status do WhatsApp:', err);
    }
  };

  useEffect(() => {
    // Busca informações de sessão do usuário logado
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/contacts'); // qualquer API autenticada serve
        if (response.status === 401) {
          // Se não autenticado, redireciona
          window.location.href = '/login';
        }
      } catch (err) {
        console.error('Erro ao validar sessão:', err);
      }
    };

    fetchUser();
    checkStatus();

    // Pool de status a cada 20 segundos
    const interval = setInterval(checkStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      {/* Sidebar de navegação */}
      <Sidebar username={username} />

      {/* Área de conteúdo principal */}
      <div className="main-content">
        <Header title={title} waStatus={waStatus} />
        <main className="page-container">
          {children}
        </main>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { X } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  description: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  createdAt: string;
}

interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
}

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const [waStatus, setWaStatus] = useState<'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED'>('DISCONNECTED');
  const [username, setUsername] = useState('Admin');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const knownNotificationIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // Função para buscar status do WhatsApp e de notificações
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

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        const newNotifications: Notification[] = data.notifications || [];
        setNotifications(newNotifications);

        // Detectar novas notificações para exibir Toasts (excluindo a carga inicial)
        if (!isFirstLoad.current) {
          newNotifications.forEach(n => {
            if (!knownNotificationIds.current.has(n.id)) {
              addToast(n.title, n.description, n.type);
              knownNotificationIds.current.add(n.id);
            }
          });
        } else {
          // Preencher IDs conhecidos na carga inicial
          newNotifications.forEach(n => knownNotificationIds.current.add(n.id));
          isFirstLoad.current = false;
        }
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
    }
  };

  const handleClearNotifications = async () => {
    try {
      const response = await fetch('/api/notifications', { method: 'DELETE' });
      if (response.ok) {
        setNotifications([]);
        // Mantém IDs limpos na memória para não rearquivar toasts
        notifications.forEach(n => knownNotificationIds.current.add(n.id));
      }
    } catch (err) {
      console.error('Erro ao limpar notificações:', err);
    }
  };

  const addToast = (toastTitle: string, message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title: toastTitle, message, type }]);

    // Auto-remove após 4 segundos
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Alternador de tema
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  useEffect(() => {
    // Busca informações de sessão do usuário logado
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/contacts'); // qualquer API autenticada serve
        if (response.status === 401) {
          window.location.href = '/login';
        }
      } catch (err) {
        console.error('Erro ao validar sessão:', err);
      }
    };

    // Carregar tema persistido
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    fetchUser();
    checkStatus();
    fetchNotifications();

    // Pool de status a cada 20 segundos
    const intervalStatus = setInterval(checkStatus, 20000);
    // Pool de notificações a cada 10 segundos
    const intervalNotifications = setInterval(fetchNotifications, 10000);

    return () => {
      clearInterval(intervalStatus);
      clearInterval(intervalNotifications);
    };
  }, []);

  return (
    <div className="app-container">
      {/* Sidebar de navegação */}
      <Sidebar 
        username={username} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      {/* Overlay para fechar a sidebar no mobile */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => setIsSidebarOpen(false)} 
      />

      {/* Área de conteúdo principal */}
      <div className="main-content">
        <Header 
          title={title} 
          waStatus={waStatus} 
          onMenuToggle={() => setIsSidebarOpen(true)}
          theme={theme}
          onThemeToggle={toggleTheme}
          notifications={notifications}
          onClearNotifications={handleClearNotifications}
        />
        <main className="page-container">
          {children}
        </main>
      </div>

      {/* Toasts flutuantes no canto inferior direito */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item toast-${t.type.toLowerCase()}`}>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              <div className="toast-message">{t.message}</div>
            </div>
            <button 
              onClick={() => removeToast(t.id)} 
              className="toast-close"
              aria-label="Fechar alerta"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

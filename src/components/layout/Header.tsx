import React, { useState } from 'react';
import { Calendar, Bell, Menu, Sun, Moon, AlertCircle, Info, CheckCircle2, ShieldAlert } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  description: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  createdAt: string;
}

interface HeaderProps {
  title: string;
  waStatus?: 'CONNECTED' | 'INITIALIZING' | 'DISCONNECTED';
  onMenuToggle?: () => void;
  theme?: 'dark' | 'light';
  onThemeToggle?: () => void;
  notifications?: Notification[];
  onClearNotifications?: () => void;
}

export default function Header({ 
  title, 
  waStatus = 'DISCONNECTED',
  onMenuToggle,
  theme = 'dark',
  onThemeToggle,
  notifications = [],
  onClearNotifications
}: HeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false);

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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />;
      case 'WARNING':
        return <AlertCircle size={14} style={{ color: 'var(--warning)' }} />;
      case 'ERROR':
        return <ShieldAlert size={14} style={{ color: 'var(--error)' }} />;
      case 'INFO':
      default:
        return <Info size={14} style={{ color: 'var(--info)' }} />;
    }
  };

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Menu hambúrguer para mobile */}
        {onMenuToggle && (
          <button onClick={onMenuToggle} className="menu-toggle" aria-label="Abrir menu">
            <Menu size={20} />
          </button>
        )}
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{title}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* WhatsApp Connection status indicator */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {getStatusBadge()}
        </div>

        {/* Theme Toggle Button */}
        {onThemeToggle && (
          <button 
            onClick={onThemeToggle} 
            className="theme-toggle" 
            title={theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}

        {/* Notifications Icon and Dropdown */}
        <div className="notifications-container">
          <button 
            onClick={() => setShowDropdown(!showDropdown)} 
            className="notifications-bell"
            title="Notificações"
            aria-label="Visualizar notificações"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="notifications-badge">
                {notifications.length}
              </span>
            )}
          </button>

          {showDropdown && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <span>Alertas do Sistema</span>
                {notifications.length > 0 && onClearNotifications && (
                  <span 
                    className="notifications-clear" 
                    onClick={() => {
                      onClearNotifications();
                      setShowDropdown(false);
                    }}
                  >
                    Limpar
                  </span>
                )}
              </div>
              <div className="notifications-list">
                {notifications.length === 0 ? (
                  <div className="notification-empty">
                    Sem novas notificações.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div key={item.id} className="notification-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {getNotificationIcon(item.type)}
                        <span className="notification-title">{item.title}</span>
                      </div>
                      <span className="notification-desc">{item.description}</span>
                      <span className="notification-time">
                        {new Date(item.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Date Display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#9ca3af',
          fontSize: '0.875rem',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          paddingLeft: '1rem',
          height: '24px'
        }}>
          <Calendar size={16} />
          <span style={{ whiteSpace: 'nowrap' }}>{today}</span>
        </div>
      </div>
    </header>
  );
}

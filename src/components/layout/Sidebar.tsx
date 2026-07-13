'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Send, 
  BarChart3, 
  LogOut, 
  MessageSquare,
  Flame,
  Smartphone,
  Bot,
  ListFilter,
  Columns,
  X
} from 'lucide-react';

interface SidebarProps {
  username?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ username = 'Admin', isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  };

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Conexões', href: '/connections', icon: Smartphone },
    { label: 'Conversas', href: '/chat', icon: MessageSquare },
    { label: 'Contatos', href: '/contacts', icon: Users },
    { label: 'Segmentações', href: '/contacts/segments', icon: ListFilter },
    { label: 'CRM Kanban', href: '/crm', icon: Columns },
    { label: 'Templates', href: '/templates', icon: FileText },
    { label: 'Campanhas', href: '/campaigns', icon: Send },
    { label: 'Auto-Responder', href: '/chatbot', icon: Bot },
    { label: 'Aquecimento', href: '/warmup', icon: Flame },
    { label: 'Métricas', href: '/metrics', icon: BarChart3 },
  ];

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div className="brand-logo">
          <MessageSquare size={24} style={{ fill: 'currentColor' }} />
          <span>WaJato</span>
        </div>
        {onClose && (
          <button 
            onClick={onClose} 
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.25rem'
            }}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href} 
              className={`nav-link ${isActive ? 'active' : ''}`}
              onClick={() => onClose && onClose()}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          padding: '0.25rem'
        }}>
          <div className="user-profile">
            <div className="user-avatar">
              {username[0]?.toUpperCase() || 'A'}
            </div>
            <div className="user-info">
              <span className="user-name">{username}</span>
              <span className="user-role">Administrador</span>
            </div>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="btn btn-secondary" 
          style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem' }}
        >
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}

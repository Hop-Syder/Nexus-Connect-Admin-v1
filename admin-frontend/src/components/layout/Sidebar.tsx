'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CheckSquare,
  MessageSquare,
  Mail,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useUIStore } from '@/store/ui-store';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Utilisateurs', href: '/users', icon: Users },
  { name: 'Abonnements', href: '/subscriptions', icon: CreditCard },
  { name: 'Modération', href: '/moderation', icon: CheckSquare },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Campagnes', href: '/campaigns', icon: Mail },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Audit', href: '/audit', icon: FileText },
  { name: 'Paramètres', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <div
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
              NC
            </div>
            <span className="font-semibold text-lg">Nexus Admin</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-2 hover:bg-accent transition-colors"
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              title={!sidebarOpen ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground">
          {sidebarOpen && (
            <div>
              <p className="font-semibold">Nexus Connect Admin</p>
              <p>Version 2.1.0</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

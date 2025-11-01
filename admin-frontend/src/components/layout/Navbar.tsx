'use client';

import React from 'react';
import { Bell, Moon, Sun, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useUIStore } from '@/store/ui-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { user, clearAuth } = useAuthStore();
  const { darkMode, toggleDarkMode, sidebarOpen } = useUIStore();
  const router = useRouter();

  const displayEmail = user?.email ?? '—';
  const roleLabel = user?.role ?? '—';
  const initial = displayEmail?.charAt(0)?.toUpperCase() || 'N';

  const handleLogout = async () => {
    try {
      await apiClient.logoutUser();
      clearAuth();
      router.replace('/login');
      toast.success('Déconnexion réussie');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-40 h-16 bg-background border-b transition-all duration-300 flex items-center justify-between px-6',
        sidebarOpen ? 'left-64' : 'left-16'
      )}
    >
      <div className="flex-1">
        <h1 className="text-xl font-semibold">Tableau de Bord</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Dark mode toggle */}
        <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
        </Button>

        {/* User menu */}
        <div className="flex items-center gap-3 border-l pl-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
            {initial}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium truncate max-w-[160px]" title={displayEmail}>
              {displayEmail}
            </p>
            <Badge variant="secondary" className="text-xs">
              {roleLabel}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

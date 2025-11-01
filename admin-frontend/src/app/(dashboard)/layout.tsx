'use client';

import { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { AuthGuard } from '@/components/auth/auth-guard';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui-store';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Navbar />
        <main
          className={cn(
            'transition-all duration-300 pt-16',
            sidebarOpen ? 'ml-64' : 'ml-16',
          )}
        >
          <div className="p-6">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}

'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { FullScreenLoader } from '@/components/ui/full-screen-loader';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, initialized, loading, requires2FA } = useAuthStore();

  useEffect(() => {
    if (!initialized || loading) {
      return;
    }

    if (!isAuthenticated && pathname !== '/login') {
      router.replace('/login');
      return;
    }

    if (requires2FA && pathname !== '/login') {
      router.replace('/login');
    }
  }, [initialized, loading, isAuthenticated, requires2FA, router, pathname]);

  if (!initialized || loading) {
    return (
      <FullScreenLoader
        message={
          initialized
            ? 'Chargement de vos données...'
            : 'Initialisation de la session...'
        }
      />
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

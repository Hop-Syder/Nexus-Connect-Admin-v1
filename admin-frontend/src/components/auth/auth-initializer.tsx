'use client';

import { ReactNode, useEffect } from 'react';
import apiClient from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';

interface AuthInitializerProps {
  children: ReactNode;
}

export function AuthInitializer({ children }: AuthInitializerProps) {
  const {
    initialized,
    setInitialized,
    setLoading,
    updateUser,
    clearAuth,
  } = useAuthStore();

  useEffect(() => {
    const initialize = async () => {
      const token =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('admin_access_token')
          : null;

      if (!token) {
        setInitialized(true);
        return;
      }

      setLoading(true);
      try {
        const profile = await apiClient.getMe();
        if (profile) {
          const userId = profile.user_id || profile.id;
          if (!userId) {
            clearAuth();
            return;
          }
          updateUser({
            id: userId,
            email: profile.email || '',
            role: profile.role || 'admin',
            mfa_verified: Boolean(profile.mfa_verified),
          });
        } else {
          clearAuth();
        }
      } catch (error) {
        clearAuth();
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    if (!initialized) {
      void initialize();
    }
  }, [initialized, setInitialized, setLoading, updateUser, clearAuth]);

  return <>{children}</>;
}

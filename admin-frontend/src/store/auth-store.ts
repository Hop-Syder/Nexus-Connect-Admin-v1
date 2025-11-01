'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  mfa_verified: boolean;
}

interface AuthState {
  user: AdminUser | null;
  isAuthenticated: boolean;
  requires2FA: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  initialized: boolean;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setAuth: (data: {
    user: AdminUser;
    access_token: string;
    refresh_token: string;
    requires_2fa?: boolean;
  }) => void;
  clearAuth: () => void;
  set2FAVerified: () => void;
  updateUser: (user: AdminUser | null) => void;
}

export const useAuthStore = create<AuthState>()((
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      requires2FA: false,
      accessToken: null,
      refreshToken: null,
      loading: false,
      initialized: false,
      
      setLoading: (loading) => set({ loading }),
      
      setInitialized: (initialized) => set({ initialized }),
      
      setAuth: (data) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('admin_access_token', data.access_token);
          window.localStorage.setItem('admin_refresh_token', data.refresh_token);
        }
        
        set({
          user: data.user,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isAuthenticated: true,
          requires2FA: data.requires_2fa || false,
          initialized: false,
        });
      },
      
      clearAuth: () => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('admin_access_token');
          window.localStorage.removeItem('admin_refresh_token');
        }
        
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          requires2FA: false,
          loading: false,
          initialized: true,
        });
      },
      
      set2FAVerified: () => {
        set({ requires2FA: false });
      },
      
      updateUser: (user) => {
        set({
          user,
          isAuthenticated: Boolean(user),
          requires2FA: user ? !user.mfa_verified : false,
          initialized: true,
        });
      },
    }),
    {
      name: 'admin-auth',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
            clear: () => undefined,
            key: () => null,
            length: 0,
          } as Storage;
        }
        return window.localStorage;
      }),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        initialized: state.initialized,
      }),
    }
  )
));

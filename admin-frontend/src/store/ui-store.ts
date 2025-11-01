'use client';

import { create } from 'zustand';

const getInitialDarkMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem('admin_dark_mode') === 'true';
};

const applyDarkModeClass = (enabled: boolean) => {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.classList.toggle('dark', enabled);
};

interface UIState {
  sidebarOpen: boolean;
  darkMode: boolean;
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  setSidebarOpen: (open: boolean) => void;
}

const initialDarkMode = getInitialDarkMode();
applyDarkModeClass(initialDarkMode);

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  darkMode: initialDarkMode,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  toggleDarkMode: () =>
    set((state) => {
      const newDarkMode = !state.darkMode;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('admin_dark_mode', String(newDarkMode));
      }
      applyDarkModeClass(newDarkMode);
      return { darkMode: newDarkMode };
    }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

import { create } from 'zustand'

export const useStore = create((set) => ({
  ledgerStampActive: false,
  setLedgerStampActive: (active) => set({ ledgerStampActive: active }),
  
  menuExpanded: false,
  setMenuExpanded: (expanded) => set({ menuExpanded: expanded }),

  theme: localStorage.getItem('theme') || 'light',
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    return { theme: newTheme };
  }),
}))

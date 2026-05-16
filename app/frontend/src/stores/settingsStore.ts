import { create } from 'zustand';
import type { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  tabSize: 2,
  wordWrap: 'off',
  minimap: true,
  autoSave: true,
  autoSaveDelay: 1000,
  terminalFontSize: 13,
  aiProvider: 'openai',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiBaseUrl: 'https://api.openai.com/v1',
  sidebarWidth: 260,
  terminalHeight: 250,
  aiPanelWidth: 380,
};

interface SettingsState {
  settings: AppSettings;
  isLoaded: boolean;
  
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  getSetting: <K extends keyof AppSettings>(key: K) => AppSettings[K];
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    const api = window.electronAPI;
    if (!api) {
      set({ isLoaded: true });
      return;
    }

    try {
      const settings = await api.getSettings();
      set({ settings: { ...DEFAULT_SETTINGS, ...settings }, isLoaded: true });
    } catch (err) {
      console.error('Failed to load settings:', err);
      set({ isLoaded: true });
    }
  },

  updateSettings: async (updates) => {
    const api = window.electronAPI;
    set((state) => ({
      settings: { ...state.settings, ...updates },
    }));

    if (api) {
      try {
        await api.setSettings(updates);
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    }
  },

  resetSettings: async () => {
    const api = window.electronAPI;
    set({ settings: DEFAULT_SETTINGS });

    if (api) {
      try {
        await api.resetSettings();
      } catch (err) {
        console.error('Failed to reset settings:', err);
      }
    }
  },

  getSetting: (key) => get().settings[key],
}));

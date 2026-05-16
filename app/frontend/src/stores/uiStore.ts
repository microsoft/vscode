import { create } from 'zustand';
import type { SidebarView, PanelView } from '../types';

interface UIState {
  sidebarView: SidebarView;
  sidebarVisible: boolean;
  terminalVisible: boolean;
  aiPanelVisible: boolean;
  commandPaletteVisible: boolean;
  sidebarWidth: number;
  terminalHeight: number;
  aiPanelWidth: number;

  setSidebarView: (view: SidebarView) => void;
  toggleSidebar: () => void;
  toggleTerminal: () => void;
  toggleAIPanel: () => void;
  toggleCommandPalette: () => void;
  setSidebarWidth: (width: number) => void;
  setTerminalHeight: (height: number) => void;
  setAIPanelWidth: (width: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarView: 'explorer',
  sidebarVisible: true,
  terminalVisible: true,
  aiPanelVisible: false,
  commandPaletteVisible: false,
  sidebarWidth: 260,
  terminalHeight: 250,
  aiPanelWidth: 380,

  setSidebarView: (view) =>
    set((state) => ({
      sidebarView: view,
      sidebarVisible: state.sidebarView === view ? !state.sidebarVisible : true,
    })),

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleTerminal: () => set((state) => ({ terminalVisible: !state.terminalVisible })),
  toggleAIPanel: () => set((state) => ({ aiPanelVisible: !state.aiPanelVisible })),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteVisible: !state.commandPaletteVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(500, width)) }),
  setTerminalHeight: (height) => set({ terminalHeight: Math.max(100, Math.min(600, height)) }),
  setAIPanelWidth: (width) => set({ aiPanelWidth: Math.max(300, Math.min(600, width)) }),
}));

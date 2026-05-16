import { create } from 'zustand';
import type { EditorTab } from '../types';

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  
  openTab: (tab: EditorTab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabClean: (tabId: string) => void;
  markTabDirty: (tabId: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (tabId: string) => void;
}

const getLanguage = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact',
    js: 'javascript', jsx: 'javascriptreact',
    json: 'json', html: 'html', css: 'css',
    scss: 'scss', less: 'less', md: 'markdown',
    py: 'python', rs: 'rust', go: 'go',
    java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', rb: 'ruby', php: 'php',
    sql: 'sql', sh: 'shell', yml: 'yaml',
    yaml: 'yaml', xml: 'xml', toml: 'toml',
    swift: 'swift', kt: 'kotlin',
  };
  return langMap[ext] || 'plaintext';
};

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tab) =>
    set((state) => {
      const existing = state.tabs.find((t) => t.path === tab.path);
      if (existing) {
        return { activeTabId: existing.id };
      }
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      };
    }),

  closeTab: (tabId) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId);
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === tabId) {
        if (newTabs.length > 0) {
          newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].id;
        } else {
          newActiveId = null;
        }
      }

      return { tabs: newTabs, activeTabId: newActiveId };
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTabContent: (tabId, content) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, content, isDirty: true } : t
      ),
    })),

  markTabClean: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, isDirty: false } : t
      ),
    })),

  markTabDirty: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, isDirty: true } : t
      ),
    })),

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  closeOtherTabs: (tabId) =>
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id === tabId),
      activeTabId: tabId,
    })),
}));

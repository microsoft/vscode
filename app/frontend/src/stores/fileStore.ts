import { create } from 'zustand';
import type { FileEntry, Project } from '../types';

interface FileState {
  rootPath: string | null;
  files: FileEntry[];
  expandedDirs: Set<string>;
  currentProject: Project | null;
  recentProjects: Project[];
  isLoading: boolean;

  setRootPath: (path: string) => void;
  setFiles: (files: FileEntry[]) => void;
  toggleDir: (path: string) => void;
  expandDir: (path: string) => void;
  collapseDir: (path: string) => void;
  setCurrentProject: (project: Project | null) => void;
  setRecentProjects: (projects: Project[]) => void;
  setIsLoading: (loading: boolean) => void;
  refreshFiles: () => Promise<void>;
}

export const useFileStore = create<FileState>((set, get) => ({
  rootPath: null,
  files: [],
  expandedDirs: new Set<string>(),
  currentProject: null,
  recentProjects: [],
  isLoading: false,

  setRootPath: (path) => set({ rootPath: path, expandedDirs: new Set([path]) }),

  setFiles: (files) => set({ files }),

  toggleDir: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedDirs);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedDirs: newExpanded };
    }),

  expandDir: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedDirs);
      newExpanded.add(path);
      return { expandedDirs: newExpanded };
    }),

  collapseDir: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedDirs);
      newExpanded.delete(path);
      return { expandedDirs: newExpanded };
    }),

  setCurrentProject: (project) => set({ currentProject: project }),
  setRecentProjects: (projects) => set({ recentProjects: projects }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  refreshFiles: async () => {
    const { rootPath } = get();
    if (!rootPath || !window.electronAPI) return;

    set({ isLoading: true });
    try {
      const files = await window.electronAPI.listFiles(rootPath);
      set({ files, isLoading: false });
    } catch (err) {
      console.error('Failed to refresh files:', err);
      set({ isLoading: false });
    }
  },
}));

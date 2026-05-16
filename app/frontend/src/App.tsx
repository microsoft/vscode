import { useEffect } from 'react';
import Layout from './components/Layout';
import CommandPalette from './components/CommandPalette';
import { useSettingsStore } from './stores/settingsStore';
import { useFileStore } from './stores/fileStore';
import { useUIStore } from './stores/uiStore';
import { useAIStore } from './stores/aiStore';

export default function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const toggleAIPanel = useUIStore((s) => s.toggleAIPanel);
  const commandPaletteVisible = useUIStore((s) => s.commandPaletteVisible);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Load recent projects
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.getRecentProjects().then((projects) => {
      useFileStore.getState().setRecentProjects(projects);
    }).catch(console.error);
  }, []);

  // Set up AI streaming listeners
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const removeDataListener = api.onAIStreamData((_streamId, data) => {
      useAIStore.getState().appendStreamContent(data);
    });

    const removeEndListener = api.onAIStreamEnd((_streamId) => {
      useAIStore.getState().finalizeStream();
    });

    const removeErrorListener = api.onAIStreamError((_streamId, error) => {
      const store = useAIStore.getState();
      store.addMessage({
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error}`,
        timestamp: Date.now(),
      });
      store.setIsLoading(false);
      store.setCurrentStreamId(null);
    });

    return () => {
      removeDataListener();
      removeEndListener();
      removeErrorListener();
    };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        toggleCommandPalette();
      } else if (ctrl && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (ctrl && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      } else if (ctrl && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleAIPanel();
      } else if (e.key === 'Escape' && commandPaletteVisible) {
        toggleCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette, toggleSidebar, toggleTerminal, toggleAIPanel, commandPaletteVisible]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg-primary text-text-primary flex flex-col">
      <Layout />
      {commandPaletteVisible && <CommandPalette />}
    </div>
  );
}

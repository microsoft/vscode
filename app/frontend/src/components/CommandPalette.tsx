import { useState, useEffect, useRef, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useEditorStore } from '../stores/editorStore';
import { useFileStore } from '../stores/fileStore';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  category?: string;
}

export default function CommandPalette() {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const toggleAIPanel = useUIStore((s) => s.toggleAIPanel);
  const setSidebarView = useUIStore((s) => s.setSidebarView);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);

  const commands: Command[] = useMemo(
    () => [
      {
        id: 'open-folder',
        label: 'Open Folder',
        shortcut: 'Ctrl+O',
        category: 'File',
        action: async () => {
          toggleCommandPalette();
          const api = window.electronAPI;
          if (!api) return;
          const folder = await api.selectDirectory();
          if (folder) {
            useFileStore.getState().setRootPath(folder);
            useFileStore.getState().refreshFiles();
          }
        },
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        shortcut: 'Ctrl+B',
        category: 'View',
        action: () => {
          toggleSidebar();
          toggleCommandPalette();
        },
      },
      {
        id: 'toggle-terminal',
        label: 'Toggle Terminal',
        shortcut: 'Ctrl+`',
        category: 'View',
        action: () => {
          toggleTerminal();
          toggleCommandPalette();
        },
      },
      {
        id: 'toggle-ai',
        label: 'Toggle AI Assistant',
        shortcut: 'Ctrl+Shift+A',
        category: 'View',
        action: () => {
          toggleAIPanel();
          toggleCommandPalette();
        },
      },
      {
        id: 'show-explorer',
        label: 'Show Explorer',
        category: 'View',
        action: () => {
          setSidebarView('explorer');
          toggleCommandPalette();
        },
      },
      {
        id: 'show-search',
        label: 'Search in Files',
        shortcut: 'Ctrl+Shift+F',
        category: 'View',
        action: () => {
          setSidebarView('search');
          toggleCommandPalette();
        },
      },
      {
        id: 'show-settings',
        label: 'Open Settings',
        shortcut: 'Ctrl+,',
        category: 'Preferences',
        action: () => {
          setSidebarView('settings');
          toggleCommandPalette();
        },
      },
      {
        id: 'close-all-tabs',
        label: 'Close All Editors',
        category: 'Editor',
        action: () => {
          closeAllTabs();
          toggleCommandPalette();
        },
      },
      {
        id: 'new-terminal',
        label: 'New Terminal',
        shortcut: 'Ctrl+Shift+`',
        category: 'Terminal',
        action: () => {
          toggleCommandPalette();
          useUIStore.getState().toggleTerminal();
        },
      },
      {
        id: 'toggle-devtools',
        label: 'Toggle Developer Tools',
        shortcut: 'F12',
        category: 'Developer',
        action: () => {
          toggleCommandPalette();
          window.electronAPI?.toggleDevTools();
        },
      },
    ],
    [toggleCommandPalette, toggleSidebar, toggleTerminal, toggleAIPanel, setSidebarView, closeAllTabs]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.category?.toLowerCase().includes(lower)
    );
  }, [query, commands]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      toggleCommandPalette();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/50" onClick={toggleCommandPalette} />
      <div className="relative w-[560px] bg-bg-secondary border border-border-primary rounded-lg shadow-2xl overflow-hidden">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          className="w-full px-4 py-3 bg-transparent text-text-primary text-sm border-b border-border-primary outline-none"
        />
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm ${
                idx === selectedIndex
                  ? 'bg-accent-blue/20 text-text-primary'
                  : 'text-text-secondary hover:bg-bg-hover'
              }`}
              onClick={cmd.action}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="flex items-center gap-2">
                {cmd.category && (
                  <span className="text-xxs text-text-muted">{cmd.category}:</span>
                )}
                <span>{cmd.label}</span>
              </div>
              {cmd.shortcut && (
                <kbd className="text-xxs px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted border border-border-primary font-mono">
                  {cmd.shortcut}
                </kbd>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

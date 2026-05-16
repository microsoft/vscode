import {
  Files,
  Search,
  MessageSquare,
  Settings,
  FolderOpen,
} from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { useFileStore } from '../stores/fileStore';
import type { SidebarView } from '../types';

const activities: Array<{ id: SidebarView; icon: typeof Files; label: string }> = [
  { id: 'explorer', icon: Files, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'ai', icon: MessageSquare, label: 'AI Assistant' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export default function ActivityBar() {
  const sidebarView = useUIStore((s) => s.sidebarView);
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const setSidebarView = useUIStore((s) => s.setSidebarView);
  const toggleAIPanel = useUIStore((s) => s.toggleAIPanel);

  const handleClick = (id: SidebarView) => {
    if (id === 'ai') {
      toggleAIPanel();
    } else {
      setSidebarView(id);
    }
  };

  return (
    <div className="w-12 bg-bg-tertiary flex flex-col items-center py-2 gap-1 border-r border-border-primary flex-shrink-0">
      {activities.map(({ id, icon: Icon, label }) => {
        const isActive =
          id === 'ai'
            ? useUIStore.getState().aiPanelVisible
            : sidebarVisible && sidebarView === id;

        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            className={`
              w-10 h-10 flex items-center justify-center rounded-md
              transition-colors duration-100 group relative
              ${
                isActive
                  ? 'text-text-primary bg-bg-hover border-l-2 border-accent-blue'
                  : 'text-text-muted hover:text-text-secondary'
              }
            `}
            title={label}
          >
            <Icon size={20} />
            <span className="absolute left-12 px-2 py-1 bg-bg-hover text-text-primary text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
              {label}
            </span>
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={async () => {
          const api = window.electronAPI;
          if (!api) return;
          const folder = await api.selectDirectory();
          if (folder) {
            const store = useFileStore.getState();
            store.setRootPath(folder);
            store.refreshFiles();
            useUIStore.getState().setSidebarView('explorer');
          }
        }}
        className="w-10 h-10 flex items-center justify-center text-text-muted hover:text-text-secondary rounded-md transition-colors group relative"
        title="Open Folder"
      >
        <FolderOpen size={20} />
        <span className="absolute left-12 px-2 py-1 bg-bg-hover text-text-primary text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
          Open Folder
        </span>
      </button>
    </div>
  );
}

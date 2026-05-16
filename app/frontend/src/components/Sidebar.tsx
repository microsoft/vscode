import { useUIStore } from '../stores/uiStore';
import FileExplorer from './FileExplorer';
import SearchPanel from './SearchPanel';
import SettingsPanel from './SettingsPanel';

export default function Sidebar() {
  const sidebarView = useUIStore((s) => s.sidebarView);

  return (
    <div className="h-full flex flex-col">
      {sidebarView === 'explorer' && <FileExplorer />}
      {sidebarView === 'search' && <SearchPanel />}
      {sidebarView === 'settings' && <SettingsPanel />}
    </div>
  );
}

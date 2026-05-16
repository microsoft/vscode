import { GitBranch, AlertCircle, CheckCircle } from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { useFileStore } from '../stores/fileStore';
import { useUIStore } from '../stores/uiStore';

export default function StatusBar() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const rootPath = useFileStore((s) => s.rootPath);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const toggleAIPanel = useUIStore((s) => s.toggleAIPanel);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="h-6 bg-accent-blue/10 border-t border-border-primary flex items-center justify-between px-3 text-xxs select-none">
      <div className="flex items-center gap-3">
        {rootPath && (
          <div className="flex items-center gap-1 text-text-muted">
            <GitBranch size={11} />
            <span>main</span>
          </div>
        )}
        <button
          className="flex items-center gap-1 text-text-muted hover:text-text-primary"
          onClick={toggleTerminal}
        >
          <CheckCircle size={11} />
          <span>Terminal</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {activeTab && (
          <>
            <span className="text-text-muted">
              {activeTab.language}
            </span>
            <span className="text-text-muted">UTF-8</span>
            <span className="text-text-muted">
              {activeTab.isDirty ? 'Modified' : 'Saved'}
            </span>
          </>
        )}
        <button
          className="text-text-muted hover:text-text-primary"
          onClick={toggleAIPanel}
        >
          AI Assistant
        </button>
      </div>
    </div>
  );
}

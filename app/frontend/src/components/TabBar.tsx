import { X, Circle } from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';

export default function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-bg-secondary border-b border-border-primary overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`
              flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer
              border-r border-border-primary min-w-0 group flex-shrink-0
              ${
                isActive
                  ? 'bg-bg-primary text-text-primary border-t-2 border-t-accent-blue'
                  : 'bg-bg-secondary text-text-muted hover:bg-bg-hover border-t-2 border-t-transparent'
              }
            `}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="truncate max-w-[120px]">{tab.name}</span>
            <button
              className="flex-shrink-0 p-0.5 rounded hover:bg-bg-active opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              title="Close"
            >
              {tab.isDirty ? (
                <Circle size={8} className="fill-accent-orange text-accent-orange" />
              ) : (
                <X size={12} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

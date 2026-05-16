import { useUIStore } from '../stores/uiStore';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import EditorPanel from './EditorPanel';
import TerminalPanel from './TerminalPanel';
import AIPanel from './AIPanel';
import StatusBar from './StatusBar';

export default function Layout() {
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const terminalVisible = useUIStore((s) => s.terminalVisible);
  const aiPanelVisible = useUIStore((s) => s.aiPanelVisible);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const aiPanelWidth = useUIStore((s) => s.aiPanelWidth);

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar />

        {/* Sidebar */}
        {sidebarVisible && (
          <div
            className="flex-shrink-0 border-r border-border-primary bg-sidebar-bg overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            <Sidebar />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Editor Area */}
          <div className="flex-1 overflow-hidden">
            <EditorPanel />
          </div>

          {/* Terminal Panel */}
          {terminalVisible && (
            <div className="border-t border-border-primary">
              <TerminalPanel />
            </div>
          )}
        </div>

        {/* AI Panel */}
        {aiPanelVisible && (
          <div
            className="flex-shrink-0 border-l border-border-primary bg-bg-secondary overflow-hidden"
            style={{ width: aiPanelWidth }}
          >
            <AIPanel />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar />
    </>
  );
}

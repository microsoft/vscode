import { useCallback, useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import TabBar from './TabBar';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileStore } from '../stores/fileStore';

export default function EditorPanel() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const markTabClean = useEditorStore((s) => s.markTabClean);
  const settings = useSettingsStore((s) => s.settings);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty) return;
    const api = window.electronAPI;
    if (!api) return;

    try {
      await api.writeFile(activeTab.path, activeTab.content);
      markTabClean(activeTab.id);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [activeTab, markTabClean]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!activeTab || value === undefined) return;
      updateTabContent(activeTab.id, value);

      if (settings.autoSave) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
          const api = window.electronAPI;
          if (!api) return;
          try {
            await api.writeFile(activeTab.path, value);
            markTabClean(activeTab.id);
          } catch (err) {
            console.error('Auto-save failed:', err);
          }
        }, settings.autoSaveDelay);
      }
    },
    [activeTab, updateTabContent, markTabClean, settings.autoSave, settings.autoSaveDelay]
  );

  // Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  if (tabs.length === 0) {
    return <WelcomeEditor />;
  }

  return (
    <div className="h-full flex flex-col">
      <TabBar />
      {activeTab && (
        <div className="flex-1 overflow-hidden">
          <Editor
            key={activeTab.id}
            defaultLanguage={activeTab.language}
            defaultValue={activeTab.content}
            theme="vs-dark"
            onChange={handleChange}
            onMount={handleEditorMount}
            options={{
              fontSize: settings.fontSize,
              fontFamily: settings.fontFamily,
              tabSize: settings.tabSize,
              wordWrap: settings.wordWrap,
              minimap: { enabled: settings.minimap },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderLineHighlight: 'all',
              bracketPairColorization: { enabled: true },
              padding: { top: 8 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: 'on',
              folding: true,
              links: true,
              contextmenu: true,
              suggest: {
                showMethods: true,
                showFunctions: true,
                showConstructors: true,
                showFields: true,
                showVariables: true,
                showClasses: true,
                showStructs: true,
                showInterfaces: true,
                showModules: true,
                showProperties: true,
                showEvents: true,
                showOperators: true,
                showUnits: true,
                showValues: true,
                showConstants: true,
                showEnums: true,
                showEnumMembers: true,
                showKeywords: true,
                showWords: true,
                showColors: true,
                showFiles: true,
                showReferences: true,
                showSnippets: true,
              },
            }}
          />
        </div>
      )}
    </div>
  );
}

function WelcomeEditor() {
  const rootPath = useFileStore((s) => s.rootPath);

  return (
    <div className="h-full flex items-center justify-center bg-bg-primary">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-text-primary mb-2">AI Studio</h1>
        <p className="text-text-muted mb-8">Your AI-powered coding companion</p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <ShortcutItem keys="Ctrl+Shift+P" label="Command Palette" />
          <ShortcutItem keys="Ctrl+O" label="Open Folder" />
          <ShortcutItem keys="Ctrl+B" label="Toggle Sidebar" />
          <ShortcutItem keys="Ctrl+`" label="Toggle Terminal" />
          <ShortcutItem keys="Ctrl+Shift+A" label="AI Assistant" />
          <ShortcutItem keys="Ctrl+Shift+F" label="Search Files" />
        </div>

        {!rootPath && (
          <button
            onClick={async () => {
              const api = window.electronAPI;
              if (!api) return;
              const folder = await api.selectDirectory();
              if (folder) {
                useFileStore.getState().setRootPath(folder);
                useFileStore.getState().refreshFiles();
              }
            }}
            className="btn-primary mt-8"
          >
            Open a Project
          </button>
        )}
      </div>
    </div>
  );
}

function ShortcutItem({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary rounded">
      <span className="text-text-muted">{label}</span>
      <kbd className="text-xxs px-1.5 py-0.5 bg-bg-tertiary rounded text-text-secondary border border-border-primary font-mono">
        {keys}
      </kbd>
    </div>
  );
}

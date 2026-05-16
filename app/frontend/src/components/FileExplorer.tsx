import { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useFileStore } from '../stores/fileStore';
import { useEditorStore } from '../stores/editorStore';
import type { FileEntry } from '../types';

export default function FileExplorer() {
  const rootPath = useFileStore((s) => s.rootPath);
  const files = useFileStore((s) => s.files);
  const isLoading = useFileStore((s) => s.isLoading);
  const recentProjects = useFileStore((s) => s.recentProjects);
  const refreshFiles = useFileStore((s) => s.refreshFiles);

  if (!rootPath) {
    return <WelcomeView recentProjects={recentProjects} />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider truncate">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <ActionButton icon={Plus} title="New File" onClick={() => handleNewFile(rootPath)} />
          <ActionButton icon={FolderPlus} title="New Folder" onClick={() => handleNewFolder(rootPath)} />
          <ActionButton icon={RefreshCw} title="Refresh" onClick={refreshFiles} />
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-text-muted text-sm">
            Loading...
          </div>
        ) : (
          files.map((entry) => (
            <FileTreeNode key={entry.path} entry={entry} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}

function FileTreeNode({ entry, depth }: { entry: FileEntry; depth: number }) {
  const expandedDirs = useFileStore((s) => s.expandedDirs);
  const toggleDir = useFileStore((s) => s.toggleDir);
  const openTab = useEditorStore((s) => s.openTab);
  const isExpanded = expandedDirs.has(entry.path);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback(async () => {
    if (entry.isDirectory) {
      toggleDir(entry.path);
    } else {
      const api = window.electronAPI;
      if (!api) return;
      try {
        const content = await api.readFile(entry.path);
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
          ts: 'typescript', tsx: 'typescriptreact', js: 'javascript',
          jsx: 'javascriptreact', json: 'json', html: 'html',
          css: 'css', md: 'markdown', py: 'python', rs: 'rust',
          go: 'go', java: 'java', sql: 'sql', sh: 'shell',
          yml: 'yaml', yaml: 'yaml', xml: 'xml',
        };
        openTab({
          id: entry.path,
          path: entry.path,
          name: entry.name,
          language: langMap[ext] || 'plaintext',
          content,
          isDirty: false,
        });
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    }
  }, [entry, toggleDir, openTab]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        className="flex items-center gap-1 px-2 py-0.5 hover:bg-sidebar-hover cursor-pointer text-sm group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {entry.isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown size={14} className="text-text-muted flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen size={14} className="text-accent-yellow flex-shrink-0" />
            ) : (
              <Folder size={14} className="text-accent-yellow flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 flex-shrink-0" />
            <File size={14} className="text-text-muted flex-shrink-0" />
          </>
        )}
        <span className="truncate text-text-secondary group-hover:text-text-primary">
          {entry.name}
        </span>

        <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
          <button
            className="p-0.5 hover:bg-bg-active rounded"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(entry);
            }}
            title="Delete"
          >
            <Trash2 size={12} className="text-text-muted" />
          </button>
        </div>
      </div>

      {entry.isDirectory && isExpanded && entry.children?.map((child) => (
        <FileTreeNode key={child.path} entry={child} depth={depth + 1} />
      ))}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={entry}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

function ContextMenu({
  x, y, entry, onClose,
}: {
  x: number; y: number; entry: FileEntry; onClose: () => void;
}) {
  const handleAction = async (action: string) => {
    onClose();
    const api = window.electronAPI;
    if (!api) return;

    switch (action) {
      case 'newFile':
        await handleNewFile(entry.isDirectory ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/')));
        break;
      case 'newFolder':
        await handleNewFolder(entry.isDirectory ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/')));
        break;
      case 'delete':
        await handleDelete(entry);
        break;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-bg-secondary border border-border-primary rounded-md shadow-xl py-1 min-w-[160px]"
        style={{ left: x, top: y }}
      >
        <button className="w-full px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary" onClick={() => handleAction('newFile')}>
          New File
        </button>
        <button className="w-full px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary" onClick={() => handleAction('newFolder')}>
          New Folder
        </button>
        <div className="border-t border-border-primary my-1" />
        <button className="w-full px-3 py-1.5 text-left text-sm text-accent-red hover:bg-bg-hover" onClick={() => handleAction('delete')}>
          Delete
        </button>
      </div>
    </>
  );
}

function ActionButton({ icon: Icon, title, onClick }: { icon: typeof Plus; title: string; onClick: () => void }) {
  return (
    <button
      className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
      title={title}
      onClick={onClick}
    >
      <Icon size={14} />
    </button>
  );
}

function WelcomeView({ recentProjects }: { recentProjects: Array<{ name: string; path: string }> }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-4">🚀</div>
      <h2 className="text-lg font-semibold text-text-primary mb-2">AI Studio</h2>
      <p className="text-sm text-text-muted mb-6">Open a folder to get started</p>

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
        className="btn-primary mb-6"
      >
        Open Folder
      </button>

      {recentProjects.length > 0 && (
        <div className="w-full">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            Recent Projects
          </h3>
          <div className="space-y-1">
            {recentProjects.map((project) => (
              <button
                key={project.path}
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-sidebar-hover rounded transition-colors"
                onClick={() => {
                  useFileStore.getState().setRootPath(project.path);
                  useFileStore.getState().refreshFiles();
                }}
              >
                <div className="font-medium text-text-primary">{project.name}</div>
                <div className="text-xs text-text-muted truncate">{project.path}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function handleNewFile(basePath: string) {
  const name = prompt('Enter file name:');
  if (!name) return;
  const api = window.electronAPI;
  if (!api) return;
  try {
    const filePath = `${basePath}/${name}`;
    await api.createFile(filePath);
    useFileStore.getState().refreshFiles();
  } catch (err) {
    console.error('Failed to create file:', err);
  }
}

async function handleNewFolder(basePath: string) {
  const name = prompt('Enter folder name:');
  if (!name) return;
  const api = window.electronAPI;
  if (!api) return;
  try {
    await api.createDirectory(`${basePath}/${name}`);
    useFileStore.getState().refreshFiles();
  } catch (err) {
    console.error('Failed to create folder:', err);
  }
}

async function handleDelete(entry: FileEntry) {
  if (!confirm(`Delete ${entry.name}?`)) return;
  const api = window.electronAPI;
  if (!api) return;
  try {
    if (entry.isDirectory) {
      await api.deleteDirectory(entry.path);
    } else {
      await api.deleteFile(entry.path);
    }
    useFileStore.getState().refreshFiles();
  } catch (err) {
    console.error('Failed to delete:', err);
  }
}

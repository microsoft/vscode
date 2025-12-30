/**
 * EditorContextProvider - Provides editor state to chat components
 *
 * Bridges VSCode editor state to React components, providing:
 * - Active file information
 * - Selection context
 * - Symbol information
 * - Project model from Workspace CA
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { ConversationContext, FileContext, SelectionContext, SymbolContext, ProjectModel } from '../chat/types';
import { WorkspaceCA } from '../workspace-ca/WorkspaceCA';

interface EditorContextValue {
  context: ConversationContext;
  refreshContext: () => Promise<void>;
  clearContext: () => void;
  addFileToContext: (file: FileContext) => void;
  setSelection: (selection: SelectionContext | undefined) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

interface EditorContextProviderProps {
  workspaceId: string;
  children: ReactNode;
}

export const EditorContextProvider: React.FC<EditorContextProviderProps> = ({
  workspaceId,
  children,
}) => {
  const [context, setContext] = useState<ConversationContext>({
    openFiles: [],
    symbols: [],
    previousResponses: [],
    workspaceId,
  });

  // Refresh context from VSCode state
  const refreshContext = useCallback(async () => {
    try {
      // In a real implementation, this would call VSCode API
      const openFiles = await getOpenFiles();
      const selection = await getCurrentSelection();
      const symbols = await getRelevantSymbols();
      const projectModel = await getProjectModel();

      setContext((prev) => ({
        ...prev,
        openFiles,
        selection,
        symbols,
        projectModel,
      }));
    } catch (error) {
      console.error('[EditorContext] Failed to refresh:', error);
    }
  }, []);

  // Clear context
  const clearContext = useCallback(() => {
    setContext({
      openFiles: [],
      symbols: [],
      previousResponses: [],
      workspaceId,
    });
  }, [workspaceId]);

  // Add file to context
  const addFileToContext = useCallback((file: FileContext) => {
    setContext((prev) => ({
      ...prev,
      openFiles: [...prev.openFiles.filter((f) => f.path !== file.path), file],
    }));
  }, []);

  // Set selection
  const setSelection = useCallback((selection: SelectionContext | undefined) => {
    setContext((prev) => ({
      ...prev,
      selection,
    }));
  }, []);

  // Set up listeners for editor changes
  useEffect(() => {
    // These would be VSCode event listeners in the real implementation
    const handleActiveEditorChange = () => refreshContext();
    const handleSelectionChange = () => refreshContext();
    const handleDocumentChange = () => refreshContext();

    // Initial refresh
    refreshContext();

    // Set up polling for demo purposes
    // (Real implementation would use VSCode events)
    const interval = setInterval(refreshContext, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshContext]);

  return (
    <EditorContext.Provider
      value={{
        context,
        refreshContext,
        clearContext,
        addFileToContext,
        setSelection,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

/**
 * Hook to access editor context
 */
export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within EditorContextProvider');
  }
  return context;
}

// Mock implementations for VSCode API calls
// In real implementation, these would use vscode.window, vscode.workspace, etc.

async function getOpenFiles(): Promise<FileContext[]> {
  // Would use vscode.window.visibleTextEditors
  return [];
}

async function getCurrentSelection(): Promise<SelectionContext | undefined> {
  // Would use vscode.window.activeTextEditor.selection
  return undefined;
}

async function getRelevantSymbols(): Promise<SymbolContext[]> {
  // Would use vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider')
  return [];
}

async function getProjectModel(): Promise<ProjectModel | undefined> {
  // Would get from Workspace CA
  return undefined;
}

export default EditorContextProvider;



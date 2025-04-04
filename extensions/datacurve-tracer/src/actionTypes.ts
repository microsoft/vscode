import * as vscode from 'vscode';
import { Thought } from './tracers/thoughtsTracker';

/**
 * Base type for all trace actions
 */
export interface BaseAction {
  action_id: string;
  timestamp: number;
}

/**
 * Common workspace state type
 */
export interface WorkspaceState {
  files?: string[];
  directories?: string[];
  expandedDirectories?: string[];
  activeFile?: string;
}

/**
 * ==========================================
 * FileSystem Tracer Action Types
 * ==========================================
 */

export interface FileChangeTextDocumentAction extends BaseAction {
  action_id: 'fileDidChangeTextDocument';
  event: {
    event: vscode.TextDocumentChangeEvent;
    workspace: WorkspaceState;
  };
}

export interface FileCreateFilesAction extends BaseAction {
  action_id: 'fileDidCreateFiles';
  event: {
    event: vscode.FileCreateEvent;
    workspace: WorkspaceState;
  };
}

export interface FileDeleteFilesAction extends BaseAction {
  action_id: 'fileDidDeleteFiles';
  event: {
    event: vscode.FileDeleteEvent;
    workspace: WorkspaceState;
  };
}

export interface FileRenameFilesAction extends BaseAction {
  action_id: 'fileDidRenameFiles';
  event: {
    event: vscode.FileRenameEvent;
    workspace: WorkspaceState;
  };
}

export interface FileOpenTextDocumentAction extends BaseAction {
  action_id: 'fileDidOpenTextDocument';
  event: {
    document: vscode.TextDocument;
    workspace: WorkspaceState;
  };
}

export interface FileCloseTextDocumentAction extends BaseAction {
  action_id: 'fileDidCloseTextDocument';
  event: {
    document: vscode.TextDocument;
    workspace: WorkspaceState;
  };
}

export interface FileWillSaveTextDocumentAction extends BaseAction {
  action_id: 'fileWillSaveTextDocument';
  event: {
    eventSpecs: vscode.TextDocumentWillSaveEvent;
    document: string; // Clipped document text
  };
}

export interface FileDidSaveTextDocumentAction extends BaseAction {
  action_id: 'fileDidSaveTextDocument';
  event: {
    document: vscode.TextDocument;
    diff: string; // Clipped document text after save
  };
}

export interface FileDidCreateFilesCustomAction extends BaseAction {
  action_id: 'fileDidCreateFilesCustom';
  event: {
    event: vscode.Uri;
    workspace: WorkspaceState;
  };
}

export interface FileDidCreateFolderCustomAction extends BaseAction {
  action_id: 'fileDidCreateFolderCustom';
  event: {
    event: vscode.Uri;
    workspace: WorkspaceState;
  };
}

export interface FileDidDeleteFilesCustomAction extends BaseAction {
  action_id: 'fileDidDeleteFilesCustom';
  event: {
    event: vscode.Uri;
    workspace: WorkspaceState;
  };
}

export interface FileDidRenameFilesCustomAction extends BaseAction {
  action_id: 'fileDidRenameFilesCustom';
  event: {
    event: {
      oldUri: vscode.Uri;
      newUri: vscode.Uri;
    };
    workspace: WorkspaceState;
  };
}

/**
 * ==========================================
 * Editor Tracer Action Types
 * ==========================================
 */

export interface EditorChangeActiveTextEditorAction extends BaseAction {
  action_id: 'editorDidChangeActiveTextEditor';
  event: {
    editor: vscode.TextEditor | undefined;
  };
}

export interface EditorChangeTextEditorSelectionAction extends BaseAction {
  action_id: 'editorDidChangeTextEditorSelection';
  event: {
    event: vscode.TextEditorSelectionChangeEvent;
    selection: readonly vscode.Selection[];
    selectedText: string[];
    workspace: WorkspaceState;
  };
}

export interface EditorChangeTextEditorVisibleRangesAction extends BaseAction {
  action_id: 'editorDidChangeTextEditorVisibleRanges';
  event: {
    event: vscode.TextEditorVisibleRangesChangeEvent;
    visibleRange: string[];
  };
}

export interface EditorChangeTextEditorViewColumnAction extends BaseAction {
  action_id: 'editorDidChangeTextEditorViewColumn';
  event: {
    event: vscode.TextEditorViewColumnChangeEvent;
  };
}

export interface EditorChangeVisibleTextEditorsAction extends BaseAction {
  action_id: 'editorDidChangeVisibleTextEditors';
  event: {
    editors: readonly vscode.TextEditor[];
  };
}

/**
 * ==========================================
 * Terminal Tracer Action Types
 * ==========================================
 */

export interface TerminalBeginShellExecutionAction extends BaseAction {
  action_id: 'terminalBeginShellExecution';
  event: {
    details: vscode.TerminalShellExecutionStartEvent;
    buffer: string;
  };
}

export interface TerminalEndShellExecutionAction extends BaseAction {
  action_id: 'terminalEndShellExecution';
  event: {
    details: vscode.TerminalShellExecutionEndEvent;
    buffer: string;
  };
}

/**
 * ==========================================
 * Clipboard Tracer Action Types
 * ==========================================
 */

export interface ClipboardCopyAction extends BaseAction {
  action_id: 'clipboardDidCopy';
  event: {
    text: string;
  };
}

/**
 * ==========================================
 * Thoughts Tracer Action Types
 * ==========================================
 */

export interface ThoughtNewThoughtAction extends BaseAction {
  action_id: 'thoughts.newThought';
  event: {
    thought: Thought;
  };
}

/**
 * ==========================================
 * Custom User Action Types
 * ==========================================
 */

export interface UserIdeaAction extends BaseAction {
  action_id: 'idea';
  event: {
    idea: string;
  };
}

export interface UserSearchAction extends BaseAction {
  action_id: 'search';
  event: {
    idea: string;
  };
}

/**
 * ==========================================
 * Union type for all possible actions
 * ==========================================
 */
export type Action =
  | FileChangeTextDocumentAction
  | FileCreateFilesAction
  | FileDeleteFilesAction
  | FileRenameFilesAction
  | FileOpenTextDocumentAction
  | FileCloseTextDocumentAction
  | FileWillSaveTextDocumentAction
  | FileDidSaveTextDocumentAction
  | FileDidCreateFilesCustomAction
  | FileDidCreateFolderCustomAction
  | FileDidDeleteFilesCustomAction
  | FileDidRenameFilesCustomAction
  | EditorChangeActiveTextEditorAction
  | EditorChangeTextEditorSelectionAction
  | EditorChangeTextEditorVisibleRangesAction
  | EditorChangeTextEditorViewColumnAction
  | EditorChangeVisibleTextEditorsAction
  | TerminalBeginShellExecutionAction
  | TerminalEndShellExecutionAction
  | ClipboardCopyAction
  | ThoughtNewThoughtAction
  | UserIdeaAction
  | UserSearchAction;

/**
 * Type guard to check if an action is of a specific type
 */
export function isActionType<T extends Action>(
  action: Action,
  actionId: T['action_id']
): action is T {
  return action.action_id === actionId;
}

/**
 * Function to generate JSON schema from the Action type
 * This can be used to create a formal schema for the records
 */
export function generateActionJsonSchema(): object {
  // This is a placeholder function that would typically generate a JSON Schema
  // from the TypeScript type definitions. For now, it returns a basic structure.
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'DataCurve Action Record',
    type: 'object',
    required: ['action_id', 'timestamp'],
    properties: {
      action_id: {
        type: 'string',
        description: 'Unique identifier for the action type'
      },
      timestamp: {
        type: 'number',
        description: 'Unix timestamp (milliseconds) when the action occurred'
      },
      event: {
        type: 'object',
        description: 'Event data specific to the action type'
      }
    },
    oneOf: [
      // File actions
      { $ref: '#/definitions/fileDidChangeTextDocument' },
      { $ref: '#/definitions/fileDidCreateFiles' },
      // ... other action references would be listed here
    ],
    definitions: {
      // Detailed schema definitions for each action type would go here
      fileDidChangeTextDocument: {
        type: 'object',
        required: ['action_id', 'event'],
        properties: {
          action_id: { 
            type: 'string',
            const: 'fileDidChangeTextDocument' 
          },
          event: {
            type: 'object',
            required: ['event', 'workspace'],
            properties: {
              // Define properties specific to this action
            }
          }
        }
      },
      // ... other action definitions would follow
    }
  };
} 
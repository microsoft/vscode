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
 * ==========================================
 * FileSystem Tracer Action Types
 * ==========================================
 */

export interface FileChangeTextDocumentAction extends BaseAction {
	action_id: 'fileDidChangeTextDocument';
	event: {
		basicEvent: vscode.TextDocumentChangeEvent;
	};
}

export interface FileCreateFilesAction extends BaseAction {
	action_id: 'fileDidCreateFiles';
	event: {
		basicEvent: vscode.FileCreateEvent;
	};
}

export interface FileDeleteFilesAction extends BaseAction {
	action_id: 'fileDidDeleteFiles';
	event: {
		basicEvent: vscode.FileDeleteEvent;
	};
}

export interface FileRenameFilesAction extends BaseAction {
	action_id: 'fileDidRenameFiles';
	event: {
		basicEvent: vscode.FileRenameEvent;
	};
}

export interface FileOpenTextDocumentAction extends BaseAction {
	action_id: 'fileDidOpenTextDocument';
	event: {
		basicEvent: vscode.TextDocument;
	};
}

export interface FileCloseTextDocumentAction extends BaseAction {
	action_id: 'fileDidCloseTextDocument';
	event: {
		basicEvent: vscode.TextDocument;
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
		basicEvent: vscode.Uri;
	};
}

export interface FileDidCreateFolderCustomAction extends BaseAction {
	action_id: 'fileDidCreateFolderCustom';
	event: {
		basicEvent: vscode.Uri;
	};
}

export interface FileDidDeleteFilesCustomAction extends BaseAction {
	action_id: 'fileDidDeleteFilesCustom';
	event: {
		basicEvent: vscode.Uri;
	};
}

export interface FileDidRenameFilesCustomAction extends BaseAction {
	action_id: 'fileDidRenameFilesCustom';
	event: {
		basicEvent: {
			oldUri: vscode.Uri;
			newUri: vscode.Uri;
		};
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
		basicEvent: vscode.TextEditorSelectionChangeEvent;
		selection: readonly vscode.Selection[];
		selectedText: string[];
	};
}

export interface EditorChangeTextEditorVisibleRangesAction extends BaseAction {
	action_id: 'editorDidChangeTextEditorVisibleRanges';
	event: {
		basicEvent: vscode.TextEditorVisibleRangesChangeEvent;
		visibleRange: string[];
	};
}

export interface EditorChangeTextEditorViewColumnAction extends BaseAction {
	action_id: 'editorDidChangeTextEditorViewColumn';
	event: {
		basicEvent: vscode.TextEditorViewColumnChangeEvent;
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
	actionId: T['action_id'],
): action is T {
	return action.action_id === actionId;
}

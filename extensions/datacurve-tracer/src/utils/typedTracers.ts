import * as vscode from 'vscode';
import {
	FileChangeTextDocumentAction,
	FileCreateFilesAction,
	FileDeleteFilesAction,
	FileRenameFilesAction,
	FileOpenTextDocumentAction,
	FileCloseTextDocumentAction,
	FileWillSaveTextDocumentAction,
	FileDidSaveTextDocumentAction,
	EditorChangeActiveTextEditorAction,
	EditorChangeTextEditorSelectionAction,
	EditorChangeTextEditorVisibleRangesAction,
	EditorChangeTextEditorViewColumnAction,
	EditorChangeVisibleTextEditorsAction,
	TerminalBeginShellExecutionAction,
	TerminalEndShellExecutionAction,
	ClipboardCopyAction,
	ThoughtNewThoughtAction,
	UserIdeaAction,
	UserSearchAction,
	FileDidCreateFilesCustomAction,
	FileDidCreateFolderCustomAction,
	FileDidDeleteFilesCustomAction,
	FileDidRenameFilesCustomAction,
	WorkspaceState
} from '../actionTypes';
import { Thought } from '../tracers/thoughtsTracker';
import { fileExplorer } from '../fileExplorer';
import { clipStringToLimits } from './limits';

/**
 * Helper functions for creating properly typed action records
 * These ensure all records conform to the type definitions
 */

// File system tracer actions
export function createFileChangeTextDocumentAction(event: vscode.TextDocumentChangeEvent): FileChangeTextDocumentAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidChangeTextDocument',
		timestamp: Date.now(),
		event: {
			event,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileCreateFilesAction(event: vscode.FileCreateEvent): FileCreateFilesAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidCreateFiles',
		timestamp: Date.now(),
		event: {
			event,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileDeleteFilesAction(event: vscode.FileDeleteEvent): FileDeleteFilesAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidDeleteFiles',
		timestamp: Date.now(),
		event: {
			event,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileRenameFilesAction(event: vscode.FileRenameEvent): FileRenameFilesAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidRenameFiles',
		timestamp: Date.now(),
		event: {
			event,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileOpenTextDocumentAction(document: vscode.TextDocument): FileOpenTextDocumentAction {
	const fsPath = document.uri.fsPath;
	const state = fileExplorer.getState(fsPath);
	return {
		action_id: 'fileDidOpenTextDocument',
		timestamp: Date.now(),
		event: {
			document,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileCloseTextDocumentAction(document: vscode.TextDocument): FileCloseTextDocumentAction {
	const fsPath = document.uri.fsPath;
	const state = fileExplorer.getState(fsPath);
	return {
		action_id: 'fileDidCloseTextDocument',
		timestamp: Date.now(),
		event: {
			document,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileWillSaveTextDocumentAction(event: vscode.TextDocumentWillSaveEvent): FileWillSaveTextDocumentAction {
	const fileText = clipStringToLimits(event.document.getText());
	return {
		action_id: 'fileWillSaveTextDocument',
		timestamp: Date.now(),
		event: {
			eventSpecs: event,
			document: fileText
		}
	};
}

export function createFileDidSaveTextDocumentAction(document: vscode.TextDocument): FileDidSaveTextDocumentAction {
	const afterText = clipStringToLimits(document.getText());
	return {
		action_id: 'fileDidSaveTextDocument',
		timestamp: Date.now(),
		event: {
			document,
			diff: afterText
		}
	};
}

// Custom file actions
export function createFileDidCreateFilesCustomAction(uri: vscode.Uri): FileDidCreateFilesCustomAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidCreateFilesCustom',
		timestamp: Date.now(),
		event: {
			event: uri,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileDidCreateFolderCustomAction(uri: vscode.Uri): FileDidCreateFolderCustomAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidCreateFolderCustom',
		timestamp: Date.now(),
		event: {
			event: uri,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileDidDeleteFilesCustomAction(uri: vscode.Uri): FileDidDeleteFilesCustomAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidDeleteFilesCustom',
		timestamp: Date.now(),
		event: {
			event: uri,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createFileDidRenameFilesCustomAction(oldUri: vscode.Uri, newUri: vscode.Uri): FileDidRenameFilesCustomAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'fileDidRenameFilesCustom',
		timestamp: Date.now(),
		event: {
			event: {
				oldUri,
				newUri
			},
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

// Editor tracer actions
export function createEditorChangeActiveTextEditorAction(editor: vscode.TextEditor | undefined): EditorChangeActiveTextEditorAction {
	return {
		action_id: 'editorDidChangeActiveTextEditor',
		timestamp: Date.now(),
		event: {
			editor
		}
	};
}

export function createEditorChangeTextEditorSelectionAction(
	event: vscode.TextEditorSelectionChangeEvent,
	selection: readonly vscode.Selection[],
	selectedText: string[]
): EditorChangeTextEditorSelectionAction {
	const state = fileExplorer.getState();
	return {
		action_id: 'editorDidChangeTextEditorSelection',
		timestamp: Date.now(),
		event: {
			event,
			selection,
			selectedText,
			workspace: state.workspaceState as unknown as WorkspaceState
		}
	};
}

export function createEditorChangeTextEditorVisibleRangesAction(
	event: vscode.TextEditorVisibleRangesChangeEvent,
	visibleRange: string[]
): EditorChangeTextEditorVisibleRangesAction {
	return {
		action_id: 'editorDidChangeTextEditorVisibleRanges',
		timestamp: Date.now(),
		event: {
			event,
			visibleRange
		}
	};
}

export function createEditorChangeTextEditorViewColumnAction(
	event: vscode.TextEditorViewColumnChangeEvent
): EditorChangeTextEditorViewColumnAction {
	return {
		action_id: 'editorDidChangeTextEditorViewColumn',
		timestamp: Date.now(),
		event: {
			event
		}
	};
}

export function createEditorChangeVisibleTextEditorsAction(
	editors: readonly vscode.TextEditor[]
): EditorChangeVisibleTextEditorsAction {
	return {
		action_id: 'editorDidChangeVisibleTextEditors',
		timestamp: Date.now(),
		event: {
			editors
		}
	};
}

// Terminal tracer actions
export function createTerminalBeginShellExecutionAction(
	details: vscode.TerminalShellExecutionStartEvent,
	buffer: string
): TerminalBeginShellExecutionAction {
	return {
		action_id: 'terminalBeginShellExecution',
		timestamp: Date.now(),
		event: {
			details,
			buffer
		}
	};
}

export function createTerminalEndShellExecutionAction(
	details: vscode.TerminalShellExecutionEndEvent,
	buffer: string
): TerminalEndShellExecutionAction {
	return {
		action_id: 'terminalEndShellExecution',
		timestamp: Date.now(),
		event: {
			details,
			buffer
		}
	};
}

// Clipboard tracer actions
export function createClipboardCopyAction(text: string): ClipboardCopyAction {
	return {
		action_id: 'clipboardDidCopy',
		timestamp: Date.now(),
		event: {
			text
		}
	};
}

// Thoughts tracer actions
export function createThoughtNewThoughtAction(thought: Thought): ThoughtNewThoughtAction {
	return {
		action_id: 'thoughts.newThought',
		timestamp: Date.now(),
		event: {
			thought
		}
	};
}

// User actions
export function createUserIdeaAction(idea: string): UserIdeaAction {
	return {
		action_id: 'idea',
		timestamp: Date.now(),
		event: {
			idea
		}
	};
}

export function createUserSearchAction(idea: string): UserSearchAction {
	return {
		action_id: 'search',
		timestamp: Date.now(),
		event: {
			idea
		}
	};
}

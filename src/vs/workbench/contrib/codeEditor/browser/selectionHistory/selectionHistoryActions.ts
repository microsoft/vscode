/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Action classes for selection history navigation commands.
 * Provides Previous/Next navigation, Clear history, and Show history actions.
 */

import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISelectionHistoryService, SelectionHistoryEntry } from './selectionHistoryService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextEditorSelectionRevealType } from '../../../../../platform/editor/common/editor.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { basename } from '../../../../../base/common/path.js';
import { Action } from '../../../../../base/common/actions.js';
import { localize, localize2 } from '../../../../../nls.js';

/**
 * Shared helper to navigate to a selection history entry.
 * Opens the file and reveals the selection.
 */
async function navigateToEntry(entry: SelectionHistoryEntry, accessor: ServicesAccessor): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const notificationService = accessor.get(INotificationService);
	const logService = accessor.get(ILogService);
	const selectionHistoryService = accessor.get(ISelectionHistoryService);
	const codeEditorService = accessor.get(ICodeEditorService);

	try {
		// Validate file and range
		const validation = await validateFileAndRange(entry, accessor);
		if (!validation.valid) {
			const fileName = basename(entry.fileUri);
			if (validation.reason === 'file_not_found') {
				// Create notification with "Remove Entry" action
				const removeAction = new Action(
					'selectionHistory.removeEntry',
					localize('selectionHistory.removeEntry', 'Remove Entry'),
					undefined,
					true,
					async () => {
						selectionHistoryService.removeEntry(entry.id);
					}
				);

				notificationService.notify({
					severity: Severity.Warning,
					message: localize('selectionHistory.fileNotFound', 'File no longer exists: {0}. Selection history entry removed.', fileName),
					actions: {
						primary: [removeAction]
					}
				});
				return;
			} else if (validation.reason === 'range_invalid') {
				// Best-effort navigation to start line
				notificationService.info(localize('selectionHistory.rangeChanged', 'Selection range changed in {0} (line {1}): file was edited. Navigating to start line.', fileName, entry.startLine));
				// Continue with navigation (best effort)
			} else if (validation.reason === 'validation_error') {
				// Create notification with "Remove Entry" and "Retry Navigation" actions
				const removeAction = new Action(
					'selectionHistory.removeEntry',
					localize('selectionHistory.removeEntry', 'Remove Entry'),
					undefined,
					true,
					async () => {
						selectionHistoryService.removeEntry(entry.id);
					}
				);

				const retryAction = new Action(
					'selectionHistory.retryNavigation',
					localize('selectionHistory.retryNavigation', 'Retry Navigation'),
					undefined,
					true,
					async () => {
						// Retry navigation
						await navigateToEntry(entry, accessor);
					}
				);

				notificationService.notify({
					severity: Severity.Warning,
					message: localize('selectionHistory.validationError', 'Error validating selection history entry for {0}. Entry may be invalid.', fileName),
					actions: {
						primary: [retryAction, removeAction]
					}
				});
				return;
			}
		}

		// Handle renamed/moved file
		let uri = URI.parse(entry.fileUri);
		if (validation.reason === 'file_moved' && validation.newUri) {
			// File was renamed/moved - update entry URI
			const oldPath = uri.fsPath || uri.toString();
			const newPath = validation.newUri.fsPath || validation.newUri.toString();

			// Update entry URI in service
			selectionHistoryService.updateEntryUri(entry.id, validation.newUri.toString());

			// Show notification
			notificationService.info(localize('selectionHistory.fileMoved', 'Selection history entry updated: file was moved from {0} to {1}', basename(oldPath), basename(newPath)));

			// Use new URI for navigation
			uri = validation.newUri;
		}

		// Create range from entry data
		const range = new Range(
			entry.startLine,
			entry.startColumn,
			entry.endLine,
			entry.endColumn
		);

		// Open editor with selection
		await editorService.openEditor({
			resource: uri,
			options: {
				selection: range,
				selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
				revealIfOpened: true
			}
		});

		// Get editor and reveal selection (additional reveal for better UX)
		const editor = codeEditorService.getActiveCodeEditor();
		if (editor) {
			editor.revealRangeInCenter(range);
		}
	} catch (error) {
		const fileName = basename(entry.fileUri);
		logService.error('[SelectionHistory] Error navigating to selection', error);

		// Provide more specific error messages based on error type
		let errorMessage: string;
		if (error instanceof Error) {
			if (error.message.includes('permission') || error.message.includes('Permission')) {
				errorMessage = localize('selectionHistory.navigationErrorPermission', 'Permission denied: Cannot open {0}. Check file permissions.', fileName);
			} else if (error.message.includes('network') || error.message.includes('Network')) {
				errorMessage = localize('selectionHistory.navigationErrorNetwork', 'Network error: Cannot open {0}. Check network connection.', fileName);
			} else {
				errorMessage = localize('selectionHistory.navigationError', 'Error navigating to selection in {0}: {1}', fileName, error.message);
			}
		} else {
			errorMessage = localize('selectionHistory.navigationErrorGeneric', 'Error navigating to selection in {0}.', fileName);
		}

		// Create notification with "Retry Navigation" and "Remove Entry" actions
		const retryAction = new Action(
			'selectionHistory.retryNavigation',
			localize('selectionHistory.retryNavigation', 'Retry Navigation'),
			undefined,
			true,
			async () => {
				// Retry navigation
				await navigateToEntry(entry, accessor);
			}
		);

		const removeAction = new Action(
			'selectionHistory.removeEntry',
			localize('selectionHistory.removeEntry', 'Remove Entry'),
			undefined,
			true,
			async () => {
				selectionHistoryService.removeEntry(entry.id);
			}
		);

		notificationService.notify({
			severity: Severity.Error,
			message: errorMessage,
			actions: {
				primary: [retryAction, removeAction]
			}
		});
	}
}

/**
 * Finds a file by name in workspace folders.
 * Searches for files with matching basename in workspace folders.
 * Returns the first match found, or undefined if not found.
 * 
 * This is used to detect renamed/moved files when the original file path no longer exists.
 * The search is limited to avoid performance issues.
 */
async function findFileByName(fileName: string, workspaceFolders: readonly { uri: URI }[], fileService: IFileService, logService: ILogService): Promise<URI | undefined> {
	const targetBasename = basename(fileName);

	// Search in each workspace folder
	for (const folder of workspaceFolders) {
		try {
			// Simple recursive search with depth limit to avoid performance issues
			const found = await searchFileInFolder(folder.uri, targetBasename, fileService, 0, 3); // Max depth 3
			if (found) {
				return found;
			}
		} catch (error) {
			logService.debug(`[SelectionHistory] Error searching for file ${fileName} in folder ${folder.uri}:`, error);
		}
	}

	return undefined;
}

/**
 * Recursively searches for a file by basename in a folder.
 * Limits depth to avoid performance issues.
 */
async function searchFileInFolder(folder: URI, targetBasename: string, fileService: IFileService, currentDepth: number, maxDepth: number): Promise<URI | undefined> {
	if (currentDepth >= maxDepth) {
		return undefined;
	}

	try {
		const stat = await fileService.resolve(folder);
		if (!stat.isDirectory) {
			return undefined;
		}

		// Check files in current directory
		if (stat.children) {
			for (const child of stat.children) {
				if (child.isFile && basename(child.resource.fsPath) === targetBasename) {
					return child.resource;
				}
			}

			// Recursively search subdirectories
			for (const child of stat.children) {
				if (child.isDirectory) {
					const found = await searchFileInFolder(child.resource, targetBasename, fileService, currentDepth + 1, maxDepth);
					if (found) {
						return found;
					}
				}
			}
		}
	} catch (error) {
		// Ignore errors (permission denied, etc.)
	}

	return undefined;
}

/**
 * Validates that the file exists and the range is valid.
 * If the file doesn't exist, attempts to find it by name in the workspace (renamed file detection).
 */
async function validateFileAndRange(entry: SelectionHistoryEntry, accessor: ServicesAccessor): Promise<{ valid: boolean; reason?: string; newUri?: URI }> {
	const fileService = accessor.get(IFileService);
	const logService = accessor.get(ILogService);
	const workspaceContextService = accessor.get(IWorkspaceContextService);

	try {
		const uri = URI.parse(entry.fileUri);

		// Check file existence
		const exists = await fileService.exists(uri);
		if (!exists) {
			// File not found - attempt to find by name in workspace (renamed file detection)
			const workspace = workspaceContextService.getWorkspace();
			if (workspace.folders.length > 0) {
				const foundUri = await findFileByName(entry.fileUri, workspace.folders, fileService, logService);
				if (foundUri) {
					// File found with different path - it was renamed/moved
					logService.debug(`[SelectionHistory] File renamed/moved: ${entry.fileUri} -> ${foundUri.toString()}`);
					return { valid: true, reason: 'file_moved', newUri: foundUri };
				}
			}
			return { valid: false, reason: 'file_not_found' };
		}

		// Basic range validation (logical)
		if (entry.startLine > entry.endLine ||
			entry.startLine < 1 ||
			entry.startColumn < 1 ||
			entry.endColumn < 1) {
			return { valid: false, reason: 'range_invalid' };
		}

		// Note: Full range validation (checking file line count) would require reading the file,
		// which is expensive. We do best-effort validation here and handle errors during navigation.

		return { valid: true };
	} catch (error) {
		logService.error('[SelectionHistory] Error validating file and range', error);
		return { valid: false, reason: 'validation_error' };
	}
}

/**
 * Action to navigate to the previous selection in history.
 * Keyboard shortcut: Ctrl+Shift+Up
 */
export class GoToPreviousSelectionAction extends Action2 {
	static readonly ID = 'workbench.action.selectionHistory.previous';

	constructor() {
		super({
			id: GoToPreviousSelectionAction.ID,
			title: localize2('selectionHistory.previous', 'Go to Previous Selection'),
			category: localize2('selectionHistory.category', 'Selection History'),
			f1: true, // Show in command palette
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
				when: ContextKeyExpr.equals('editorTextFocus', true)
			}
		});
	}

	/**
	 * Navigates to the previous selection in history (older entry).
	 * Does nothing if already at the oldest entry.
	 */
	async run(accessor: ServicesAccessor): Promise<void> {
		const selectionHistoryService = accessor.get(ISelectionHistoryService);
		const logService = accessor.get(ILogService);

		const history = selectionHistoryService.getHistory();
		const position = selectionHistoryService.getCurrentPosition();

		// Check if we can navigate previous (position < history.length - 1)
		if (position >= history.length - 1) {
			// Already at oldest entry, no-op
			return;
		}

		// Increment position before navigation
		const newPosition = position + 1;
		selectionHistoryService.setCurrentPosition(newPosition);

		// Get entry at new position
		const entry = history[newPosition];
		if (!entry) {
			logService.warn('[SelectionHistory] Entry not found at position', newPosition);
			return;
		}

		// Navigate to entry
		await navigateToEntry(entry, accessor);
	}
}

/**
 * Action to navigate to the next selection in history.
 * Keyboard shortcut: Ctrl+Shift+Down
 */
export class GoToNextSelectionAction extends Action2 {
	static readonly ID = 'workbench.action.selectionHistory.next';

	constructor() {
		super({
			id: GoToNextSelectionAction.ID,
			title: localize2('selectionHistory.next', 'Go to Next Selection'),
			category: localize2('selectionHistory.category', 'Selection History'),
			f1: true, // Show in command palette
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
				when: ContextKeyExpr.equals('editorTextFocus', true)
			}
		});
	}

	/**
	 * Navigates to the next selection in history (newer entry).
	 * Does nothing if already at the newest entry.
	 */
	async run(accessor: ServicesAccessor): Promise<void> {
		const selectionHistoryService = accessor.get(ISelectionHistoryService);
		const logService = accessor.get(ILogService);

		const history = selectionHistoryService.getHistory();
		const position = selectionHistoryService.getCurrentPosition();

		// Check if we can navigate next (position > 0)
		if (position <= 0) {
			// Already at newest entry, no-op
			return;
		}

		// Decrement position before navigation
		const newPosition = position - 1;
		selectionHistoryService.setCurrentPosition(newPosition);

		// Get entry at new position
		const entry = history[newPosition];
		if (!entry) {
			logService.warn('[SelectionHistory] Entry not found at position', newPosition);
			return;
		}

		// Navigate to entry
		await navigateToEntry(entry, accessor);
	}
}

/**
 * Action to clear all selection history entries.
 * Shows a confirmation dialog before clearing.
 */
export class ClearSelectionHistoryAction extends Action2 {
	static readonly ID = 'workbench.action.selectionHistory.clear';

	constructor() {
		super({
			id: ClearSelectionHistoryAction.ID,
			title: localize2('selectionHistory.clear', 'Clear Selection History'),
			category: localize2('selectionHistory.category', 'Selection History'),
			f1: true // Show in command palette
		});
	}

	/**
	 * Clears all selection history entries after user confirmation.
	 * Shows a confirmation dialog before clearing.
	 */
	async run(accessor: ServicesAccessor): Promise<void> {
		const selectionHistoryService = accessor.get(ISelectionHistoryService);
		const dialogService = accessor.get(IDialogService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		try {
			// Show confirmation dialog
			const result = await dialogService.confirm({
				message: localize('selectionHistory.clearConfirm', 'Are you sure you want to clear selection history?'),
				type: 'question',
				primaryButton: localize('yes', 'Yes'),
				cancelButton: localize('no', 'No')
			});

			if (result.confirmed) {
				// Clear history
				selectionHistoryService.clearHistory();
				notificationService.info(localize('selectionHistory.cleared', 'Selection history cleared'));
			}
		} catch (error) {
			logService.error('[SelectionHistory] Error clearing history', error);
			notificationService.error(localize('selectionHistory.clearError', 'Error clearing selection history'));
		}
	}
}

/**
 * Action to show selection history in Quick Access panel.
 * Opens Quick Access with @ prefix to browse selection history.
 * 
 * Context menu integration: This action appears in the editor context menu
 * when a selection exists (editorHasSelection context key is true).
 * The menu item is placed in the 'navigation' group after existing navigation items.
 */
export class ShowSelectionHistoryAction extends Action2 {
	static readonly ID = 'workbench.action.selectionHistory.show';

	constructor() {
		super({
			id: ShowSelectionHistoryAction.ID,
			title: localize2('selectionHistory.show', 'Show Selection History'),
			category: localize2('selectionHistory.category', 'Selection History'),
			f1: true, // Show in command palette
			menu: {
				id: MenuId.EditorContext,
				group: 'navigation',
				order: 10,
				when: EditorContextKeys.hasNonEmptySelection
			}
		});
	}

	/**
	 * Opens the Quick Access panel with selection history.
	 * Uses the '@' prefix to show selection history entries.
	 */
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.quickAccess.show('@');
	}
}


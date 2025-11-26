/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { basename } from '../../../../../base/common/path.js';
import * as nls from '../../../../../nls.js';

/**
 * Represents a single entry in the selection history.
 */
export interface SelectionHistoryEntry {
	/** Unique identifier (UUID) */
	id: string;
	/** Selected text (max 2000 chars) */
	text: string;
	/** File URI */
	fileUri: string;
	/** Start line (1-based) */
	startLine: number;
	/** Start column (1-based) */
	startColumn: number;
	/** End line (1-based) */
	endLine: number;
	/** End column (1-based) */
	endColumn: number;
	/** Unix timestamp */
	timestamp: number;
}

/**
 * Service interface for managing selection history.
 * 
 * The selection history service tracks user-initiated text selections across all code editors
 * and provides navigation capabilities. History is persisted across VS Code sessions using
 * workspace-scoped storage.
 * 
 * Key features:
 * - Automatic selection tracking with debouncing (250ms)
 * - History management (add, remove, clear, validate)
 * - Navigation position tracking
 * - File validation and renamed file detection
 * - Storage error handling with in-memory fallback
 * - Batch validation for performance
 */
export const ISelectionHistoryService = createDecorator<ISelectionHistoryService>('ISelectionHistoryService');

export interface ISelectionHistoryService {
	readonly _serviceBrand: undefined;

	/**
	 * Adds a new entry to the selection history.
	 * New entries are added at the beginning (newest first).
	 * If history size limit is reached, oldest entry is removed (FIFO).
	 * Navigation position is reset to 0 on new selection.
	 */
	addEntry(entry: SelectionHistoryEntry): void;

	/**
	 * Returns all history entries in order (newest first).
	 * Returns a copy of the internal array to prevent external modification.
	 */
	getHistory(): SelectionHistoryEntry[];

	/**
	 * Clears all history entries and resets navigation position.
	 */
	clearHistory(): void;

	/**
	 * Removes a specific entry by ID.
	 * Navigation position is adjusted if the removed entry was before the current position.
	 */
	removeEntry(id: string): void;

	/**
	 * Updates the file URI of a specific entry by ID.
	 * Used when a file is renamed/moved and the new location is found.
	 * 
	 * @param id - The entry ID to update
	 * @param newUri - The new file URI (as string)
	 * 
	 * This method is called automatically when renamed file detection finds a moved file.
	 * The entry is updated in-place and the history is persisted to storage.
	 */
	updateEntryUri(id: string, newUri: string): void;

	/**
	 * Validates all entries and removes invalid ones (deleted files, untitled files, etc.).
	 * This is called automatically on service initialization.
	 */
	validateEntries(): Promise<void>;

	/**
	 * Validates all entries and returns valid and invalid entries separately.
	 * This is used for batch validation and can handle renamed files.
	 * Invalid entries are automatically removed from history.
	 * 
	 * Performance: Uses parallel validation for better performance with large histories.
	 * Renamed files are automatically detected and entry URIs are updated.
	 * 
	 * @returns Promise resolving to object with valid and invalid entry arrays
	 * 
	 * Example:
	 * ```typescript
	 * const { valid, invalid } = await service.validateAllEntries();
	 * console.log(`Found ${valid.length} valid and ${invalid.length} invalid entries`);
	 * ```
	 */
	validateAllEntries(): Promise<{ valid: SelectionHistoryEntry[]; invalid: SelectionHistoryEntry[] }>;

	/**
	 * Gets the current navigation position (0 = newest entry, increments for older entries).
	 * Returns -1 if no history exists.
	 */
	getCurrentPosition(): number;

	/**
	 * Sets the current navigation position.
	 * Position must be >= 0 and < history length.
	 */
	setCurrentPosition(position: number): void;
}

/**
 * Storage format for selection history.
 */
interface SelectionHistoryStorage {
	version: number;
	entries: SelectionHistoryEntry[];
}

export class SelectionHistoryService extends Disposable implements ISelectionHistoryService {

	declare readonly _serviceBrand: undefined;

	private readonly _entries: SelectionHistoryEntry[] = [];
	private _currentPosition: number = 0;
	private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
	private _pendingSelection: { editor: ICodeEditor; selection: Selection } | undefined;
	private readonly _editorDisposables: Map<ICodeEditor, IDisposable[]> = new Map();
	private readonly _storageKey: string = 'workbench.selectionHistory.entries';
	private readonly _storageVersion: number = 1;
	private readonly _maxHistorySize: number = 50;
	private readonly _maxTextLength: number = 2000;
	private readonly _debounceDelay: number = 250;
	private _initialized: boolean = false;
	private _storageAvailable: boolean = true;
	private _storageFallbackNotified: boolean = false;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IStorageService private readonly _storageService: IStorageService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();
	}

	/**
	 * Initializes the service by loading history from storage and setting up editor tracking.
	 * This is called lazily on first service access.
	 */
	private async initialize(): Promise<void> {
		if (this._initialized) {
			return;
		}
		this._initialized = true;

		// Load history from storage
		this._loadHistory();

		// Track existing editors
		const existingEditors = this._codeEditorService.listCodeEditors();
		for (const editor of existingEditors) {
			this._trackEditor(editor);
		}

		// Track new editors
		this._register(this._codeEditorService.onCodeEditorAdd(editor => {
			this._trackEditor(editor);
		}));

		// Untrack removed editors
		this._register(this._codeEditorService.onCodeEditorRemove(editor => {
			this._untrackEditor(editor);
		}));

		// Validate entries after initialization
		await this.validateEntries();
	}

	/**
	 * Ensures the service is initialized before performing operations.
	 */
	private _ensureInitialized(): void {
		if (!this._initialized) {
			// Initialize synchronously for now - can be made async if needed
			this.initialize().catch(err => {
				this._logService.error('[SelectionHistory] Failed to initialize:', err);
			});
		}
	}

	addEntry(entry: SelectionHistoryEntry): void {
		this._ensureInitialized();

		// Validate entry structure
		if (!this._validateEntryStructure(entry)) {
			this._logService.warn('[SelectionHistory] Invalid entry structure, skipping:', entry);
			return;
		}

		// Add to beginning (newest first)
		this._entries.unshift(entry);

		// Enforce history size limit (FIFO - remove oldest)
		if (this._entries.length > this._maxHistorySize) {
			this._entries.pop();
		}

		// Reset navigation position to 0 (newest)
		this._currentPosition = 0;

		// Persist to storage
		this._saveHistory();
	}

	getHistory(): SelectionHistoryEntry[] {
		this._ensureInitialized();
		// Return copy to prevent external modification
		return [...this._entries];
	}

	clearHistory(): void {
		this._ensureInitialized();
		this._entries.length = 0;
		this._currentPosition = 0;
		this._saveHistory();
		this._logService.debug('[SelectionHistory] History cleared');
	}

	removeEntry(id: string): void {
		this._ensureInitialized();
		const index = this._entries.findIndex(e => e.id === id);
		if (index === -1) {
			this._logService.debug(`[SelectionHistory] Entry not found: ${id}`);
			return;
		}

		// Remove entry
		this._entries.splice(index, 1);

		// Adjust navigation position
		if (index < this._currentPosition) {
			// Removed entry was before current position, decrement position
			this._currentPosition--;
		}
		// If removed entry was at current position, keep position (next entry moves into position)
		// If removed entry was after current position, no change needed

		// Persist to storage
		this._saveHistory();
	}

	updateEntryUri(id: string, newUri: string): void {
		this._ensureInitialized();
		const entry = this._entries.find(e => e.id === id);
		if (!entry) {
			this._logService.debug(`[SelectionHistory] Entry not found for URI update: ${id}`);
			return;
		}

		// Update entry URI
		entry.fileUri = newUri;

		// Persist to storage
		this._saveHistory();
		this._logService.debug(`[SelectionHistory] Updated entry URI: ${id} -> ${newUri}`);
	}

	async validateEntries(): Promise<void> {
		this._ensureInitialized();
		let removedCount = 0;

		for (let i = this._entries.length - 1; i >= 0; i--) {
			const entry = this._entries[i];
			let shouldRemove = false;

			// Check if untitled file (don't persist across sessions)
			if (entry.fileUri.startsWith('untitled:')) {
				shouldRemove = true;
				this._logService.debug(`[SelectionHistory] Removing untitled file entry: ${entry.id}`);
			} else {
				// Check file existence
				try {
					const uri = URI.parse(entry.fileUri);
					const exists = await this._fileService.exists(uri);
					if (!exists) {
						shouldRemove = true;
						this._logService.debug(`[SelectionHistory] Removing entry for deleted file: ${entry.id}`);
					}
				} catch (error) {
					// Invalid URI or file service error - remove entry
					shouldRemove = true;
					this._logService.debug(`[SelectionHistory] Error checking file existence for entry ${entry.id}:`, error);
				}
			}

			if (shouldRemove) {
				this._entries.splice(i, 1);
				removedCount++;

				// Adjust navigation position if needed
				if (i < this._currentPosition) {
					this._currentPosition--;
				}
			}
		}

		if (removedCount > 0) {
			this._logService.debug(`[SelectionHistory] Removed ${removedCount} invalid entries`);
			this._saveHistory();
		}
	}

	/**
	 * Recursively searches for a file by basename in a folder.
	 * Limits depth to avoid performance issues.
	 */
	private async _searchFileInFolder(folder: URI, targetBasename: string, currentDepth: number, maxDepth: number): Promise<URI | undefined> {
		if (currentDepth >= maxDepth) {
			return undefined;
		}

		try {
			const stat = await this._fileService.resolve(folder);
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
						const found = await this._searchFileInFolder(child.resource, targetBasename, currentDepth + 1, maxDepth);
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
	 * Finds a file by name in workspace folders.
	 */
	private async _findFileByName(fileName: string): Promise<URI | undefined> {
		const targetBasename = basename(fileName);
		const workspace = this._workspaceContextService.getWorkspace();

		// Search in each workspace folder
		for (const folder of workspace.folders) {
			try {
				const found = await this._searchFileInFolder(folder.uri, targetBasename, 0, 3); // Max depth 3
				if (found) {
					return found;
				}
			} catch (error) {
				this._logService.debug(`[SelectionHistory] Error searching for file ${fileName} in folder ${folder.uri}:`, error);
			}
		}

		return undefined;
	}

	async validateAllEntries(): Promise<{ valid: SelectionHistoryEntry[]; invalid: SelectionHistoryEntry[] }> {
		this._ensureInitialized();
		const valid: SelectionHistoryEntry[] = [];
		const invalid: SelectionHistoryEntry[] = [];

		// Batch file existence checks for better performance
		const validationPromises = this._entries.map(async (entry) => {
			// Check if untitled file (don't persist across sessions)
			if (entry.fileUri.startsWith('untitled:')) {
				return { entry, valid: false, reason: 'untitled' };
			}

			// Check file existence
			try {
				const uri = URI.parse(entry.fileUri);
				const exists = await this._fileService.exists(uri);
				if (!exists) {
					// File not found - attempt to find by name in workspace (renamed file detection)
					const workspace = this._workspaceContextService.getWorkspace();
					if (workspace.folders.length > 0) {
						const foundUri = await this._findFileByName(entry.fileUri);
						if (foundUri) {
							// File found with different path - it was renamed/moved
							this._logService.debug(`[SelectionHistory] File renamed/moved during batch validation: ${entry.fileUri} -> ${foundUri.toString()}`);
							// Update entry URI
							entry.fileUri = foundUri.toString();
							return { entry, valid: true, reason: 'renamed' };
						}
					}
					return { entry, valid: false, reason: 'file_not_found' };
				}

				// Basic range validation (logical)
				if (entry.startLine > entry.endLine ||
					entry.startLine < 1 ||
					entry.startColumn < 1 ||
					entry.endColumn < 1) {
					return { entry, valid: false, reason: 'range_invalid' };
				}

				return { entry, valid: true };
			} catch (error) {
				// Invalid URI or file service error
				this._logService.debug(`[SelectionHistory] Error validating entry ${entry.id}:`, error);
				return { entry, valid: false, reason: 'validation_error' };
			}
		});

		// Wait for all validations to complete
		const results = await Promise.all(validationPromises);

		// Separate valid and invalid entries
		for (const result of results) {
			if (result.valid) {
				valid.push(result.entry);
			} else {
				invalid.push(result.entry);
			}
		}

		// Remove invalid entries from history
		if (invalid.length > 0) {
			const invalidIds = new Set(invalid.map(e => e.id));
			for (let i = this._entries.length - 1; i >= 0; i--) {
				if (invalidIds.has(this._entries[i].id)) {
					// Adjust navigation position if needed
					if (i < this._currentPosition) {
						this._currentPosition--;
					}
					this._entries.splice(i, 1);
				}
			}
			this._saveHistory();
			this._logService.debug(`[SelectionHistory] Batch validation: ${valid.length} valid, ${invalid.length} invalid entries`);
		}

		return { valid, invalid };
	}

	getCurrentPosition(): number {
		this._ensureInitialized();
		if (this._entries.length === 0) {
			return -1;
		}
		return this._currentPosition;
	}

	setCurrentPosition(position: number): void {
		this._ensureInitialized();
		if (position < 0 || position >= this._entries.length) {
			this._logService.debug(`[SelectionHistory] Invalid position: ${position}, history length: ${this._entries.length}`);
			return;
		}
		this._currentPosition = position;
	}

	/**
	 * Tracks selection changes for a specific editor.
	 */
	private _trackEditor(editor: ICodeEditor): void {
		if (this._editorDisposables.has(editor)) {
			// Already tracking this editor
			return;
		}

		const disposables: IDisposable[] = [];

		// Listen to selection changes
		disposables.push(editor.onDidChangeCursorSelection(e => {
			// Filter by selection source (exclude programmatic selections)
			if (e.source === 'api') {
				// Skip programmatic selections
				return;
			}

			// Filter non-empty selections
			if (!e.selection || e.selection.isEmpty()) {
				return;
			}

			// Debounce selection recording
			this._debounceSelection(editor, e.selection);
		}));

		this._editorDisposables.set(editor, disposables);
	}

	/**
	 * Stops tracking selection changes for a specific editor.
	 */
	private _untrackEditor(editor: ICodeEditor): void {
		// Flush pending selection for this editor
		if (this._pendingSelection && this._pendingSelection.editor === editor) {
			this._flushPendingSelection();
		}

		const disposables = this._editorDisposables.get(editor);
		if (disposables) {
			for (const disposable of disposables) {
				disposable.dispose();
			}
			this._editorDisposables.delete(editor);
		}
	}

	/**
	 * Debounces selection recording to prevent flooding history with rapid changes.
	 */
	private _debounceSelection(editor: ICodeEditor, selection: Selection): void {
		// Store pending selection
		this._pendingSelection = { editor, selection };

		// Clear existing timer
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}

		// Set new timer
		this._debounceTimer = setTimeout(() => {
			this._recordSelection(editor, selection);
			this._pendingSelection = undefined;
			this._debounceTimer = undefined;
		}, this._debounceDelay);
	}

	/**
	 * Records a selection to history.
	 */
	private _recordSelection(editor: ICodeEditor, selection: Selection): void {
		const model = editor.getModel();
		if (!model) {
			// Editor model not available
			return;
		}

		// Extract text
		let text = model.getValueInRange(selection);
		if (!text || text.length === 0) {
			// Empty selection (should not reach here due to filtering, but safety check)
			return;
		}

		// Truncate if too long
		if (text.length > this._maxTextLength) {
			text = `...${text.slice(-1997)}`;
			this._logService.debug('[SelectionHistory] Text truncated to 2000 chars');
		}

		// Extract metadata
		const fileUri = model.uri.toString();
		const startLine = selection.startLineNumber;
		const startColumn = selection.startColumn;
		const endLine = selection.endLineNumber;
		const endColumn = selection.endColumn;
		const timestamp = Date.now();

		// Skip untitled files (they don't persist across sessions)
		if (fileUri.startsWith('untitled:')) {
			return;
		}

		// Create entry
		const entry: SelectionHistoryEntry = {
			id: generateUuid(),
			text,
			fileUri,
			startLine,
			startColumn,
			endLine,
			endColumn,
			timestamp
		};

		// Add to history
		this.addEntry(entry);
	}

	/**
	 * Flushes the pending debounced selection immediately.
	 */
	private _flushPendingSelection(): void {
		if (this._pendingSelection) {
			this._recordSelection(this._pendingSelection.editor, this._pendingSelection.selection);
			this._pendingSelection = undefined;
		}
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = undefined;
		}
	}

	/**
	 * Loads history from storage.
	 * Handles storage errors gracefully and falls back to empty history if storage is unavailable.
	 */
	private _loadHistory(): void {
		try {
			const stored = this._storageService.get(this._storageKey, StorageScope.WORKSPACE, '');
			if (!stored) {
				// No stored history
				return;
			}

			const data: SelectionHistoryStorage = JSON.parse(stored);

			// Check version
			if (data.version > this._storageVersion) {
				// Future version - clear history and notify
				this._entries.length = 0;
				this._notificationService.info(nls.localize('selectionHistory.futureVersion', 'Selection history format is from a newer version. History cleared.'));
				this._logService.warn('[SelectionHistory] Future version detected, clearing history');
				return;
			}

			if (data.version < this._storageVersion || !data.version) {
				// Old version or missing version - clear history and notify
				this._entries.length = 0;
				this._notificationService.info(nls.localize('selectionHistory.outdatedVersion', 'Selection history format is outdated. History cleared.'));
				this._logService.warn('[SelectionHistory] Outdated version detected, clearing history');
				return;
			}

			// Load entries
			if (Array.isArray(data.entries)) {
				// Validate and filter entries
				const validEntries = data.entries.filter(e => this._validateEntryStructure(e));
				this._entries.push(...validEntries);

				// Sort by timestamp (newest first)
				this._entries.sort((a, b) => b.timestamp - a.timestamp);

				// Reset position
				this._currentPosition = 0;
			}
		} catch (error) {
			// Invalid JSON or other error - clear history
			this._logService.error('[SelectionHistory] Error loading history from storage:', error);
			this._entries.length = 0;

			// Detect if this is a persistent storage error
			const isPermissionError = error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission') || error.message.includes('denied'));
			if (isPermissionError) {
				// Storage may not be available - switch to in-memory mode
				this._storageAvailable = false;
			}
		}
	}

	/**
	 * Saves history to storage.
	 * Implements fallback to in-memory storage if persistent storage fails.
	 * History will persist for current session only if storage is unavailable.
	 */
	private _saveHistory(): void {
		// If storage is not available, skip save (history persists in memory only)
		if (!this._storageAvailable) {
			return;
		}

		try {
			const data: SelectionHistoryStorage = {
				version: this._storageVersion,
				entries: this._entries
			};

			const jsonString = JSON.stringify(data);
			this._storageService.store(this._storageKey, jsonString, StorageScope.WORKSPACE, StorageTarget.USER);
		} catch (error) {
			// Storage error detected - switch to in-memory storage
			this._logService.error('[SelectionHistory] Error saving history to storage:', error);

			// Detect error type
			const isQuotaExceeded = error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('quota') || error.message.includes('Quota'));
			const isPermissionError = error instanceof Error && (error.message.includes('permission') || error.message.includes('Permission') || error.message.includes('denied'));

			// Switch to in-memory storage
			this._storageAvailable = false;

			// Show notification (only once to avoid spam)
			if (!this._storageFallbackNotified) {
				this._storageFallbackNotified = true;
				if (isQuotaExceeded) {
					this._notificationService.warn(nls.localize('selectionHistory.storageFallbackQuota', 'Warning: Selection history storage quota exceeded. History will not persist across sessions.'));
				} else if (isPermissionError) {
					this._notificationService.warn(nls.localize('selectionHistory.storageFallbackPermission', 'Warning: Cannot save selection history due to permission error. History will not persist across sessions.'));
				} else {
					this._notificationService.warn(nls.localize('selectionHistory.storageFallback', 'Warning: Could not save selection history. History will not persist across sessions.'));
				}
			}

			// Continue working with in-memory storage
			// History persists for current session only
		}
	}

	/**
	 * Validates that an entry has the correct structure.
	 */
	private _validateEntryStructure(entry: unknown): entry is SelectionHistoryEntry {
		if (!entry || typeof entry !== 'object') {
			return false;
		}

		const e = entry as Record<string, unknown>;
		return (
			typeof e.id === 'string' && e.id.length > 0 &&
			typeof e.text === 'string' &&
			typeof e.fileUri === 'string' && e.fileUri.length > 0 &&
			typeof e.startLine === 'number' && e.startLine >= 1 &&
			typeof e.startColumn === 'number' && e.startColumn >= 1 &&
			typeof e.endLine === 'number' && e.endLine >= 1 &&
			typeof e.endColumn === 'number' && e.endColumn >= 1 &&
			typeof e.timestamp === 'number' && e.timestamp > 0
		);
	}

	override dispose(): void {
		// Flush pending selection
		this._flushPendingSelection();

		// Clear debounce timer
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = undefined;
		}

		// Dispose all editor listeners
		for (const [, disposables] of this._editorDisposables) {
			for (const disposable of disposables) {
				disposable.dispose();
			}
		}
		this._editorDisposables.clear();

		// Clear pending selection
		this._pendingSelection = undefined;

		super.dispose();
	}
}


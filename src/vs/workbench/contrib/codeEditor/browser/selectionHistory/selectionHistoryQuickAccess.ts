/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Quick Access provider for browsing and navigating selection history.
 * Provides a searchable interface with filtering and preview capabilities.
 */

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename } from '../../../../../base/common/path.js';
import { matchesFuzzy } from '../../../../../base/common/filters.js';
import { localize } from '../../../../../nls.js';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, Picks } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IQuickAccessProviderRunOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ISelectionHistoryService, SelectionHistoryEntry } from './selectionHistoryService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextEditorSelectionRevealType } from '../../../../../platform/editor/common/editor.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

/**
 * Quick pick item for selection history entries.
 */
export interface ISelectionHistoryQuickPickItem extends IPickerQuickAccessItem {
	/** Reference to the history entry */
	entry: SelectionHistoryEntry;
	/** File icon based on file type */
	fileIcon?: ThemeIcon;
}

/**
 * Quick Access provider for selection history.
 * Allows users to browse and navigate their selection history through a searchable interface.
 */
export class SelectionHistoryQuickAccessProvider extends PickerQuickAccessProvider<ISelectionHistoryQuickPickItem> {

	private readonly _previewCache: Map<string, string> = new Map();
	private readonly _disposables: DisposableStore = new DisposableStore();
	private _lastHistoryLength: number = 0;

	constructor(
		@ISelectionHistoryService private readonly _selectionHistoryService: ISelectionHistoryService,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IModelService private readonly _modelService: IModelService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ILogService private readonly _logService: ILogService
	) {
		const emptyEntry: SelectionHistoryEntry = {
			id: '',
			text: '',
			fileUri: '',
			startLine: 0,
			startColumn: 0,
			endLine: 0,
			endColumn: 0,
			timestamp: 0
		};
		super('@', {
			noResultsPick: {
				label: localize('selectionHistory.noResults', 'No matching selection history entries'),
				entry: emptyEntry
			}
		});
	}

	override dispose(): void {
		this._previewCache.clear();
		this._disposables.dispose();
		super.dispose();
	}

	protected async _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): Promise<Picks<ISelectionHistoryQuickPickItem>> {
		// Check if history has changed and clear cache if needed
		const history = this._selectionHistoryService.getHistory();
		if (history.length !== this._lastHistoryLength) {
			this._previewCache.clear();
			this._lastHistoryLength = history.length;
		}

		// Handle empty history
		if (history.length === 0) {
			const emptyEntry: SelectionHistoryEntry = {
				id: '',
				text: '',
				fileUri: '',
				startLine: 0,
				startColumn: 0,
				endLine: 0,
				endColumn: 0,
				timestamp: 0
			};
			return [{
				label: localize('selectionHistory.empty', 'No selection history entries'),
				entry: emptyEntry
			}];
		}

		// Filter entries based on filter string
		const filteredEntries = filter.trim() === ''
			? history
			: history.filter(entry => this._matchesFilter(entry, filter.trim()));

		// Create quick pick items from filtered entries
		const items = this._createQuickPickItems(filteredEntries);

		// Generate preview text for first few items (lazy-loading)
		if (items.length > 0 && !token.isCancellationRequested) {
			// Generate previews for first 10 items
			const previewPromises = items.slice(0, 10).map(async (item) => {
				if (token.isCancellationRequested) {
					return;
				}

				// Skip if already cached
				if (this._previewCache.has(item.entry.id)) {
					item.description = this._previewCache.get(item.entry.id) || '';
					return;
				}

				try {
					const previewText = await this._generatePreviewText(item.entry);
					if (!token.isCancellationRequested) {
						this._previewCache.set(item.entry.id, previewText);
						item.description = previewText;
					}
				} catch (err) {
					// Error already handled in _generatePreviewText
					if (!token.isCancellationRequested) {
						item.description = this._truncateText(item.entry.text, 200);
					}
				}
			});

			// Wait for first few previews to load (but don't block on all)
			await Promise.all(previewPromises.slice(0, 5));
		}

		return items;
	}

	/**
	 * Creates quick pick items from history entries.
	 */
	private _createQuickPickItems(entries: SelectionHistoryEntry[]): ISelectionHistoryQuickPickItem[] {
		return entries.map(entry => {
			const label = this._formatLabel(entry);
			const detail = this._formatDetail(entry);
			const fileIcon = this._getFileIcon(entry);

			// Get preview text from cache if available, otherwise use empty string (will be lazy-loaded)
			const description = this._previewCache.get(entry.id) || '';

			return {
				label,
				description,
				detail,
				entry,
				fileIcon,
				accept: (keyMods, event) => {
					this._navigateToSelection(entry).catch(err => {
						this._logService.error('[SelectionHistory] Error navigating to selection', err);
						this._notificationService.error(localize('selectionHistory.navigationError', 'Error navigating to selection'));
					});
				}
			};
		});
	}

	/**
	 * Formats the label for a history entry.
	 * Format: "filename:line" for single line or "filename:startLine-endLine" for multi-line.
	 */
	private _formatLabel(entry: SelectionHistoryEntry): string {
		const uri = URI.parse(entry.fileUri);
		const fileName = basename(uri.fsPath);

		if (entry.startLine === entry.endLine) {
			return `${fileName}:${entry.startLine}`;
		} else {
			return `${fileName}:${entry.startLine}-${entry.endLine}`;
		}
	}

	/**
	 * Formats the detail (relative file path) for a history entry.
	 */
	private _formatDetail(entry: SelectionHistoryEntry): string {
		const uri = URI.parse(entry.fileUri);
		return this._labelService.getUriLabel(uri, { relative: true });
	}

	/**
	 * Gets the file icon for a history entry.
	 * Returns undefined as file icons are handled by the Quick Access UI.
	 */
	private _getFileIcon(entry: SelectionHistoryEntry): ThemeIcon | undefined {
		// File icons are automatically handled by Quick Access based on file extension
		// No need to explicitly return an icon here
		return undefined;
	}

	/**
	 * Generates preview text for a history entry.
	 * Includes 1 line before and 1 line after the selection for context.
	 * Uses caching to avoid regenerating previews.
	 */
	private async _generatePreviewText(entry: SelectionHistoryEntry): Promise<string> {
		// Check cache first
		const cached = this._previewCache.get(entry.id);
		if (cached) {
			return cached;
		}

		try {
			const uri = URI.parse(entry.fileUri);

			// Try to get text model (may not be loaded)
			const model: ITextModel | null = this._modelService.getModel(uri);

			// If model not available, fall back to selection text only
			if (!model || model.isDisposed()) {
				return this._truncateText(entry.text, 200);
			}

			// Read 1 line before selection
			const beforeLine = entry.startLine > 1
				? model.getValueInRange(new Range(entry.startLine - 1, 1, entry.startLine, 1)).trim()
				: '';

			// Read selection text
			const selectionText = model.getValueInRange(
				new Range(entry.startLine, entry.startColumn, entry.endLine, entry.endColumn)
			).trim();

			// Read 1 line after selection
			const afterLine = entry.endLine < model.getLineCount()
				? model.getValueInRange(new Range(entry.endLine + 1, 1, entry.endLine + 2, 1)).trim()
				: '';

			// Combine with context
			const parts: string[] = [];
			if (beforeLine) {
				parts.push(beforeLine);
			}
			parts.push(selectionText);
			if (afterLine) {
				parts.push(afterLine);
			}

			const previewText = parts.join('\n');
			const truncated = this._truncateText(previewText, 200);

			// Cache the result
			this._previewCache.set(entry.id, truncated);
			return truncated;

		} catch (error) {
			// Fall back to selection text only
			this._logService.debug('[SelectionHistory] Error generating preview text', error);
			return this._truncateText(entry.text, 200);
		}
	}

	/**
	 * Truncates text to a maximum length, adding ellipsis if needed.
	 */
	private _truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}
		return text.substring(0, maxLength - 3) + '...';
	}

	/**
	 * Checks if an entry matches the filter string.
	 * Supports filtering by file name, text content, and line numbers.
	 */
	private _matchesFilter(entry: SelectionHistoryEntry, filter: string): boolean {
		if (filter === '') {
			return true;
		}

		// Split filter by spaces (multiple search terms)
		const terms = filter.split(/\s+/).filter(term => term.length > 0);

		// Entry matches if ANY term matches (OR logic)
		for (const term of terms) {
			if (this._matchesFileName(entry, term) ||
				this._matchesTextContent(entry, term) ||
				this._matchesLineNumber(entry, term)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Checks if an entry matches the filter by file name.
	 */
	private _matchesFileName(entry: SelectionHistoryEntry, filter: string): boolean {
		const uri = URI.parse(entry.fileUri);
		const fileName = basename(uri.fsPath);
		return !!matchesFuzzy(filter, fileName, true);
	}

	/**
	 * Checks if an entry matches the filter by text content.
	 */
	private _matchesTextContent(entry: SelectionHistoryEntry, filter: string): boolean {
		return !!matchesFuzzy(filter, entry.text, true);
	}

	/**
	 * Checks if an entry matches the filter by line number.
	 * Supports patterns: "42", "42-45", "42-", "-45"
	 */
	private _matchesLineNumber(entry: SelectionHistoryEntry, filter: string): boolean {
		// Single line: "42"
		const singleLineMatch = /^(\d+)$/.exec(filter);
		if (singleLineMatch) {
			const line = parseInt(singleLineMatch[1], 10);
			return entry.startLine === line || entry.endLine === line;
		}

		// Range: "42-45"
		const rangeMatch = /^(\d+)-(\d+)$/.exec(filter);
		if (rangeMatch) {
			const startLine = parseInt(rangeMatch[1], 10);
			const endLine = parseInt(rangeMatch[2], 10);
			// Check if selection overlaps with range
			return !(entry.endLine < startLine || entry.startLine > endLine);
		}

		// Start only: "42-"
		const startOnlyMatch = /^(\d+)-$/.exec(filter);
		if (startOnlyMatch) {
			const line = parseInt(startOnlyMatch[1], 10);
			return entry.startLine >= line;
		}

		// End only: "-45"
		const endOnlyMatch = /^-(\d+)$/.exec(filter);
		if (endOnlyMatch) {
			const line = parseInt(endOnlyMatch[1], 10);
			return entry.endLine <= line;
		}

		return false;
	}

	/**
	 * Navigates to a selection history entry.
	 * Opens the file and reveals the selection.
	 */
	private async _navigateToSelection(entry: SelectionHistoryEntry): Promise<void> {
		try {
			const uri = URI.parse(entry.fileUri);

			// Validate file exists
			const exists = await this._fileService.exists(uri);
			if (!exists) {
				// Remove invalid entry
				this._selectionHistoryService.removeEntry(entry.id);
				this._notificationService.info(localize('selectionHistory.entryRemoved', 'Selection history entry removed: file no longer exists'));
				return;
			}

			// Create range from entry data
			const range = new Range(
				entry.startLine,
				entry.startColumn,
				entry.endLine,
				entry.endColumn
			);

			// Open editor with selection
			await this._editorService.openEditor({
				resource: uri,
				options: {
					selection: range,
					selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
					revealIfOpened: true
				}
			});

			// Get editor and reveal selection (additional reveal for better UX)
			const editor = this._codeEditorService.getActiveCodeEditor();
			if (editor) {
				editor.revealRangeInCenter(range);
			}

			// Update navigation position to this entry
			const history = this._selectionHistoryService.getHistory();
			const index = history.findIndex(e => e.id === entry.id);
			if (index >= 0) {
				this._selectionHistoryService.setCurrentPosition(index);
			}

		} catch (error) {
			this._logService.error('[SelectionHistory] Error navigating to selection', error);
			this._notificationService.error(localize('selectionHistory.navigationError', 'Error navigating to selection'));
		}
	}
}


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { GridData, ColumnSchema, DataStore, FilterState } from '../../common/dataExplorerTypes.js';
import { SortKey } from '../sortManager.js';
import { HistoryManager } from '../historyManager.js';
import { ClipboardManager } from '../clipboardManager.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRevertOptions } from '../../../../common/editor.js';

export const IDataExplorerService = createDecorator<IDataExplorerService>('dataExplorerService');

/**
 * Service for managing data explorer operations
 */
export interface IDataExplorerService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when data is loaded
	 */
	readonly onDidLoadData: Event<GridData>;

	/**
	 * Event fired when data is changed (full reload, e.g., file import)
	 */
	readonly onDidChangeData: Event<GridData>;

	/**
	 * Event fired when existing data is mutated (edits, sorts, etc.) without full reload
	 */
	readonly onDidMutateData: Event<void>;

	/**
	 * Event fired when a cell is edited
	 */
	readonly onDidEditCell: Event<{ row: number; col: number; oldValue: any; newValue: any }>;

	/**
	 * Event fired when the dirty state of a resource changes
	 */
	readonly onDidChangeDirty: Event<URI>;

	/**
	 * Load data from a file
	 */
	loadDataFromFile(file: File): Promise<GridData>;

	/**
	 * Get the current data
	 */
	getCurrentData(): GridData | undefined;

	/**
	 * Set the current data
	 */
	setCurrentData(data: GridData, clearHistory?: boolean): void;

	/**
	 * Get the data store instance
	 */
	getDataStore(): DataStore | undefined;

	/**
	 * Remove a column
	 */
	removeColumn(index: number): void;

	/**
	 * Remove a row
	 */
	removeRow(index: number): void;

	/**
	 * Clear all data
	 */
	clearData(): void;

	/**
	 * Get data statistics
	 */
	getDataStatistics(): {
		totalRows: number;
		totalColumns: number;
	};

	/**
	 * Add a sort to the sort manager
	 */
	addSort(columnIndex: number, ascending: boolean): void;

	/**
	 * Remove a sort from the sort manager
	 */
	removeSort(columnIndex: number): void;

	/**
	 * Clear all sorts
	 */
	clearSorts(): void;

	/**
	 * Get all current sort keys
	 */
	getSortKeys(): SortKey[];

	/**
	 * Get sort key for a specific column
	 */
	getSortForColumn(columnIndex: number): SortKey | undefined;

	/**
	 * Get the history manager instance
	 */
	getHistoryManager(): HistoryManager;

	/**
	 * Edit a cell using the command pattern (with undo/redo support)
	 */
	editCellWithHistory(row: number, col: number, value: any): void;

	/**
	 * Replace all cells with the given replacements as a single undo operation
	 */
	replaceAllWithHistory(replacements: { row: number; col: number; oldValue: any; newValue: any }[]): number;

	/**
	 * Undo the last operation
	 */
	undo(): boolean;

	/**
	 * Redo the last undone operation
	 */
	redo(): boolean;

	/**
	 * Check if undo is possible
	 */
	canUndo(): boolean;

	/**
	 * Check if redo is possible
	 */
	canRedo(): boolean;

	/**
	 * Clear all history
	 */
	clearHistory(): void;

	/**
	 * Get description of next undo operation
	 */
	getUndoDescription(): string | undefined;

	/**
	 * Get description of next redo operation
	 */
	getRedoDescription(): string | undefined;

	/**
	 * Delete multiple cells using the command pattern (with undo/redo support)
	 */
	deleteCellsWithHistory(cellPositions: Array<{row: number, col: number}>): void;

	/**
	 * Insert a row with history support (with undo/redo support)
	 */
	insertRowWithHistory(index: number, rowData?: any[]): void;

	/**
	 * Insert a column with history support (with undo/redo support)
	 */
	insertColumnWithHistory(index: number, columnSchema?: ColumnSchema): void;

	/**
	 * Get the clipboard manager instance
	 */
	getClipboardManager(): ClipboardManager;

	/**
	 * Copy cells to clipboard with history support
	 */
	copyWithHistory(cellPositions: Array<{row: number, col: number}>, sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}): void;

	/**
	 * Cut cells to clipboard with history support
	 */
	cutWithHistory(cellPositions: Array<{row: number, col: number}>, sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}): void;

	/**
	 * Paste cells from clipboard with history support
	 */
	pasteWithHistory(targetStartRow: number, targetStartColumn: number): void;

	/**
	 * Check if clipboard has data available for pasting
	 */
	canPaste(): boolean;

	/**
	 * Get the size of the clipboard data (for UI feedback)
	 */
	getClipboardDataSize(): {rows: number, columns: number} | null;

	/**
	 * Set a filter for a column
	 */
	setColumnFilter(columnIndex: number, selectedValues: Set<string>, searchTerm?: string): void;

	/**
	 * Remove a filter from a column
	 */
	removeColumnFilter(columnIndex: number): void;

	/**
	 * Clear all filters
	 */
	clearAllFilters(): void;

	/**
	 * Get unique values for a column
	 */
	getUniqueValuesForColumn(columnIndex: number): string[];

	/**
	 * Get the current filter state
	 */
	getFilterState(): FilterState | undefined;

	/**
	 * Check if a column is currently filtered
	 */
	isColumnFiltered(columnIndex: number): boolean;

	/**
	 * Get the original row index for a filtered row
	 */
	getOriginalRowIndex(filteredRowIndex: number): number;

	/**
	 * Check if a resource is dirty (has unsaved changes)
	 */
	isDirty(resource: URI): boolean;

	/**
	 * Set the dirty state for a resource
	 */
	setDirty(resource: URI, dirty: boolean): void;

	/**
	 * Revert changes for a resource to its original state
	 */
	revert(resource: URI, options?: IRevertOptions): Promise<void>;

	/**
	 * Associate data with a resource for dirty state tracking
	 */
	setResourceData(resource: URI, data: GridData, originalData: GridData): void;

	/**
	 * Get data for a specific resource
	 */
	getResourceData(resource: URI): GridData | undefined;

	/**
	 * Get original data for a specific resource
	 */
	getOriginalResourceData(resource: URI): GridData | undefined;

	/**
	 * Update only the current data for a resource without changing dirty state
	 */
	updateResourceData(resource: URI, data: GridData): void;
}

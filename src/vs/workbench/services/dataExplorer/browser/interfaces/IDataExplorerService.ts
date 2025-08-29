/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { GridData, ColumnSchema, DataStore } from '../../common/dataExplorerTypes.js';
import { SortKey } from '../sortManager.js';
import { HistoryManager } from '../historyManager.js';
import { ClipboardManager } from '../clipboardManager.js';

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
	 * Event fired when data is changed
	 */
	readonly onDidChangeData: Event<GridData>;

	/**
	 * Event fired when a cell is edited
	 */
	readonly onDidEditCell: Event<{ row: number; col: number; oldValue: any; newValue: any }>;

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
	setCurrentData(data: GridData): void;

	/**
	 * Get the data store instance
	 */
	getDataStore(): DataStore | undefined;

	/**
	 * Edit a cell value
	 */
	editCell(row: number, col: number, value: any): void;

	/**
	 * Sort data by column
	 */
	sortByColumn(columnIndex: number, ascending: boolean): void;

	/**
	 * Add a new column
	 */
	addColumn(schema: ColumnSchema): void;

	/**
	 * Remove a column
	 */
	removeColumn(index: number): void;

	/**
	 * Remove a row
	 */
	removeRow(index: number): void;

	/**
	 * Insert a new row at the specified index
	 */
	insertRow(index: number, rowData?: any[]): void;

	/**
	 * Insert a new column at the specified index
	 */
	insertColumn(index: number, columnSchema?: ColumnSchema): void;

	/**
	 * Save data to file
	 */
	saveDataToFile(filename: string, format?: 'csv' | 'tsv'): Promise<void>;

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
	 * Check if any cell is currently being edited
	 */
	isAnyCellEditing(): boolean;

	/**
	 * Wrap text in the current selection by adjusting row heights
	 */
	wrapTextInSelection(): void;

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
}

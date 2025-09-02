/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IDataExplorerService } from './interfaces/IDataExplorerService.js';
import { GridData, ColumnSchema, FilterState } from '../common/dataExplorerTypes.js';
import { DataStore } from './core/dataStore.js';
import { URI } from '../../../../base/common/uri.js';
import { IRevertOptions } from '../../../common/editor.js';
import { FileLoader } from './io/fileLoader.js';
import { SortManager, SortKey } from './filtering/sortManager.js';
import { DataSorter } from './filtering/dataSorter.js';
import { HistoryManager } from './editing/historyManager.js';
import { 
	EditCellCommand, 
	DeleteCellsCommand, 
	InsertRowCommand, 
	InsertColumnCommand, 
	CopyCommand, 
	PasteCommand, 
	CutPasteCommand, 
	ReplaceAllCommand, 
	CellReplacement 
} from './editing/editManager.js';
import { ClipboardManager } from './editing/clipboardManager.js';

export class DataExplorerService extends Disposable implements IDataExplorerService {

	declare readonly _serviceBrand: undefined;

	private _currentData: GridData | undefined;
	private _dataStore: DataStore | undefined;
	private _sortManager: SortManager;
	private _historyManager: HistoryManager;
	private _clipboardManager: ClipboardManager;

	// Resource-based tracking for dirty state management
	private readonly _resourceData = new Map<string, GridData>();
	private readonly _originalResourceData = new Map<string, GridData>();
	private readonly _dirtyResources = new Set<string>();

	private readonly _onDidLoadData = this._register(new Emitter<GridData>());
	readonly onDidLoadData: Event<GridData> = this._onDidLoadData.event;

	private readonly _onDidChangeData = this._register(new Emitter<GridData>());
	readonly onDidChangeData: Event<GridData> = this._onDidChangeData.event;

	private readonly _onDidMutateData = this._register(new Emitter<void>());
	readonly onDidMutateData: Event<void> = this._onDidMutateData.event;

	private readonly _onDidEditCell = this._register(new Emitter<{ row: number; col: number; oldValue: any; newValue: any }>());
	readonly onDidEditCell: Event<{ row: number; col: number; oldValue: any; newValue: any }> = this._onDidEditCell.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<URI>());
	readonly onDidChangeDirty: Event<URI> = this._onDidChangeDirty.event;

	constructor() {
		super();
		this._sortManager = new SortManager();
		this._historyManager = this._register(new HistoryManager());
		this._clipboardManager = this._register(new ClipboardManager());

		// Subscribe to history manager events to sync current data and fire mutation events
		this._register(this._historyManager.onDidExecuteCommand(() => {
			// Sync service's current data with DataStore's updated data
			if (this._dataStore) {
				this._currentData = this._dataStore.getData();
			}
			// Fire mutation event to tell React to re-render with current data
			this._onDidMutateData.fire();
		}));

		this._register(this._historyManager.onDidUndo(() => {
			// Sync service's current data with DataStore's updated data
			if (this._dataStore) {
				this._currentData = this._dataStore.getData();
			}
			// Fire mutation event to tell React to re-render with current data
			this._onDidMutateData.fire();
		}));

		this._register(this._historyManager.onDidRedo(() => {
			// Sync service's current data with DataStore's updated data
			if (this._dataStore) {
				this._currentData = this._dataStore.getData();
			}
			// Fire mutation event to tell React to re-render with current data
			this._onDidMutateData.fire();
		}));
	}

	async loadDataFromFile(file: File): Promise<GridData> {
		try {
			const data = await FileLoader.loadFile(file);
			this.setCurrentData(data, true); // Clear history for new file loads
			this._onDidLoadData.fire(data);
			
			return data;
		} catch (error) {
			throw new Error(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	getCurrentData(): GridData | undefined {
		return this._currentData;
	}

	setCurrentData(data: GridData, clearHistory: boolean = true): void {
		this._currentData = data;
		this._dataStore = new DataStore(data);
		// Only clear history when explicitly requested (e.g., new file loads)
		if (clearHistory) {
			this._historyManager.clear();
		}
		this._onDidChangeData.fire(data);
	}

	getDataStore(): DataStore | undefined {
		return this._dataStore;
	}

	addSort(columnIndex: number, ascending: boolean): void {
		if (!this._currentData) {
			throw new Error('No data loaded');
		}

		this._sortManager.addSort(columnIndex, ascending);
		this.applySorts();
	}

	removeSort(columnIndex: number): void {
		if (!this._currentData) {
			throw new Error('No data loaded');
		}

		this._sortManager.removeSort(columnIndex);
		this.applySorts();
	}

	clearSorts(): void {
		if (!this._currentData) {
			throw new Error('No data loaded');
		}

		this._sortManager.clearSorts();
		this.applySorts();
	}

	getSortKeys(): SortKey[] {
		return this._sortManager.getSortKeys();
	}

	getSortForColumn(columnIndex: number): SortKey | undefined {
		return this._sortManager.getSortForColumn(columnIndex);
	}

	private applySorts(): void {
		if (!this._currentData) {
			return;
		}

		const sortKeys = this._sortManager.getSortKeys();
		const sortedData = DataSorter.sortData(this._currentData, sortKeys);
		this._currentData = sortedData;
		
		// Update the data store with sorted data
		if (this._dataStore) {
			this._dataStore = new DataStore(sortedData);
		}
		
		// Sync service's current data with DataStore's updated data
		if (this._dataStore) {
			this._currentData = this._dataStore.getData();
		}
		// Fire mutation event to tell React to re-render with current data
		this._onDidMutateData.fire();
	}



	removeColumn(index: number): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.removeColumn(index);
		// Sync service's current data with DataStore's updated data
		this._currentData = this._dataStore.getData();
		// Fire mutation event to tell React to re-render with current data
		this._onDidMutateData.fire();
	}

	removeRow(index: number): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.removeRow(index);
		// Sync service's current data with DataStore's updated data
		this._currentData = this._dataStore.getData();
		// Fire mutation event to tell React to re-render with current data
		this._onDidMutateData.fire();
	}





	clearData(): void {
		this._currentData = undefined;
		this._dataStore = undefined;
		// Note: We don't fire events for clearing data to avoid unnecessary UI updates
	}

	getDataStatistics(): {
		totalRows: number;
		totalColumns: number;
	} {
		if (!this._currentData) {
			return {
				totalRows: 0,
				totalColumns: 0
			};
		}

		return {
			totalRows: this._currentData.metadata.totalRows,
			totalColumns: this._currentData.columns.length
		};
	}

	getHistoryManager(): HistoryManager {
		return this._historyManager;
	}

	editCellWithHistory(row: number, col: number, value: any): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		const oldValue = this._dataStore.getCell(row, col);
		
		// Only create command if value actually changed
		if (oldValue !== value) {
			const command = new EditCellCommand(this._dataStore, row, col, value, oldValue);
			this._historyManager.executeCommand(command);
			
			// Fire the edit cell event
			this._onDidEditCell.fire({ row, col, oldValue, newValue: value });
		}
	}

	replaceAllWithHistory(replacements: CellReplacement[]): number {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		// Filter out replacements where value doesn't actually change
		const actualReplacements: CellReplacement[] = [];
		for (const replacement of replacements) {
			const currentValue = this._dataStore.getCell(replacement.row, replacement.col);
			if (currentValue !== replacement.newValue) {
				actualReplacements.push({
					...replacement,
					oldValue: currentValue // Use actual current value
				});
			}
		}

		if (actualReplacements.length === 0) {
			return 0;
		}

		const command = new ReplaceAllCommand(this._dataStore, actualReplacements);
		this._historyManager.executeCommand(command);

		// Fire edit cell events for all replacements
		for (const replacement of actualReplacements) {
			this._onDidEditCell.fire({ 
				row: replacement.row, 
				col: replacement.col, 
				oldValue: replacement.oldValue, 
				newValue: replacement.newValue 
			});
		}

		return actualReplacements.length;
	}

	undo(): boolean {
		return this._historyManager.undo();
	}

	redo(): boolean {
		return this._historyManager.redo();
	}

	canUndo(): boolean {
		return this._historyManager.canUndo();
	}

	canRedo(): boolean {
		return this._historyManager.canRedo();
	}

	clearHistory(): void {
		this._historyManager.clear();
	}

	getUndoDescription(): string | undefined {
		return this._historyManager.getUndoDescription();
	}

	getRedoDescription(): string | undefined {
		return this._historyManager.getRedoDescription();
	}

	deleteCellsWithHistory(cellPositions: Array<{row: number, col: number}>): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		if (cellPositions.length === 0) {
			return;
		}

		// Collect old values for undo
		const oldValues = new Map<string, any>();
		cellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			oldValues.set(key, this._dataStore!.getCell(row, col));
		});

		// Filter out any values that are already empty to avoid unnecessary operations
		const cellsToDelete = cellPositions.filter(({row, col}) => {
			const currentValue = this._dataStore!.getCell(row, col);
			return currentValue !== '' && currentValue !== null && currentValue !== undefined;
		});

		if (cellsToDelete.length === 0) {
			return; // Nothing to delete
		}

		const command = new DeleteCellsCommand(this._dataStore, cellsToDelete, oldValues);
		this._historyManager.executeCommand(command);

		// Fire edit events for each cell that was actually deleted
		cellsToDelete.forEach(({row, col}) => {
			const key = `${row},${col}`;
			const oldValue = oldValues.get(key);
			this._onDidEditCell.fire({ row, col, oldValue, newValue: '' });
		});
	}

	insertRowWithHistory(index: number, rowData?: any[]): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		const command = new InsertRowCommand(this._dataStore, index, rowData);
		this._historyManager.executeCommand(command);
	}

	insertColumnWithHistory(index: number, columnSchema?: ColumnSchema): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		const command = new InsertColumnCommand(this._dataStore, index, columnSchema);
		this._historyManager.executeCommand(command);
	}

	getClipboardManager(): ClipboardManager {
		return this._clipboardManager;
	}

	copyWithHistory(cellPositions: Array<{row: number, col: number}>, sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		if (cellPositions.length === 0) {
			return;
		}

		const command = new CopyCommand(this._dataStore, this._clipboardManager, cellPositions, sourceRange);
		this._historyManager.executeCommand(command);
	}

	cutWithHistory(cellPositions: Array<{row: number, col: number}>, sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		if (cellPositions.length === 0) {
			return;
		}

		// For cut operation: just store in clipboard, do NOT modify data store or add to history yet
		// The data store changes and history entry will be created when paste is called
		const values = new Map<string, any>();
		cellPositions.forEach(({row, col}) => {
			const key = `${row},${col}`;
			const value = this._dataStore!.getCell(row, col);
			values.set(key, value);
			// DON'T clear the cell yet - that will be done by the compound command
		});

		// Store in clipboard as cut operation
		this._clipboardManager.cut(values, sourceRange);

		// DON'T fire edit events yet - those will be fired when the compound command executes
		// The UI will show visual feedback through clipboardRange state
	}

	pasteWithHistory(targetStartRow: number, targetStartColumn: number): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		if (!this._clipboardManager.hasData()) {
			throw new Error('No data in clipboard to paste');
		}

		const clipboardData = this._clipboardManager.getClipboardData()!;

		if (clipboardData.operation === 'cut') {
			// This is a cut-paste operation - create compound command
			this.executeCutPasteCommand(targetStartRow, targetStartColumn, clipboardData);
		} else {
			// Regular copy-paste operation
			const command = new PasteCommand(this._dataStore, this._clipboardManager, targetStartRow, targetStartColumn);
			this._historyManager.executeCommand(command);

			// Fire edit events for each cell that was pasted
			const targetCellPositions = command.getTargetCellPositions();
			const oldValues = command.getOldValues();

			targetCellPositions.forEach(({row, col}) => {
				const key = `${row},${col}`;
				const oldValue = oldValues.get(key);
				
				// Calculate source position within clipboard data
				const relativeRow = row - targetStartRow;
				const relativeCol = col - targetStartColumn;
				const sourceRow = clipboardData.sourceRange.startRow + relativeRow;
				const sourceCol = clipboardData.sourceRange.startColumn + relativeCol;
				const sourceKey = `${sourceRow},${sourceCol}`;
				const newValue = clipboardData.values.get(sourceKey);

				this._onDidEditCell.fire({ row, col, oldValue, newValue });
			});
		}
	}

	canPaste(): boolean {
		return this._clipboardManager.hasData();
	}

	getClipboardDataSize(): {rows: number, columns: number} | null {
		return this._clipboardManager.getDataSize();
	}

	/**
	 * Execute a cut-paste compound command that undoes/redoes as a single operation
	 */
	private executeCutPasteCommand(targetStartRow: number, targetStartColumn: number, clipboardData: any): void {
		if (!this._dataStore) {
			throw new Error('No data store available');
		}

		// Calculate source cell positions from clipboard data
		const sourceCellPositions: Array<{row: number, col: number}> = [];
		clipboardData.values.forEach((value: any, key: string) => {
			const [rowStr, colStr] = key.split(',');
			sourceCellPositions.push({ row: parseInt(rowStr, 10), col: parseInt(colStr, 10) });
		});

		// Create and execute the compound command - this goes into history as ONE operation
		const cutPasteCommand = new CutPasteCommand(
			this._dataStore,
			this._clipboardManager,
			sourceCellPositions,
			clipboardData.sourceRange,
			targetStartRow,
			targetStartColumn
		);

		this._historyManager.executeCommand(cutPasteCommand);

		// Fire edit events for affected cells
		// Source cells (restored to empty in the compound command)
		sourceCellPositions.forEach(({row, col}) => {
			const oldValue = (cutPasteCommand as any).getSourceCellOldValue(row, col);
			this._onDidEditCell.fire({ row, col, oldValue, newValue: '' });
		});

		// Target cells (now have the moved data)
		const targetCellPositions = cutPasteCommand.getTargetCellPositions();
		targetCellPositions.forEach(({row, col}) => {
			const oldValue = (cutPasteCommand as any).getTargetCellOldValue(row, col);
			const newValue = this._dataStore!.getCell(row, col);
			this._onDidEditCell.fire({ row, col, oldValue, newValue });
		});
	}

	// Filter-related methods
	setColumnFilter(columnIndex: number, selectedValues: Set<string>, searchTerm?: string): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.setColumnFilter(columnIndex, selectedValues, searchTerm);
		this._currentData = this._dataStore.getData();
		this._onDidMutateData.fire();
	}

	removeColumnFilter(columnIndex: number): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.removeColumnFilter(columnIndex);
		this._currentData = this._dataStore.getData();
		this._onDidMutateData.fire();
	}

	clearAllFilters(): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.clearAllFilters();
		this._currentData = this._dataStore.getData();
		this._onDidMutateData.fire();
	}

	getUniqueValuesForColumn(columnIndex: number): string[] {
		if (!this._dataStore) {
			throw new Error('No data loaded');
		}

		return this._dataStore.getUniqueValuesForColumn(columnIndex);
	}

	getFilterState(): FilterState | undefined {
		if (!this._dataStore) {
			return undefined;
		}

		return this._dataStore.getFilterState();
	}

	isColumnFiltered(columnIndex: number): boolean {
		if (!this._dataStore) {
			return false;
		}

		return this._dataStore.isColumnFiltered(columnIndex);
	}

	getOriginalRowIndex(filteredRowIndex: number): number {
		if (!this._dataStore) {
			return filteredRowIndex;
		}

		return this._dataStore.getOriginalRowIndex(filteredRowIndex);
	}

	// Resource-based dirty state management methods

	isDirty(resource: URI): boolean {
		const key = resource.toString();
		return this._dirtyResources.has(key);
	}

	setDirty(resource: URI, dirty: boolean): void {
		const key = resource.toString();
		const wasDirty = this._dirtyResources.has(key);

		if (dirty) {
			this._dirtyResources.add(key);
		} else {
			this._dirtyResources.delete(key);
		}

		if (wasDirty !== dirty) {
			this._onDidChangeDirty.fire(resource);
		}
	}

	async revert(resource: URI, options?: IRevertOptions): Promise<void> {
		const key = resource.toString();
		const originalData = this._originalResourceData.get(key);

		if (!originalData) {
			return;
		}

		// Restore the original data
		const restoredData = JSON.parse(JSON.stringify(originalData));
		this._resourceData.set(key, restoredData);
		
		// Update current data if this resource is the currently active one
		if (this._currentData && this._resourceData.get(key)) {
			this._currentData = restoredData;
			this._onDidChangeData.fire(restoredData);
		}

		// Mark as not dirty
		this.setDirty(resource, false);
	}

	setResourceData(resource: URI, data: GridData, originalData: GridData): void {
		const key = resource.toString();
		this._resourceData.set(key, data);
		this._originalResourceData.set(key, originalData);
		
		// Initially not dirty since we just loaded/set the data
		this.setDirty(resource, false);
	}

	getResourceData(resource: URI): GridData | undefined {
		const key = resource.toString();
		return this._resourceData.get(key);
	}

	getOriginalResourceData(resource: URI): GridData | undefined {
		const key = resource.toString();
		return this._originalResourceData.get(key);
	}

	updateResourceData(resource: URI, data: GridData): void {
		const key = resource.toString();
		this._resourceData.set(key, data);
		
		// Update current data if this resource is the currently active one
		if (this._currentData) {
			this._currentData = data;
		}
	}
}

registerSingleton(IDataExplorerService, DataExplorerService, InstantiationType.Delayed);

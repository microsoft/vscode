/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IDataExplorerService } from './interfaces/IDataExplorerService.js';
import { GridData, ColumnSchema, DataStore } from '../common/dataExplorerTypes.js';
import { FileLoader } from './fileLoader.js';
import { SortManager, SortKey } from './sortManager.js';
import { DataSorter } from './dataSorter.js';
import { FileSaver } from './fileSaver.js';
import { HistoryManager } from './historyManager.js';
import { EditCellCommand } from './commands/editCellCommand.js';
import { DeleteCellsCommand } from './commands/deleteCellsCommand.js';
import { InsertRowCommand } from './commands/insertRowCommand.js';
import { InsertColumnCommand } from './commands/insertColumnCommand.js';
import { ClipboardManager } from './clipboardManager.js';
import { CopyCommand } from './commands/copyCommand.js';
import { CutCommand } from './commands/cutCommand.js';
import { PasteCommand } from './commands/pasteCommand.js';

export class DataExplorerService extends Disposable implements IDataExplorerService {

	declare readonly _serviceBrand: undefined;

	private _currentData: GridData | undefined;
	private _dataStore: DataStore | undefined;
	private _sortManager: SortManager;
	private _historyManager: HistoryManager;
	private _clipboardManager: ClipboardManager;

	private readonly _onDidLoadData = this._register(new Emitter<GridData>());
	readonly onDidLoadData: Event<GridData> = this._onDidLoadData.event;

	private readonly _onDidChangeData = this._register(new Emitter<GridData>());
	readonly onDidChangeData: Event<GridData> = this._onDidChangeData.event;

	private readonly _onDidEditCell = this._register(new Emitter<{ row: number; col: number; oldValue: any; newValue: any }>());
	readonly onDidEditCell: Event<{ row: number; col: number; oldValue: any; newValue: any }> = this._onDidEditCell.event;

	constructor() {
		super();
		this._sortManager = new SortManager();
		this._historyManager = this._register(new HistoryManager());
		this._clipboardManager = this._register(new ClipboardManager());

		// Subscribe to history manager events and re-fire data change events
		this._register(this._historyManager.onDidExecuteCommand(() => {
			if (this._currentData && this._dataStore) {
				this._currentData = this._dataStore.getData();
				this._onDidChangeData.fire(this._currentData);
			}
		}));

		this._register(this._historyManager.onDidUndo(() => {
			if (this._currentData && this._dataStore) {
				this._currentData = this._dataStore.getData();
				this._onDidChangeData.fire(this._currentData);
			}
		}));

		this._register(this._historyManager.onDidRedo(() => {
			if (this._currentData && this._dataStore) {
				this._currentData = this._dataStore.getData();
				this._onDidChangeData.fire(this._currentData);
			}
		}));
	}

	async loadDataFromFile(file: File): Promise<GridData> {
		try {
			const data = await FileLoader.loadFile(file);
			this.setCurrentData(data);
			this._onDidLoadData.fire(data);
			
			return data;
		} catch (error) {
			throw new Error(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	getCurrentData(): GridData | undefined {
		return this._currentData;
	}

	setCurrentData(data: GridData): void {
		this._currentData = data;
		this._dataStore = new DataStore(data);
		// Clear history when new data is loaded
		this._historyManager.clear();
		this._onDidChangeData.fire(data);
	}

	getDataStore(): DataStore | undefined {
		return this._dataStore;
	}

	editCell(row: number, col: number, value: any): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		const oldValue = this._dataStore.getCell(row, col);
		this._dataStore.setCell(row, col, value);
		
		// Update current data reference
		this._currentData = this._dataStore.getData();
		
		this._onDidEditCell.fire({ row, col, oldValue, newValue: value });
		this._onDidChangeData.fire(this._currentData);
	}

	sortByColumn(columnIndex: number, ascending: boolean): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.sortColumn(columnIndex, ascending);
		this._currentData = this._dataStore.getData();
		this._onDidChangeData.fire(this._currentData);
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
		
		this._onDidChangeData.fire(this._currentData);
	}

	addColumn(schema: ColumnSchema): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.addColumn(schema);
		this._currentData = this._dataStore.getData();
		this._onDidChangeData.fire(this._currentData);
	}

	removeColumn(index: number): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.removeColumn(index);
		this._currentData = this._dataStore.getData();
		this._onDidChangeData.fire(this._currentData);
	}

	removeRow(index: number): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.removeRow(index);
		this._currentData = this._dataStore.getData();
		this._onDidChangeData.fire(this._currentData);
	}

	insertRow(index: number, rowData?: any[]): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.insertRow(index, rowData);
		this._currentData = this._dataStore.getData();
		this._onDidChangeData.fire(this._currentData);
	}

	insertColumn(index: number, columnSchema?: ColumnSchema): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		this._dataStore.insertColumn(index, columnSchema);
		this._currentData = this._dataStore.getData();
		this._onDidChangeData.fire(this._currentData);
	}

	async saveDataToFile(filename: string, format: 'csv' | 'tsv' = 'csv'): Promise<void> {
		if (!this._currentData) {
			throw new Error('No data to save');
		}

		try {
			// Create a copy of the data with the specified filename for saving
			const dataToSave: GridData = {
				...this._currentData,
				metadata: {
					...this._currentData.metadata,
					fileName: filename
				}
			};

			// Use FileSaver to save the file as a download
			await FileSaver.saveFile(dataToSave, format);
		} catch (error) {
			throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
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

	isAnyCellEditing(): boolean {
		// This will be implemented by tracking editing state in the UI layer
		// For now, we'll add this method to the interface but the actual state
		// tracking will be done in the DataGrid component
		return false;
	}

	wrapTextInSelection(): void {
		// This will be implemented by the DataGrid component since it has access to
		// the current selection state and row height management
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

		const command = new CutCommand(this._dataStore, this._clipboardManager, cellPositions, sourceRange);
		this._historyManager.executeCommand(command);

		// Fire edit events for each cell that was cut
		cellPositions.forEach(({row, col}) => {
			const oldValue = this._dataStore!.getCell(row, col);
			this._onDidEditCell.fire({ row, col, oldValue, newValue: '' });
		});
	}

	pasteWithHistory(targetStartRow: number, targetStartColumn: number): void {
		if (!this._dataStore || !this._currentData) {
			throw new Error('No data loaded');
		}

		if (!this._clipboardManager.hasData()) {
			throw new Error('No data in clipboard to paste');
		}

		const command = new PasteCommand(this._dataStore, this._clipboardManager, targetStartRow, targetStartColumn);
		this._historyManager.executeCommand(command);

		// Fire edit events for each cell that was pasted
		const targetCellPositions = command.getTargetCellPositions();
		const oldValues = command.getOldValues();
		const clipboardData = command.getClipboardData();

		// Calculate what the new values will be based on clipboard data
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

	canPaste(): boolean {
		return this._clipboardManager.hasData();
	}

	getClipboardDataSize(): {rows: number, columns: number} | null {
		return this._clipboardManager.getDataSize();
	}
}

registerSingleton(IDataExplorerService, DataExplorerService, InstantiationType.Delayed);

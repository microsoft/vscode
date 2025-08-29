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

export class DataExplorerService extends Disposable implements IDataExplorerService {

	declare readonly _serviceBrand: undefined;

	private _currentData: GridData | undefined;
	private _dataStore: DataStore | undefined;
	private _sortManager: SortManager;
	private _historyManager: HistoryManager;

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

	async saveDataToFile(filename: string, format: 'csv' | 'tsv' | 'xlsx' = 'csv'): Promise<void> {
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
}

registerSingleton(IDataExplorerService, DataExplorerService, InstantiationType.Delayed);

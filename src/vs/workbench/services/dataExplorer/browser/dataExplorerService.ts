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

export class DataExplorerService extends Disposable implements IDataExplorerService {

	declare readonly _serviceBrand: undefined;

	private _currentData: GridData | undefined;
	private _dataStore: DataStore | undefined;

	private readonly _onDidLoadData = this._register(new Emitter<GridData>());
	readonly onDidLoadData: Event<GridData> = this._onDidLoadData.event;

	private readonly _onDidChangeData = this._register(new Emitter<GridData>());
	readonly onDidChangeData: Event<GridData> = this._onDidChangeData.event;

	private readonly _onDidEditCell = this._register(new Emitter<{ row: number; col: number; oldValue: any; newValue: any }>());
	readonly onDidEditCell: Event<{ row: number; col: number; oldValue: any; newValue: any }> = this._onDidEditCell.event;

	constructor() {
		super();
		console.log('DataExplorerService: Constructor called - service is being registered');
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
			// Save functionality will be implemented in Phase 6
			throw new Error('Save functionality not yet implemented');
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
		columnTypes: Record<string, number>;
	} {
		if (!this._currentData) {
			return {
				totalRows: 0,
				totalColumns: 0,
				columnTypes: {}
			};
		}

		const columnTypes: Record<string, number> = {};
		this._currentData.columns.forEach(col => {
			columnTypes[col.type] = (columnTypes[col.type] || 0) + 1;
		});

		return {
			totalRows: this._currentData.metadata.totalRows,
			totalColumns: this._currentData.columns.length,
			columnTypes
		};
	}
}

registerSingleton(IDataExplorerService, DataExplorerService, InstantiationType.Delayed);

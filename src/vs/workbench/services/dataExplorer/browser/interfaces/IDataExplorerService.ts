/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { GridData, ColumnSchema, DataStore } from '../../common/dataExplorerTypes.js';

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
	 * Save data to file
	 */
	saveDataToFile(filename: string, format?: 'csv' | 'tsv' | 'xlsx'): Promise<void>;

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
		columnTypes: Record<string, number>;
	};
}

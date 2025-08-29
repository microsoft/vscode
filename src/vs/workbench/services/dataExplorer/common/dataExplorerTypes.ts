/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Core data type definitions for the Data Explorer
 */

export interface GridData {
	columns: ColumnSchema[];
	rows: any[][];
	metadata: DataMetadata;
}

export interface ColumnSchema {
	index: number;
	name: string;
	width: number;
}

export interface DataMetadata {
	totalRows: number;
	fileName: string;
	lastModified: Date;
}

/**
 * Data Store class for managing grid data operations
 */
export class DataStore {
	private data: GridData;

	constructor(initialData: GridData) {
		this.data = { ...initialData };
	}

	getData(): GridData {
		return this.data;
	}

	setCell(row: number, col: number, value: any): void {
		if (row >= 0 && row < this.data.rows.length && col >= 0 && col < this.data.columns.length) {
			this.data.rows[row][col] = value;
		}
	}

	getCell(row: number, col: number): any {
		if (row >= 0 && row < this.data.rows.length && col >= 0 && col < this.data.columns.length) {
			return this.data.rows[row][col];
		}
		return undefined;
	}

	sortColumn(columnIndex: number, ascending: boolean): void {
		if (columnIndex < 0 || columnIndex >= this.data.columns.length) {
			return;
		}

		this.data.rows.sort((a, b) => {
			const aVal = a[columnIndex];
			const bVal = b[columnIndex];
			const comparison = this.compareValues(aVal, bVal);
			return ascending ? comparison : -comparison;
		});
	}

	addColumn(schema: ColumnSchema): void {
		this.data.columns.push(schema);
		// Add empty values for the new column in all existing rows
		this.data.rows.forEach(row => {
			row.push('');
		});
	}

	removeColumn(index: number): void {
		if (index >= 0 && index < this.data.columns.length) {
			this.data.columns.splice(index, 1);
			// Remove the column from all rows
			this.data.rows.forEach(row => {
				row.splice(index, 1);
			});
			// Update column indices
			this.data.columns.forEach((col, i) => {
				col.index = i;
			});
		}
	}

	private compareValues(a: any, b: any): number {
		if (a === null || a === undefined) return -1;
		if (b === null || b === undefined) return 1;

		return String(a).localeCompare(String(b));
	}
}

/**
 * File Handler class for CSV/data file operations
 * Note: This is a placeholder - actual file operations are handled by FileLoader
 */
export class FileHandler {
	static async loadCSV(file: File): Promise<GridData> {
		// This method is deprecated - use FileLoader instead
		throw new Error('Use FileLoader.loadFile() instead');
	}

	static async saveCSV(data: GridData, filename: string): Promise<void> {
		// This method is deprecated - will be implemented in Phase 6
		throw new Error('Save functionality not yet implemented');
	}

	static parseCSVString(csv: string, fileName: string = 'data.csv'): GridData {
		// This method is deprecated - use FileLoader instead
		throw new Error('Use FileLoader.loadFile() instead');
	}

	static generateCSVString(data: GridData): string {
		// This method is deprecated - will be implemented in Phase 6
		throw new Error('Save functionality not yet implemented');
	}
}

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

	insertRow(index: number, rowData?: any[]): void {
		if (index >= 0 && index <= this.data.rows.length) {
			// Create new row with empty values or provided data
			const newRow = rowData || new Array(this.data.columns.length).fill('');
			// Ensure row has correct number of columns
			while (newRow.length < this.data.columns.length) {
				newRow.push('');
			}
			// Trim row if it has too many columns
			if (newRow.length > this.data.columns.length) {
				newRow.splice(this.data.columns.length);
			}
			
			this.data.rows.splice(index, 0, newRow);
			this.data.metadata.totalRows = this.data.rows.length;
		}
	}

	insertColumn(index: number, columnSchema?: ColumnSchema): void {
		if (index >= 0 && index <= this.data.columns.length) {
			// Create new column schema
			const newColumn: ColumnSchema = columnSchema || {
				index: index,
				name: `Column ${String.fromCharCode(65 + index)}`,
				width: 100
			};
			
			// Insert the column schema
			this.data.columns.splice(index, 0, newColumn);
			
			// Update column indices for all columns after the insertion point
			this.data.columns.forEach((col, i) => {
				col.index = i;
			});
			
			// Add empty values for the new column in all rows
			this.data.rows.forEach(row => {
				row.splice(index, 0, '');
			});
		}
	}

	removeRow(index: number): void {
		if (index >= 0 && index < this.data.rows.length) {
			this.data.rows.splice(index, 1);
			this.data.metadata.totalRows = this.data.rows.length;
		}
	}


}
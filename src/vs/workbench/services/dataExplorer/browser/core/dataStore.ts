/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GridData, ColumnSchema, ColumnFilter, FilterState } from '../../common/dataExplorerTypes.js';

/**
 * Data Store class for managing grid data operations
 */
export class DataStore {
	private data: GridData;
	private originalData: GridData;
	private filterState: FilterState;

	constructor(initialData: GridData) {
		this.data = { ...initialData };
		this.originalData = { ...initialData };
		this.filterState = {
			columnFilters: new Map(),
			isEnabled: false,
			filteredRowIndices: undefined
		};
	}

	getData(): GridData {
		return this.data;
	}

	setCell(row: number, col: number, value: any): void {
		if (row >= 0 && row < this.data.rows.length && col >= 0 && col < this.data.columns.length) {
			// Per-cell immutable update - only the specific cell gets new reference
			// This is the most granular approach for optimal React performance
			const newRows = [...this.data.rows];
			const newRow = [...newRows[row]];
			newRow[col] = value;
			newRows[row] = newRow;
			
			this.data = {
				...this.data,
				rows: newRows
			};
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
			// Immutable update with structural sharing
			this.data = {
				...this.data,
				columns: this.data.columns
					.filter((_, i) => i !== index)
					.map((col, i) => ({ ...col, index: i })), // Update indices
				rows: this.data.rows.map(row => 
					row.filter((_, i) => i !== index)
				)
			};
		}
	}

	insertRow(index: number, rowData?: any[]): void {
		if (index >= 0 && index <= this.data.rows.length) {
			// Create new row with empty values or provided data
			let newRow = rowData || new Array(this.data.columns.length).fill('');
			// Ensure row has correct number of columns
			while (newRow.length < this.data.columns.length) {
				newRow.push('');
			}
			// Trim row if it has too many columns
			if (newRow.length > this.data.columns.length) {
				newRow = newRow.slice(0, this.data.columns.length);
			}
			
			// Immutable update with structural sharing
			const newRows = [...this.data.rows];
			newRows.splice(index, 0, newRow);
			
			this.data = {
				...this.data,
				rows: newRows,
				metadata: {
					...this.data.metadata,
					totalRows: newRows.length
				}
			};
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
			
			// Immutable update with structural sharing
			const newColumns = [...this.data.columns];
			newColumns.splice(index, 0, newColumn);
			
			// Update column indices for all columns
			const updatedColumns = newColumns.map((col, i) => ({ ...col, index: i }));
			
			// Add empty values for the new column in all rows
			const newRows = this.data.rows.map(row => {
				const newRow = [...row];
				newRow.splice(index, 0, '');
				return newRow;
			});
			
			this.data = {
				...this.data,
				columns: updatedColumns,
				rows: newRows
			};
		}
	}

	removeRow(index: number): void {
		if (index >= 0 && index < this.data.rows.length) {
			// Immutable update with structural sharing
			const newRows = this.data.rows.filter((_, i) => i !== index);
			
			this.data = {
				...this.data,
				rows: newRows,
				metadata: {
					...this.data.metadata,
					totalRows: newRows.length
				}
			};
		}
	}

	// Filter-related methods
	getFilterState(): FilterState {
		return this.filterState;
	}

	setColumnFilter(columnIndex: number, selectedValues: Set<string>, searchTerm?: string): void {
		const columnFilter: ColumnFilter = {
			columnIndex,
			selectedValues,
			searchTerm
		};
		
		this.filterState.columnFilters.set(columnIndex, columnFilter);
		this.filterState.isEnabled = this.filterState.columnFilters.size > 0;
		this.applyFilters();
	}

	removeColumnFilter(columnIndex: number): void {
		this.filterState.columnFilters.delete(columnIndex);
		this.filterState.isEnabled = this.filterState.columnFilters.size > 0;
		this.applyFilters();
	}

	clearAllFilters(): void {
		this.filterState.columnFilters.clear();
		this.filterState.isEnabled = false;
		this.filterState.filteredRowIndices = undefined;
		this.data = { ...this.originalData };
	}

	getUniqueValuesForColumn(columnIndex: number): string[] {
		const values = new Set<string>();
		const rowsToCheck = this.originalData.rows;
		
		for (let row = 1; row < rowsToCheck.length; row++) { // Skip header row (row 0)
			const cellValue = rowsToCheck[row][columnIndex];
			const stringValue = String(cellValue ?? '');
			values.add(stringValue);
		}
		
		return Array.from(values).sort();
	}

	private applyFilters(): void {
		if (!this.filterState.isEnabled || this.filterState.columnFilters.size === 0) {
			this.data = { ...this.originalData };
			this.filterState.filteredRowIndices = undefined;
			return;
		}

		const filteredIndices: number[] = [0]; // Always include header row
		
		for (let rowIndex = 1; rowIndex < this.originalData.rows.length; rowIndex++) { // Skip header row
			let shouldIncludeRow = true;
			
			// Check all active filters
			for (const [columnIndex, filter] of this.filterState.columnFilters) {
				const cellValue = this.originalData.rows[rowIndex][columnIndex];
				const stringValue = String(cellValue ?? '');
				
				if (!filter.selectedValues.has(stringValue)) {
					shouldIncludeRow = false;
					break;
				}
			}
			
			if (shouldIncludeRow) {
				filteredIndices.push(rowIndex);
			}
		}
		
		this.filterState.filteredRowIndices = filteredIndices;
		
		// Create filtered data
		const filteredRows = filteredIndices.map(index => this.originalData.rows[index]);
		
		this.data = {
			...this.originalData,
			rows: filteredRows,
			metadata: {
				...this.originalData.metadata,
				totalRows: filteredRows.length
			}
		};
	}

	isColumnFiltered(columnIndex: number): boolean {
		return this.filterState.columnFilters.has(columnIndex);
	}

	getOriginalRowIndex(filteredRowIndex: number): number {
		if (!this.filterState.filteredRowIndices) {
			return filteredRowIndex;
		}
		return this.filterState.filteredRowIndices[filteredRowIndex] ?? filteredRowIndex;
	}

	getFilteredRowIndices(): number[] | undefined {
		return this.filterState.filteredRowIndices;
	}


}

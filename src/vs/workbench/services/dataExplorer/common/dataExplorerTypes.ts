/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
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

export interface ColumnFilter {
	columnIndex: number;
	selectedValues: Set<string>;
	searchTerm?: string;
}

export interface DataMetadata {
	totalRows: number;
	fileName: string;
	lastModified: Date;
}

export interface FilterState {
	columnFilters: Map<number, ColumnFilter>;
	isEnabled: boolean;
	filteredRowIndices?: number[];
}

export interface FilterDropdownState {
	isOpen: boolean;
	columnIndex: number;
	searchTerm: string;
	availableValues: string[];
	selectedValues: Set<string>;
	position: { x: number; y: number };
}


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { DataGridMatch, DataGridSearchParams, DataGridReplaceParams, DataGridSearchResult, IDataGridFindModel, IDataGridFindTarget } from './dataGridFindTypes.js';

export class DataGridFindModel extends Disposable implements IDataGridFindModel {

	constructor(private readonly _target: IDataGridFindTarget) {
		super();
	}

	public find(params: DataGridSearchParams): DataGridSearchResult {

		const matches: DataGridMatch[] = [];

		if (!params.searchString) {
			return { matches: [], currentMatchIndex: -1, totalMatches: 0 };
		}

		const searchRegex = this._createSearchRegex(params);
		if (!searchRegex) {
			return { matches: [], currentMatchIndex: -1, totalMatches: 0 };
		}

		const cellsToSearch = this._getCellsToSearch();

		for (let i = 0; i < cellsToSearch.length; i++) {
			const cell = cellsToSearch[i];
			const cellValue = this._target.getCellValue(cell.row, cell.column);
			const cellString = this._convertCellValueToString(cellValue);
			
			if (cellString) {
				const cellMatches = this._findMatchesInCellValue(cellString, searchRegex, cell.row, cell.column);
				matches.push(...cellMatches);
			}

		}

		return {
			matches,
			currentMatchIndex: matches.length > 0 ? 0 : -1,
			totalMatches: matches.length
		};
	}

	public replace(match: DataGridMatch, replaceString: string): boolean {
		try {
			const currentValue = this._target.getCellValue(match.row, match.column);
			const currentString = this._convertCellValueToString(currentValue);
			
			if (!currentString) {
				return false;
			}

			const beforeMatch = currentString.substring(0, match.range.start);
			const afterMatch = currentString.substring(match.range.end);
			const newString = beforeMatch + replaceString + afterMatch;

			const newValue = this._convertStringToCellValue(newString, currentValue);
			this._target.setCellValue(match.row, match.column, newValue);

			return true;
		} catch (error) {
		return false;
	}
	}

	public replaceAll(params: DataGridReplaceParams): number {
		const searchResult = this.find(params);
		
		// Collect all the replacements to be performed
		const replacements: Array<{ row: number; col: number; oldValue: any; newValue: any }> = [];
		
		for (const match of searchResult.matches) {
			const currentValue = this._target.getCellValue(match.row, match.column);
			const currentString = this._convertCellValueToString(currentValue);
			
			if (!currentString) {
				continue;
			}

			const beforeMatch = currentString.substring(0, match.range.start);
			const afterMatch = currentString.substring(match.range.end);
			const newString = beforeMatch + params.replaceString + afterMatch;

			const newValue = this._convertStringToCellValue(newString, currentValue);
			
			// Only add if value actually changes
			if (currentValue !== newValue) {
				replacements.push({
					row: match.row,
					col: match.column,
					oldValue: currentValue,
					newValue: newValue
				});
			}
		}

		return replacements.length;
	}

	public collectReplacements(params: DataGridReplaceParams): Array<{ row: number; col: number; oldValue: any; newValue: any }> {
		const searchResult = this.find(params);
		
		// Collect all the replacements to be performed
		const replacements: Array<{ row: number; col: number; oldValue: any; newValue: any }> = [];
		
		for (const match of searchResult.matches) {
			const currentValue = this._target.getCellValue(match.row, match.column);
			const currentString = this._convertCellValueToString(currentValue);
			
			if (!currentString) {
				continue;
			}

			const beforeMatch = currentString.substring(0, match.range.start);
			const afterMatch = currentString.substring(match.range.end);
			const newString = beforeMatch + params.replaceString + afterMatch;

			const newValue = this._convertStringToCellValue(newString, currentValue);
			
			// Only add if value actually changes
			if (currentValue !== newValue) {
				replacements.push({
					row: match.row,
					col: match.column,
					oldValue: currentValue,
					newValue: newValue
				});
			}
		}

		return replacements;
	}

	private _createSearchRegex(params: DataGridSearchParams): RegExp | null {
		try {
			let searchString = params.searchString;
			let flags = 'g';

			if (!params.matchCase) {
				flags += 'i';
			}

			if (!params.isRegex) {
				searchString = this._escapeRegexCharacters(searchString);
			}

			if (params.wholeWord) {
				searchString = `\\b${searchString}\\b`;
			}

			return new RegExp(searchString, flags);
		} catch (error) {
			return null;
		}
	}

	private _escapeRegexCharacters(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private _getCellsToSearch(): Array<{ row: number; column: number }> {
		const rowCount = this._target.getRowCount();
		const columnCount = this._target.getColumnCount();
		
		const MAX_CELLS = 10000;
		const cells: Array<{ row: number; column: number }> = [];
		let cellCount = 0;
		
		for (let row = 0; row < rowCount && cellCount < MAX_CELLS; row++) {
			for (let column = 0; column < columnCount && cellCount < MAX_CELLS; column++) {
				cells.push({ row, column });
				cellCount++;
			}
		}
		
		return cells;
	}

	private _findMatchesInCellValue(cellString: string, searchRegex: RegExp, row: number, column: number): DataGridMatch[] {
		const matches: DataGridMatch[] = [];
		let match: RegExpExecArray | null;

		searchRegex.lastIndex = 0;

		while ((match = searchRegex.exec(cellString)) !== null) {
			matches.push({
				row,
				column,
				range: { start: match.index, end: match.index + match[0].length },
				value: cellString
			});

			if (!searchRegex.global) {
				break;
			}

			if (match.index === searchRegex.lastIndex) {
				searchRegex.lastIndex++;
			}
		}

		return matches;
	}

	private _convertCellValueToString(value: any): string {
		if (value === null || value === undefined) {
			return '';
		}

		if (typeof value === 'string') {
			return value;
		}

		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}

		if (value instanceof Date) {
			return value.toISOString();
		}

		if (typeof value === 'object') {
			try {
				return JSON.stringify(value);
			} catch {
				return String(value);
			}
		}

		return String(value);
	}

	private _convertStringToCellValue(str: string, originalValue: any): any {
		if (originalValue === null || originalValue === undefined) {
			return str || null;
		}

		const originalType = typeof originalValue;

		switch (originalType) {
			case 'string':
				return str;

			case 'number':
				const numValue = Number(str);
				return isNaN(numValue) ? originalValue : numValue;

			case 'boolean':
				const lowerStr = str.toLowerCase().trim();
				if (lowerStr === 'true' || lowerStr === '1') {
					return true;
				} else if (lowerStr === 'false' || lowerStr === '0') {
					return false;
				}
				return originalValue;

			case 'object':
				if (originalValue instanceof Date) {
					const dateValue = new Date(str);
					return isNaN(dateValue.getTime()) ? originalValue : dateValue;
				}

				try {
					return JSON.parse(str);
				} catch {
					return str;
				}

			default:
				return str;
		}
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';

export interface DataGridCell {
	row: number;
	column: number;
	value: any;
}

export interface DataGridMatch {
	row: number;
	column: number;
	range: { start: number; end: number };
	value: string;
}

export interface DataGridSearchResult {
	matches: DataGridMatch[];
	currentMatchIndex: number;
	totalMatches: number;
}

export interface DataGridSearchParams {
	searchString: string;
	isRegex: boolean;
	matchCase: boolean;
	wholeWord: boolean;
}

export interface DataGridReplaceParams extends DataGridSearchParams {
	replaceString: string;
}

export interface IDataGridFindTarget {
	getCellValue(row: number, column: number): any;
	setCellValue(row: number, column: number, value: any): void;
	getRowCount(): number;
	getColumnCount(): number;
	getSelectedCells(): DataGridCell[];
	highlightMatches(matches: DataGridMatch[]): void;
	clearHighlights(): void;
	scrollToCell(row: number, column: number): void;
	selectCell(row: number, column: number): void;
	onDataChanged: Event<{ row: number; column: number; oldValue: any; newValue: any }>;
}

export interface IDataGridFindController {
	start(searchString?: string): void;
	close(): void;
	replace(): void;
	replaceAll(): void;
	findNext(): void;
	findPrevious(): void;
	getState(): IDataGridFindState;
}

export interface IDataGridFindState {
	searchString: string;
	replaceString: string;
	isRevealed: boolean;
	isReplaceRevealed: boolean;
	isRegex: boolean;
	matchCase: boolean;
	wholeWord: boolean;
	currentMatch: DataGridMatch | null;
	searchResults: DataGridSearchResult | null;
	onFindReplaceStateChange: Event<void>;
	changeSearchString(searchString: string): void;
	changeReplaceString(replaceString: string): void;
	changeIsRevealed(isRevealed: boolean): void;
	changeIsReplaceRevealed(isReplaceRevealed: boolean): void;
	changeIsRegex(isRegex: boolean): void;
	changeMatchCase(matchCase: boolean): void;
	changeWholeWord(wholeWord: boolean): void;
}

export interface IDataGridFindModel {
	find(params: DataGridSearchParams): DataGridSearchResult;
	replace(match: DataGridMatch, replaceString: string): boolean;
	replaceAll(params: DataGridReplaceParams): number;
	dispose(): void;
}



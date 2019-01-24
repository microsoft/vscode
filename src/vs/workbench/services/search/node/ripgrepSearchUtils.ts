/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startsWith } from 'vs/base/common/strings';
import { ILogService } from 'vs/platform/log/common/log';
import { SearchRange, TextSearchMatch } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';
import { mapArrayOrNot } from 'vs/base/common/arrays';

export type Maybe<T> = T | null | undefined;

export function anchorGlob(glob: string): string {
	return startsWith(glob, '**') || startsWith(glob, '/') ? glob : `/${glob}`;
}

/**
 * Create a vscode.TextSearchResult by using our internal TextSearchResult type for its previewOptions logic.
 */
export function createTextSearchResult(uri: vscode.Uri, text: string, range: Range | Range[], previewOptions?: vscode.TextSearchPreviewOptions): vscode.TextSearchMatch {
	const searchRange = mapArrayOrNot(range, rangeToSearchRange);

	const internalResult = new TextSearchMatch(text, searchRange, previewOptions);
	const internalPreviewRange = internalResult.preview.matches;
	return {
		ranges: mapArrayOrNot(searchRange, searchRangeToRange),
		uri,
		preview: {
			text: internalResult.preview.text,
			matches: mapArrayOrNot(internalPreviewRange, searchRangeToRange)
		}
	};
}

function rangeToSearchRange(range: Range): SearchRange {
	return new SearchRange(range.start.line, range.start.character, range.end.line, range.end.character);
}

function searchRangeToRange(range: SearchRange): Range {
	return new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}

export class Position {
	constructor(readonly line, readonly character) { }

	isBefore(other: Position): boolean { return false; }
	isBeforeOrEqual(other: Position): boolean { return false; }
	isAfter(other: Position): boolean { return false; }
	isAfterOrEqual(other: Position): boolean { return false; }
	isEqual(other: Position): boolean { return false; }
	compareTo(other: Position): number { return 0; }
	translate(lineDelta?: number, characterDelta?: number): Position;
	translate(change: { lineDelta?: number; characterDelta?: number; }): Position;
	translate(_?: any, _2?: any): Position { return new Position(0, 0); }
	with(line?: number, character?: number): Position;
	with(change: { line?: number; character?: number; }): Position;
	with(_: any): Position { return new Position(0, 0); }
}

export class Range {
	readonly start: Position;
	readonly end: Position;

	constructor(startLine: number, startCol: number, endLine: number, endCol: number) {
		this.start = new Position(startLine, startCol);
		this.end = new Position(endLine, endCol);
	}

	isEmpty: boolean;
	isSingleLine: boolean;
	contains(positionOrRange: Position | Range): boolean { return false; }
	isEqual(other: Range): boolean { return false; }
	intersection(range: Range): Range | undefined { return undefined; }
	union(other: Range): Range { return new Range(0, 0, 0, 0); }

	with(start?: Position, end?: Position): Range;
	with(change: { start?: Position, end?: Position }): Range;
	with(_: any): Range { return new Range(0, 0, 0, 0); }
}

export interface IOutputChannel {
	appendLine(msg: string): void;
}

export class OutputChannel implements IOutputChannel {
	constructor(@ILogService private readonly logService: ILogService) { }

	appendLine(msg: string): void {
		this.logService.debug('RipgrepSearchEH#search', msg);
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startsWith } from 'vs/base/common/strings';
import { ILogService } from 'vs/platform/log/common/log';
import { SearchRange, TextSearchResult } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';

export type Maybe<T> = T | null | undefined;

export function anchorGlob(glob: string): string {
	return startsWith(glob, '**') || startsWith(glob, '/') ? glob : `/${glob}`;
}

export function createTextSearchResult(uri: vscode.Uri, text: string, range: Range, previewOptions?: vscode.TextSearchPreviewOptions): vscode.TextSearchResult {
	const searchRange: SearchRange = {
		startLineNumber: range.start.line,
		startColumn: range.start.character,
		endLineNumber: range.end.line,
		endColumn: range.end.character,
	};

	const internalResult = new TextSearchResult(text, searchRange, previewOptions);
	const internalPreviewRange = internalResult.preview.match;
	return {
		range: new Range(internalResult.range.startLineNumber, internalResult.range.startColumn, internalResult.range.endLineNumber, internalResult.range.endColumn),
		uri,
		preview: {
			text: internalResult.preview.text,
			match: new Range(internalPreviewRange.startLineNumber, internalPreviewRange.startColumn, internalPreviewRange.endLineNumber, internalPreviewRange.endColumn),
		}
	};
}

export class Position {
	constructor(public readonly line, public readonly character) { }

	isBefore(other: Position): boolean { return false; }
	isBeforeOrEqual(other: Position): boolean { return false; }
	isAfter(other: Position): boolean { return false; }
	isAfterOrEqual(other: Position): boolean { return false; }
	isEqual(other: Position): boolean { return false; }
	compareTo(other: Position): number { return 0; }
	translate(lineDelta?: number, characterDelta?: number): Position;
	translate(change: { lineDelta?: number; characterDelta?: number; }): Position;
	translate(_: any) { return null; }
	with(line?: number, character?: number): Position;
	with(change: { line?: number; character?: number; }): Position;
	with(_: any): Position { return null; }
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
	intersection(range: Range): Range | undefined { return null; }
	union(other: Range): Range { return null; }

	with(start?: Position, end?: Position): Range;
	with(change: { start?: Position, end?: Position }): Range;
	with(_: any): Range { return null; }
}

export interface IOutputChannel {
	appendLine(msg: string): void;
}

export class OutputChannel implements IOutputChannel {
	constructor(@ILogService private logService: ILogService) { }

	appendLine(msg: string): void {
		this.logService.debug('RipgrepSearchEH#search', msg);
	}
}
